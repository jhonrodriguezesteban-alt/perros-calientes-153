-- =====================================================================
-- Nequi, ventas fiadas (crédito) y cuentas por cobrar
--
-- Nota: los valores nuevos del enum no se usan como literal en este mismo
-- archivo (Postgres no lo permite en la misma transacción); por eso las
-- comparaciones se hacen con metodo_pago::text.
-- =====================================================================

alter type metodo_pago add value if not exists 'nequi';
alter type metodo_pago add value if not exists 'credito';

alter table ventas
  add column cliente        text,                         -- quién queda debiendo (solo fiado)
  add column cobrada_en     timestamptz,                  -- cuándo pagó lo fiado
  add column cobrada_metodo metodo_pago,                  -- con qué pagó lo fiado
  add column cobrada_por    uuid references perfiles (id);

alter table ventas add constraint ventas_credito_con_cliente
  check (metodo_pago::text <> 'credito' or coalesce(trim(cliente), '') <> '');
alter table ventas add constraint ventas_cobro_valido
  check (cobrada_metodo is null or cobrada_metodo::text <> 'credito');

create index on ventas (cliente) where cliente is not null;

-- ---------------------------------------------------------------------
-- registrar_venta: igual que antes + nombre del cliente cuando es fiado
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
begin
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

  update ventas
     set total = v_total,
         costo_insumos = round(v_costo, 2),
         comision_datafono = case when v_metodo = 'datafono'
           then round(v_total * coalesce(parametro('comision_datafono_pct',
                                                   (v_vendida_en at time zone 'America/Bogota')::date), 0) / 100)
           else 0 end
   where id = v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'duplicada', false);
end $$;

-- ---------------------------------------------------------------------
-- Cobrar una venta fiada (empleada o socio)
-- ---------------------------------------------------------------------
create or replace function cobrar_venta(p_venta_id uuid, p_metodo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_venta ventas%rowtype;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_metodo not in ('efectivo', 'datafono', 'nequi') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  select * into v_venta from ventas where id = p_venta_id for update;
  if not found or v_venta.metodo_pago::text <> 'credito' then
    raise exception 'Esa venta no está fiada' using errcode = '22023';
  end if;
  if v_venta.estado <> 'completada' then
    raise exception 'La venta está anulada' using errcode = '22023';
  end if;
  if v_venta.cobrada_en is not null then
    raise exception 'Esa cuenta ya estaba pagada' using errcode = '22023';
  end if;

  update ventas
     set cobrada_en = now(),
         cobrada_metodo = p_metodo::metodo_pago,
         cobrada_por = auth.uid(),
         comision_datafono = case when p_metodo = 'datafono'
           then round(total * coalesce(parametro('comision_datafono_pct'), 0) / 100) else 0 end
   where id = p_venta_id;
end $$;

-- Cuentas por cobrar (sin costos: la empleada también las ve)
create or replace function cuentas_por_cobrar()
returns table (id uuid, numero bigint, cliente text, total bigint, vendida_en timestamptz, resumen text)
language sql stable security definer set search_path = public as $$
  select v.id, v.numero, v.cliente, v.total, v.vendida_en,
         (select string_agg(vi.cantidad || '× ' || vi.nombre_producto, ', ' order by vi.id)
            from venta_items vi where vi.venta_id = v.id)
    from ventas v
   where rol_actual() is not null
     and v.metodo_pago::text = 'credito'
     and v.estado = 'completada'
     and v.cobrada_en is null
   order by v.vendida_en
$$;

-- ---------------------------------------------------------------------
-- Cierre de caja: el efectivo esperado incluye lo fiado que se cobró en
-- efectivo durante el turno.
-- ---------------------------------------------------------------------
create or replace function cerrar_turno(p_efectivo_contado bigint, p_notas text default null)
returns table (base_inicial bigint, ventas_efectivo bigint, efectivo_esperado bigint,
               efectivo_contado bigint, diferencia bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
  v_ventas bigint;
  v_cobros bigint;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Escribe el efectivo contado' using errcode = '22023';
  end if;

  select * into v_turno from turnos where cerrado_en is null for update;
  if not found then
    raise exception 'No hay un turno abierto' using errcode = '22023';
  end if;

  select coalesce(sum(v.total), 0) into v_ventas
    from ventas v
   where v.turno_id = v_turno.id and v.metodo_pago = 'efectivo' and v.estado = 'completada';

  select coalesce(sum(v.total), 0) into v_cobros
    from ventas v
   where v.cobrada_metodo = 'efectivo' and v.estado = 'completada'
     and v.cobrada_en >= v_turno.abierto_en and v.cobrada_en <= now();

  update turnos t
     set cerrado_por = auth.uid(), cerrado_en = now(),
         ventas_efectivo = v_ventas + v_cobros,
         efectivo_esperado = t.base_inicial + v_ventas + v_cobros,
         efectivo_contado = p_efectivo_contado,
         notas_cierre = nullif(trim(p_notas), '')
   where t.id = v_turno.id;

  return query
    select t.base_inicial, t.ventas_efectivo, t.efectivo_esperado, t.efectivo_contado, t.diferencia
      from turnos t where t.id = v_turno.id;
end $$;

-- ventas_de_hoy ahora también dice a quién se fió y si ya pagó
drop function ventas_de_hoy();
create function ventas_de_hoy()
returns table (id uuid, numero bigint, vendida_en timestamptz, metodo_pago metodo_pago,
               total bigint, estado estado_venta, resumen text, puede_anular boolean,
               cliente text, cobrada boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.numero, v.vendida_en, v.metodo_pago, v.total, v.estado,
         (select string_agg(vi.cantidad || '× ' || vi.nombre_producto, ', ' order by vi.id)
            from venta_items vi where vi.venta_id = v.id),
         v.estado = 'completada'
           and (es_socio() or (v.vendedor_id = auth.uid() and v.vendida_en >= now() - interval '5 minutes')),
         v.cliente,
         v.cobrada_en is not null
    from ventas v
   where rol_actual() is not null
     and (v.vendida_en at time zone 'America/Bogota')::date = hoy_bogota()
   order by v.vendida_en desc
$$;

revoke execute on function cobrar_venta(uuid, text), cuentas_por_cobrar(), ventas_de_hoy() from public, anon;
grant execute on function cobrar_venta(uuid, text), cuentas_por_cobrar(), ventas_de_hoy(),
                          registrar_venta(jsonb), cerrar_turno(bigint, text) to authenticated;
