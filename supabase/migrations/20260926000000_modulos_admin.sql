-- =====================================================================
-- Módulos de administración: solicitudes de pedido, compras, finanzas
-- =====================================================================

-- ---------------------------------------------------------------------
-- Solicitudes de pedido
-- La empleada pide un insumo desde el POS (desde una alerta de stock o a
-- mano); los socios la ven, la compran o la descartan.
-- ---------------------------------------------------------------------
create type estado_solicitud as enum ('pendiente', 'comprada', 'descartada');

create table solicitudes_pedido (
  id              uuid primary key default gen_random_uuid(),
  insumo_id       bigint references insumos (id),
  descripcion     text not null,                 -- nombre del insumo o texto libre
  cantidad        numeric(14,3) check (cantidad is null or cantidad > 0),
  unidad          unidad_medida,
  nota            text,
  estado          estado_solicitud not null default 'pendiente',
  solicitado_por  uuid not null default auth.uid() references perfiles (id),
  creado_en       timestamptz not null default now(),
  atendido_por    uuid references perfiles (id),
  atendido_en     timestamptz,
  compra_id       uuid references compras (id) on delete set null,
  respuesta       text
);
create index on solicitudes_pedido (estado, creado_en desc);

alter table solicitudes_pedido enable row level security;
-- Cualquier usuario activo las ve (sin costos) y puede crear las suyas.
create policy solicitudes_lectura on solicitudes_pedido for select to authenticated
  using (rol_actual() is not null);
create policy solicitudes_crear on solicitudes_pedido for insert to authenticated
  with check (rol_actual() is not null and solicitado_por = auth.uid() and estado = 'pendiente');
-- Solo los socios las atienden.
create policy solicitudes_socios on solicitudes_pedido for update to authenticated
  using (es_socio()) with check (es_socio());
create policy solicitudes_socios_borrar on solicitudes_pedido for delete to authenticated
  using (es_socio());
grant select, insert, update, delete on solicitudes_pedido to authenticated;
revoke all on solicitudes_pedido from anon;

alter publication supabase_realtime add table solicitudes_pedido;

-- Lista de insumos para pedir desde el POS (sin costos).
create or replace function insumos_para_pedido()
returns table (insumo_id bigint, nombre text, unidad unidad_medida, stock_actual numeric, stock_minimo numeric)
language sql stable security definer set search_path = public as $$
  select id, nombre, unidad, stock_actual, stock_minimo
    from insumos
   where rol_actual() is not null and activo
   order by nombre
$$;

-- ---------------------------------------------------------------------
-- Registrar una compra completa (socios)
-- {
--   "fecha": "2026-09-26", "proveedor": "Calypso", "registrar_gasto": true,
--   "items": [{ "insumo_id": 1, "cantidad": 16, "costo_total": 31301 }],
--   "solicitudes": ["uuid", ...]
-- }
-- Suma stock, recalcula costo promedio (trigger), crea el gasto en la
-- categoría "Insumos" y marca las solicitudes como compradas.
-- ---------------------------------------------------------------------
create or replace function registrar_compra(p_compra jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_compra  uuid;
  v_gasto   uuid;
  v_total   bigint;
  v_fecha   date := coalesce((p_compra ->> 'fecha')::date, hoy_bogota());
  v_prov    text := nullif(trim(p_compra ->> 'proveedor'), '');
begin
  if not es_socio() then
    raise exception 'Solo un socio puede registrar compras' using errcode = '42501';
  end if;
  if jsonb_typeof(p_compra -> 'items') is distinct from 'array' or jsonb_array_length(p_compra -> 'items') = 0 then
    raise exception 'La compra no tiene productos' using errcode = '22023';
  end if;

  insert into compras (fecha, proveedor) values (v_fecha, v_prov) returning id into v_compra;

  insert into compra_items (compra_id, insumo_id, cantidad, costo_total)
  select v_compra, (i ->> 'insumo_id')::bigint, (i ->> 'cantidad')::numeric, (i ->> 'costo_total')::bigint
    from jsonb_array_elements(p_compra -> 'items') i;

  select sum(costo_total) into v_total from compra_items where compra_id = v_compra;

  if coalesce((p_compra ->> 'registrar_gasto')::boolean, true) and v_total > 0 then
    insert into gastos (fecha, categoria_id, monto, descripcion)
    values (v_fecha,
            (select id from categorias_gasto where nombre = 'Insumos'),
            v_total,
            'Compra de insumos' || coalesce(' · ' || v_prov, ''))
    returning id into v_gasto;
    update compras set gasto_id = v_gasto where id = v_compra;
  end if;

  update solicitudes_pedido
     set estado = 'comprada', atendido_por = auth.uid(), atendido_en = now(), compra_id = v_compra
   where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_compra -> 'solicitudes', '[]')))
     and estado = 'pendiente';

  return v_compra;
end $$;

-- ---------------------------------------------------------------------
-- Guardar un parámetro (nómina, arriendo, merma…) desde hoy en adelante.
-- El histórico se conserva: cada cambio es una fila con su fecha.
-- ---------------------------------------------------------------------
create or replace function guardar_parametro(p_clave text, p_valor numeric) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede cambiar parámetros' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 then
    raise exception 'Valor inválido' using errcode = '22023';
  end if;
  insert into parametros (clave, vigente_desde, valor, descripcion)
  values (p_clave, hoy_bogota(), p_valor,
          (select descripcion from parametros where clave = p_clave order by vigente_desde desc limit 1))
  on conflict (clave, vigente_desde) do update set valor = excluded.valor;
