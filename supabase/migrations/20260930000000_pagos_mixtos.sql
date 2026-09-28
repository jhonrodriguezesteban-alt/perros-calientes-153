-- =====================================================================
-- Pagos con varios métodos (parte en efectivo, parte por Bold o Nequi)
--
-- * venta_pagos: cuánto se recibió por cada método en cada venta. Toda
--   venta pagada tiene al menos una fila; lo fiado no (se cobra después).
-- * ventas.metodo_pago = 'mixto' cuando se usó más de un método.
-- * Totales por método (cierre de caja, ventas de hoy, panel, punto de
--   equilibrio) se calculan desde venta_pagos.
-- Nota: 'mixto' no se usa como literal en este archivo (Postgres no lo
-- permite en la misma transacción en que se agrega al enum).
-- =====================================================================

alter type metodo_pago add value if not exists 'mixto';

create table venta_pagos (
  venta_id  uuid not null references ventas (id) on delete cascade,
  metodo    metodo_pago not null check (metodo::text in ('efectivo', 'datafono', 'nequi')),
  monto     bigint not null check (monto > 0),
  primary key (venta_id, metodo)
);

alter table venta_pagos enable row level security;
create policy venta_pagos_socios on venta_pagos for select to authenticated using (es_socio());
grant select on venta_pagos to authenticated;
revoke insert, update, delete on venta_pagos from authenticated;
revoke all on venta_pagos from anon;

-- Ventas anteriores: un pago por el total con su método
insert into venta_pagos (venta_id, metodo, monto)
select id, metodo_pago, total from ventas
 where metodo_pago::text in ('efectivo', 'datafono', 'nequi') and total > 0
on conflict do nothing;

-- ---------------------------------------------------------------------
-- registrar_venta: acepta "pagos" con uno o varios métodos
-- ---------------------------------------------------------------------
create or replace function registrar_venta(p_venta jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id          uuid := (p_venta ->> 'id')::uuid;
  v_metodo      metodo_pago := (p_venta ->> 'metodo_pago')::metodo_pago;
  v_vendida_en  timestamptz := coalesce((p_venta ->> 'vendida_en')::timestamptz, now());
  v_existente   ventas%rowtype;
  v_item        jsonb;
  v_prod        productos%rowtype;
  v_cant        int;
  v_linea_id    bigint;
  v_turno       uuid;
  v_total       bigint;
  v_costo       numeric;
  v_numero      bigint;
  v_cliente     text := nullif(trim(p_venta ->> 'cliente'), '');
  v_pagos       jsonb := p_venta -> 'pagos';
  v_metodos     int;
  v_suma        bigint;
  v_ajuste      text;
  v_bold        bigint;
begin
  -- Pago con varios métodos: [{ "metodo": "efectivo", "monto": 5000 }, …]
  if jsonb_typeof(v_pagos) = 'array' and jsonb_array_length(v_pagos) > 0 then
    if exists (select 1 from jsonb_array_elements(v_pagos) x
                where coalesce(x ->> 'metodo', '') not in ('efectivo', 'datafono', 'nequi')
                   or coalesce((x ->> 'monto')::bigint, 0) <= 0) then
      raise exception 'Pagos inválidos: cada pago necesita método (efectivo, Bold o Nequi) y monto' using errcode = '22023';
    end if;
    select count(distinct x ->> 'metodo') into v_metodos from jsonb_array_elements(v_pagos) x;
    v_metodo := case when v_metodos > 1 then 'mixto'::metodo_pago
                     else (v_pagos -> 0 ->> 'metodo')::metodo_pago end;
  else
    v_pagos := null;
  end if;

  if auth.uid() is null or rol_actual() is null then
    raise exception 'Usuario sin permiso para vender' using errcode = '42501';
  end if;
  if v_id is null or v_metodo is null then
    raise exception 'Venta incompleta: falta id o método de pago' using errcode = '22023';
  end if;
  if v_metodo::text = 'credito' and v_cliente is null then
    raise exception 'Para fiar escribe el nombre de quien queda debiendo' using errcode = '22023';
  end if;
  if jsonb_typeof(p_venta -> 'items') is distinct from 'array' or jsonb_array_length(p_venta -> 'items') = 0 then
    raise exception 'La venta no tiene productos' using errcode = '22023';
  end if;

  -- Idempotencia: si ya llegó (reintento offline), devolver la misma.
  select * into v_existente from ventas where id = v_id;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero,
                              'total', v_existente.total, 'duplicada', true);
  end if;

  -- No aceptar horas absurdas del reloj de la tablet.
  if v_vendida_en > now() + interval '5 minutes' or v_vendida_en < now() - interval '7 days' then
    v_vendida_en := now();
  end if;

  -- Turno de caja en el que cayó la venta (si no hay, igual se vende).
  select id into v_turno from turnos
   where abierto_en <= v_vendida_en and (cerrado_en is null or cerrado_en >= v_vendida_en)
   order by abierto_en desc limit 1;

  insert into ventas (id, turno_id, vendedor_id, metodo_pago, total, vendida_en, notas, cliente)
  values (v_id, v_turno, auth.uid(), v_metodo, 0, v_vendida_en, nullif(p_venta ->> 'notas', ''),
          case when v_metodo::text = 'credito' then v_cliente end)
  returning numero into v_numero;

  for v_item in select * from jsonb_array_elements(p_venta -> 'items') loop
    v_cant := coalesce((v_item ->> 'cantidad')::int, 1);
    if v_cant <= 0 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;

    select * into v_prod from productos where id = (v_item ->> 'producto_id')::bigint and activo;
    if not found then
      raise exception 'Producto % no existe o está inactivo', v_item ->> 'producto_id' using errcode = '22023';
    end if;

    insert into venta_items (venta_id, producto_id, nombre_producto, tipo_producto,
                             cantidad, precio_unitario, subtotal)
    values (v_id, v_prod.id, v_prod.nombre, v_prod.tipo, v_cant, v_prod.precio, v_prod.precio * v_cant)
    returning id into v_linea_id;

    perform _agregar_toppings(v_linea_id, v_prod.id, v_item -> 'toppings');
  end loop;

  -- Extras cobrados por toppings → subtotal de cada línea
  update venta_items vi
     set extras_unitario = t.extras,
         subtotal = (vi.precio_unitario + t.extras) * vi.cantidad
    from (select vt.venta_item_id, sum(vt.precio_extra) as extras
            from venta_item_toppings vt
            join venta_items x on x.id = vt.venta_item_id and x.venta_id = v_id
           group by vt.venta_item_id) t
   where vi.id = t.venta_item_id;

  -- Consumo de insumos: receta de cada línea + toppings elegidos
  create temp table if not exists _consumo (item_id bigint, insumo_id bigint, cantidad numeric) on commit drop;
  truncate _consumo;
  insert into _consumo
  select vi.id, r.insumo_id, r.cantidad * vi.cantidad
    from venta_items vi join receta_items r on r.producto_id = vi.producto_id
   where vi.venta_id = v_id
  union all
  select vi.id, ti.insumo_id, ti.cantidad * vi.cantidad
    from venta_items vi
    join venta_item_toppings vt on vt.venta_item_id = vi.id
    join topping_insumos ti on ti.topping_id = vt.topping_id
   where vi.venta_id = v_id;

  -- Costo unitario por línea (para margen por producto)
  update venta_items vi
     set costo_unitario = round(c.costo / vi.cantidad, 2)
    from (select co.item_id, sum(co.cantidad * i.costo_unitario) as costo
            from _consumo co join insumos i on i.id = co.insumo_id
           group by co.item_id) c
   where vi.id = c.item_id;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, venta_id)
  select co.insumo_id, 'consumo_venta', -sum(co.cantidad), i.costo_unitario, v_id
    from _consumo co join insumos i on i.id = co.insumo_id
   group by co.insumo_id, i.costo_unitario;

  select coalesce(sum(subtotal), 0) into v_total from venta_items where venta_id = v_id;
  select coalesce(sum(co.cantidad * i.costo_unitario), 0) into v_costo
    from _consumo co join insumos i on i.id = co.insumo_id;

  -- Cómo se pagó (lo fiado no entra aquí: se registra cuando lo cobran)
  if v_pagos is not null then
    insert into venta_pagos (venta_id, metodo, monto)
    select v_id, (x ->> 'metodo')::metodo_pago, sum((x ->> 'monto')::bigint)
      from jsonb_array_elements(v_pagos) x group by x ->> 'metodo';
    -- Si el total del servidor difiere (precio cambió), la diferencia va al
    -- efectivo o, si no hubo efectivo, al pago más grande.
    select sum(monto) into v_suma from venta_pagos where venta_id = v_id;
    if v_suma <> v_total then
      select metodo::text into v_ajuste from venta_pagos where venta_id = v_id
       order by (metodo::text = 'efectivo') desc, monto desc limit 1;
      update venta_pagos set monto = monto + (v_total - v_suma)
       where venta_id = v_id and metodo::text = v_ajuste;
      if exists (select 1 from venta_pagos where venta_id = v_id and monto <= 0) then
        raise exception 'Los pagos no suman el total de la venta (%)', v_total using errcode = '22023';
      end if;
    end if;
  elsif v_metodo::text <> 'credito' and v_total > 0 then
    insert into venta_pagos (venta_id, metodo, monto) values (v_id, v_metodo, v_total);
  end if;

  select coalesce(sum(monto), 0) into v_bold
    from venta_pagos where venta_id = v_id and metodo::text = 'datafono';

  update ventas
     set total = v_total,
         costo_insumos = round(v_costo, 2),
         comision_datafono = round(v_bold * coalesce(parametro('comision_datafono_pct',
                                                   (v_vendida_en at time zone 'America/Bogota')::date), 0) / 100)
   where id = v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'duplicada', false);