end $$;

-- ---------------------------------------------------------------------
-- Resumen financiero mes a mes (socios)
--   ingresos              ventas completadas
--   costo_insumos         lo que se consumió según recetas (sin merma)
--   comisiones            datáfono
--   margen                ingresos − costo insumos × (1 + merma) − comisiones
--   gastos_fijos          gastos tipo fijo
--   gastos_variables      gastos tipo variable que NO son compras de insumos
--   compras_insumos       gastos generados por compras (van al inventario)
--   inversion             gastos tipo inversión (equipos, cuotas a socios)
--   utilidad_operativa    margen − gastos fijos − gastos variables
--   flujo_caja            ingresos − comisiones − todos los gastos
-- ---------------------------------------------------------------------
create or replace function resumen_mensual(p_meses int default 6)
returns table (mes date, ventas bigint, perros bigint, ingresos bigint, costo_insumos bigint,
               comisiones bigint, margen bigint, gastos_fijos bigint, gastos_variables bigint,
               compras_insumos bigint, inversion bigint, utilidad_operativa bigint, flujo_caja bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;

  return query
  with meses as (
    select (date_trunc('month', hoy_bogota()) - make_interval(months => g))::date as m
      from generate_series(0, greatest(p_meses, 1) - 1) g
  ),
  v as (
    select date_trunc('month', vendida_en at time zone 'America/Bogota')::date as m,
           count(*) as ventas, sum(total) as ingresos, sum(costo_insumos) as costo,
           sum(comision_datafono) as comisiones
      from ventas where estado = 'completada'
     group by 1
  ),
  p as (
    select date_trunc('month', v.vendida_en at time zone 'America/Bogota')::date as m, sum(vi.cantidad) as perros
      from venta_items vi join ventas v on v.id = vi.venta_id
     where v.estado = 'completada' and vi.tipo_producto = 'perro'
     group by 1
  ),
  g as (
    select date_trunc('month', ga.fecha)::date as m,
           sum(ga.monto) filter (where cg.tipo = 'fijo') as fijos,
           sum(ga.monto) filter (where cg.tipo = 'variable' and c.id is null) as variables,
           sum(ga.monto) filter (where c.id is not null) as compras,
           sum(ga.monto) filter (where cg.tipo = 'inversion') as inversion,
           sum(ga.monto) as total
      from gastos ga
      join categorias_gasto cg on cg.id = ga.categoria_id
      left join compras c on c.gasto_id = ga.id
     group by 1
  )
  select meses.m,
         coalesce(v.ventas, 0)::bigint,
         coalesce(p.perros, 0)::bigint,
         coalesce(v.ingresos, 0)::bigint,
         round(coalesce(v.costo, 0))::bigint,
         coalesce(v.comisiones, 0)::bigint,
         round(coalesce(v.ingresos, 0) - coalesce(v.costo, 0) * (1 + coalesce(parametro('merma_pct', meses.m), 0) / 100)
               - coalesce(v.comisiones, 0))::bigint,
         coalesce(g.fijos, 0)::bigint,
         coalesce(g.variables, 0)::bigint,
         coalesce(g.compras, 0)::bigint,
         coalesce(g.inversion, 0)::bigint,
         round(coalesce(v.ingresos, 0) - coalesce(v.costo, 0) * (1 + coalesce(parametro('merma_pct', meses.m), 0) / 100)
               - coalesce(v.comisiones, 0) - coalesce(g.fijos, 0) - coalesce(g.variables, 0))::bigint,
         (coalesce(v.ingresos, 0) - coalesce(v.comisiones, 0) - coalesce(g.total, 0))::bigint
    from meses
    left join v on v.m = meses.m
    left join p on p.m = meses.m
    left join g on g.m = meses.m
   order by meses.m desc;
end $$;

-- ---------------------------------------------------------------------
-- Una compra real confirma el costo del insumo (deja de ser estimado).
-- ---------------------------------------------------------------------
create or replace function aplicar_compra_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_stock numeric;
  v_costo numeric;
begin
  select greatest(stock_actual, 0), costo_unitario into v_stock, v_costo
  from insumos where id = new.insumo_id for update;

  perform set_config('bpc.origen_costo', 'compra', true);
  perform set_config('bpc.motivo_costo', 'Compra ' || new.compra_id, true);
  update insumos
     set costo_unitario = round((v_stock * v_costo + new.costo_total) / (v_stock + new.cantidad), 4),
         es_estimado = false
   where id = new.insumo_id;
  perform set_config('bpc.origen_costo', '', true);

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, compra_id)
  values (new.insumo_id, 'compra', new.cantidad, round(new.costo_total / new.cantidad, 4), new.compra_id);
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on function insumos_para_pedido(), registrar_compra(jsonb),
                           guardar_parametro(text, numeric), resumen_mensual(int)
  from public, anon;
grant execute on function insumos_para_pedido(), registrar_compra(jsonb),
                          guardar_parametro(text, numeric), resumen_mensual(int)
  to authenticated;