end $$;

-- ---------------------------------------------------------------------
-- Cierre de caja: efectivo, Bold y Nequi salen de venta_pagos
-- ---------------------------------------------------------------------
create or replace function _resumen_turno(p_turno turnos, p_hasta timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  with v as (
    select * from ventas where turno_id = p_turno.id and estado = 'completada'
  ),
  items as (
    select vi.* from venta_items vi join v on v.id = vi.venta_id
  ),
  cobros as (
    select * from ventas
     where estado = 'completada' and cobrada_en >= p_turno.abierto_en and cobrada_en <= p_hasta
  ),
  ret as (
    select * from retiros_caja where turno_id = p_turno.id and anulado_en is null
  ),
  m as (
    select
      coalesce((select sum(p.monto) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'efectivo'), 0) as efectivo,
      coalesce((select sum(p.monto) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'datafono'), 0) as bold,
      coalesce((select sum(p.monto) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'nequi'), 0)    as nequi,
      coalesce((select sum(total) from v where metodo_pago::text = 'credito'), 0)  as fiado,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'efectivo'), 0) as cobro_efectivo,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'datafono'), 0) as cobro_bold,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'nequi'), 0)    as cobro_nequi,
      coalesce((select sum(monto) from ret), 0) as retiros
  )
  select jsonb_build_object(
    'abierto_en', p_turno.abierto_en,
    'hasta', p_hasta,
    'base_inicial', p_turno.base_inicial,
    'ventas', (select count(*) from v),
    'anuladas', (select count(*) from ventas where turno_id = p_turno.id and estado = 'anulada'),
    'total', m.efectivo + m.bold + m.nequi + m.fiado,
    'efectivo', m.efectivo, 'bold', m.bold, 'nequi', m.nequi, 'fiado', m.fiado,
    'cobros_fiado', jsonb_build_object('efectivo', m.cobro_efectivo, 'bold', m.cobro_bold, 'nequi', m.cobro_nequi),
    'perros', coalesce((select sum(cantidad) from items where tipo_producto = 'perro'), 0),
    'bebidas', coalesce((select sum(cantidad) from items where tipo_producto = 'bebida'), 0),
    'adicionales', coalesce((select sum(vi.cantidad)
                               from items vi join venta_item_toppings vt on vt.venta_item_id = vi.id
                              where vt.precio_extra > 0), 0),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'tipo', tipo, 'cantidad', cant, 'total', tot)
                                            order by tipo desc, cant desc)
                             from (select nombre_producto as nombre, tipo_producto::text as tipo,
                                          sum(cantidad) as cant, sum(subtotal) as tot
                                     from items group by 1, 2) x), '[]'),
    'fiados', coalesce((select jsonb_agg(jsonb_build_object('cliente', cliente, 'total', total) order by vendida_en)
                          from v where metodo_pago::text = 'credito'), '[]'),
    'retiros', m.retiros,
    'retiros_detalle', coalesce((select jsonb_agg(jsonb_build_object('tercero', tercero, 'motivo', motivo, 'monto', monto,
                                                                     'hora', creado_en) order by creado_en)
                                   from ret), '[]'),
    'efectivo_esperado', p_turno.base_inicial + m.efectivo + m.cobro_efectivo - m.retiros,
    'bold_esperado', m.bold + m.cobro_bold,
    'nequi_esperado', m.nequi + m.cobro_nequi,
    'bancos_esperado', m.bold + m.cobro_bold + m.nequi + m.cobro_nequi)
  from m
$$;

-- ---------------------------------------------------------------------
-- Punto de equilibrio: % por Bold según lo realmente pagado por Bold
-- ---------------------------------------------------------------------
create or replace function punto_equilibrio(p_mes date default hoy_bogota()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde        timestamptz := (date_trunc('month', p_mes)::date)::timestamp at time zone 'America/Bogota';
  v_hasta        timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::date)::timestamp at time zone 'America/Bogota';
  v_fecha        date := least(p_mes, hoy_bogota());
  v_merma        numeric := coalesce(parametro('merma_pct', v_fecha), 0) / 100;
  v_comision     numeric := coalesce(parametro('comision_datafono_pct', v_fecha), 0) / 100;
  v_dias         numeric := coalesce(parametro('dias_operacion_mes', v_fecha), 30);
  v_nomina       bigint  := coalesce(parametro('nomina_mensual', v_fecha), 0);
  v_arriendo     bigint  := coalesce(parametro('arriendo_mensual', v_fecha), 0);
  v_cuota        bigint  := cuota_recuperacion(p_mes);
  v_fijos        bigint;
  v_precio       numeric; v_insumos numeric; v_perros bigint;
  v_precio_beb   numeric; v_costo_beb numeric;
  v_pct_datafono numeric; v_pct_bebida numeric;
  v_ventas_mes   bigint;
  v_costo_perro  numeric; v_margen_perro numeric; v_margen_beb numeric; v_margen numeric;
  v_pe_mes       numeric;
  v_margen_real  numeric;
  v_fuente       text := 'ventas_reales';
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;

  -- Perros vendidos en el mes
  select sum(vi.cantidad), sum((vi.precio_unitario + vi.extras_unitario) * vi.cantidad)::numeric / nullif(sum(vi.cantidad), 0),
         sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)
    into v_perros, v_precio, v_insumos
    from venta_items vi join ventas v on v.id = vi.venta_id
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta
     and vi.tipo_producto = 'perro';

  if coalesce(v_perros, 0) = 0 then
    v_fuente := 'catalogo_y_parametros';
    select avg(p.precio), avg(costo_catalogo(p.id)) into v_precio, v_insumos
      from productos p where p.activo and p.tipo = 'perro';
  end if;

  -- Bebidas
  select sum(vi.subtotal)::numeric / nullif(sum(vi.cantidad), 0),
         sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)
    into v_precio_beb, v_costo_beb
    from venta_items vi join ventas v on v.id = vi.venta_id
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta
     and vi.tipo_producto = 'bebida';
  if v_precio_beb is null then
    select avg(p.precio), avg(costo_catalogo(p.id)) into v_precio_beb, v_costo_beb
      from productos p where p.activo and p.tipo = 'bebida';
  end if;

  -- Mezcla de pagos y tasa de adjunción del mes
  select count(*),
         sum((select coalesce(sum(p.monto), 0) from venta_pagos p where p.venta_id = v.id and p.metodo::text = 'datafono'))::numeric
           / nullif(sum(total), 0),
         count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'bebida'))::numeric
           / nullif(count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'perro')), 0)
    into v_ventas_mes, v_pct_datafono, v_pct_bebida
    from ventas v
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta;

  if coalesce(v_ventas_mes, 0) = 0 then
    v_pct_datafono := coalesce(parametro('pct_ventas_datafono_estimado', v_fecha), 0) / 100;
    v_pct_bebida   := coalesce(parametro('tasa_adjuncion_estimada', v_fecha), 0) / 100;
  end if;
  v_pct_datafono := coalesce(v_pct_datafono, 0);
  v_pct_bebida   := least(coalesce(v_pct_bebida, 0), 1);

  v_costo_perro  := coalesce(v_insumos, 0) * (1 + v_merma) + coalesce(v_precio, 0) * v_comision * v_pct_datafono;
  v_margen_perro := coalesce(v_precio, 0) - v_costo_perro;
  v_margen_beb   := (coalesce(v_precio_beb, 0) - coalesce(v_costo_beb, 0)) * v_pct_bebida;
  v_margen       := v_margen_perro + v_margen_beb;
  v_fijos        := v_nomina + v_arriendo + v_cuota;
  v_pe_mes       := case when v_margen > 0 then v_fijos / v_margen end;

  -- Margen de contribución real acumulado en el mes (para comparar con los fijos)
  select coalesce(sum(v.total - v.costo_insumos * (1 + v_merma) - v.comision_datafono), 0)
    into v_margen_real
    from ventas v
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta;

  return jsonb_build_object(
    'mes',                        to_char(p_mes, 'YYYY-MM'),
    'fuente',                     v_fuente,
    'precio_perro',               round(coalesce(v_precio, 0)),
    'insumos_por_perro',          round(coalesce(v_insumos, 0)),
    'costo_por_perro',            round(v_costo_perro),
    'margen_por_perro',           round(v_margen_perro),
    'margen_bebida_por_perro',    round(v_margen_beb),
    'margen_combinado_por_perro', round(v_margen),
    'pct_datafono',               round(v_pct_datafono * 100, 1),
    'tasa_adjuncion',             round(v_pct_bebida * 100, 1),
    'merma_pct',                  round(v_merma * 100, 2),
    'comision_datafono_pct',      round(v_comision * 100, 2),
    'nomina',                     v_nomina,
    'arriendo',                   v_arriendo,
    'cuota_recuperacion',         v_cuota,
    'costos_fijos',               v_fijos,
    'pe_unidades_mes',            ceil(v_pe_mes),
    'pe_unidades_dia',            ceil(v_pe_mes / nullif(v_dias, 0)),
    'pe_pesos_mes',               round(ceil(v_pe_mes) * coalesce(v_precio, 0)),
    'perros_vendidos_mes',        coalesce(v_perros, 0),
    'margen_contribucion_mes',    round(v_margen_real),
    'avance_pct',                 round(100 * v_margen_real / nullif(v_fijos, 0), 1)
  );
end $$;

-- ---------------------------------------------------------------------
-- ventas_de_hoy: incluye el detalle de pagos
-- ---------------------------------------------------------------------
drop function ventas_de_hoy();
create function ventas_de_hoy()
returns table (id uuid, numero bigint, vendida_en timestamptz, metodo_pago metodo_pago,
               total bigint, estado estado_venta, resumen text, puede_anular boolean,
               cliente text, cobrada boolean, pagos jsonb)
language sql stable security definer set search_path = public as $$
  select v.id, v.numero, v.vendida_en, v.metodo_pago, v.total, v.estado,
         (select string_agg(vi.cantidad || '× ' || vi.nombre_producto, ', ' order by vi.id)
            from venta_items vi where vi.venta_id = v.id),
         v.estado = 'completada'
           and (es_socio() or (v.vendedor_id = auth.uid() and v.vendida_en >= now() - interval '5 minutes')),
         v.cliente,
         v.cobrada_en is not null,
         (select jsonb_agg(jsonb_build_object('metodo', p.metodo, 'monto', p.monto) order by p.monto desc)
            from venta_pagos p where p.venta_id = v.id)
    from ventas v
   where rol_actual() is not null
     and (v.vendida_en at time zone 'America/Bogota')::date = hoy_bogota()
   order by v.vendida_en desc
$$;

revoke execute on function ventas_de_hoy(), _resumen_turno(turnos, timestamptz) from public, anon;
revoke execute on function _resumen_turno(turnos, timestamptz) from authenticated;
grant execute on function ventas_de_hoy(), registrar_venta(jsonb), punto_equilibrio(date) to authenticated;
