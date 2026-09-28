-- =====================================================================
-- Compras: con qué se pagó (y si la plata la puso un socio)
-- Ventas: resumen por día para el módulo de ventas
-- =====================================================================

alter table compras
  add column pagado_con text check (pagado_con in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio')),
  add column socio_id   uuid references perfiles (id),
  add column retiro_id  uuid references retiros_caja (id),
  add constraint compras_socio_si_presto check (pagado_con is distinct from 'socio' or socio_id is not null);

-- Compras ya cargadas (según las facturas)
update compras set pagado_con = 'transferencia' where proveedor like 'La Inglesa%' and pagado_con is null;
update compras set pagado_con = 'tarjeta'       where proveedor in ('Calypso · AADA143534', 'Calypso · AADB9676') and pagado_con is null;
update compras set pagado_con = 'efectivo'      where proveedor in ('San Rafael de la Once · FV 142707', 'Calypso · AADA143728') and pagado_con is null;
update compras set pagado_con = 'transferencia' where proveedor like 'Gaseosas%' and pagado_con is null;

-- ---------------------------------------------------------------------
-- registrar_compra: acepta "pagado_con" y "socio_id"
--   caja          efectivo de la caja del POS (si es de hoy, sale como retiro)
--   efectivo      efectivo de otro lado
--   tarjeta       débito / crédito
--   transferencia Nequi, Bre-B, banco
--   socio         la plata la puso un socio (queda como préstamo a devolver)
-- ---------------------------------------------------------------------
create or replace function registrar_compra(p_compra jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_compra  uuid;
  v_gasto   uuid;
  v_total   bigint;
  v_fecha   date := coalesce((p_compra ->> 'fecha')::date, hoy_bogota());
  v_prov    text := nullif(trim(p_compra ->> 'proveedor'), '');
  v_pago    text := nullif(p_compra ->> 'pagado_con', '');
  v_socio   uuid := nullif(p_compra ->> 'socio_id', '')::uuid;
  v_turno   turnos%rowtype;
  v_retiro  uuid;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede registrar compras' using errcode = '42501';
  end if;
  if jsonb_typeof(p_compra -> 'items') is distinct from 'array' or jsonb_array_length(p_compra -> 'items') = 0 then
    raise exception 'La compra no tiene productos' using errcode = '22023';
  end if;

  if v_pago is not null and v_pago not in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio') then
    raise exception 'Forma de pago inválida' using errcode = '22023';
  end if;
  if v_pago = 'socio' and not exists (select 1 from perfiles where id = v_socio and rol = 'socio') then
    raise exception 'Elige qué socio puso la plata' using errcode = '22023';
  end if;

  insert into compras (fecha, proveedor, pagado_con, socio_id)
  values (v_fecha, v_prov, v_pago, case when v_pago = 'socio' then v_socio end)
  returning id into v_compra;

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

  -- Pagada con el efectivo de la caja hoy: sale de la caja como retiro,
  -- así el cierre del día cuadra.
  if v_pago = 'caja' and v_fecha = hoy_bogota() and v_total > 0 then
    v_turno := _turno_abierto_o_nuevo();
    insert into retiros_caja (turno_id, monto, tercero, motivo)
    values (v_turno.id, v_total, coalesce(v_prov, 'Proveedor'), 'Compra de insumos')
    returning id into v_retiro;
    update compras set retiro_id = v_retiro where id = v_compra;
  end if;

  update solicitudes_pedido
     set estado = 'comprada', atendido_por = auth.uid(), atendido_en = now(), compra_id = v_compra
   where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_compra -> 'solicitudes', '[]')))
     and estado = 'pendiente';

  return v_compra;
end $$;

-- ---------------------------------------------------------------------
-- Ventas por día en un rango (socios)
-- ---------------------------------------------------------------------
create or replace function ventas_por_dia(p_desde date, p_hasta date)
returns table (dia date, ventas bigint, anuladas bigint, perros bigint, bebidas bigint, adicionales bigint,
               total bigint, efectivo bigint, bold bigint, nequi bigint, fiado bigint,
               costo_insumos bigint, comisiones bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;
  return query
  with v as (
    select x.*, (x.vendida_en at time zone 'America/Bogota')::date as d
      from ventas x
     where (x.vendida_en at time zone 'America/Bogota')::date between p_desde and p_hasta
  ),
  ok as (select * from v where estado = 'completada')
  select dd.d,
         (select count(*) from ok where ok.d = dd.d),
         (select count(*) from v where v.d = dd.d and v.estado = 'anulada'),
         coalesce((select sum(vi.cantidad) from ok join venta_items vi on vi.venta_id = ok.id
                    where ok.d = dd.d and vi.tipo_producto = 'perro'), 0)::bigint,
         coalesce((select sum(vi.cantidad) from ok join venta_items vi on vi.venta_id = ok.id
                    where ok.d = dd.d and vi.tipo_producto = 'bebida'), 0)::bigint,
         coalesce((select sum(vi.cantidad) from ok join venta_items vi on vi.venta_id = ok.id
                     join venta_item_toppings vt on vt.venta_item_id = vi.id
                    where ok.d = dd.d and vt.precio_extra > 0), 0)::bigint,
         coalesce((select sum(total) from ok where ok.d = dd.d), 0)::bigint,
         coalesce((select sum(p.monto) from ok join venta_pagos p on p.venta_id = ok.id
                    where ok.d = dd.d and p.metodo::text = 'efectivo'), 0)::bigint,
         coalesce((select sum(p.monto) from ok join venta_pagos p on p.venta_id = ok.id
                    where ok.d = dd.d and p.metodo::text = 'datafono'), 0)::bigint,
         coalesce((select sum(p.monto) from ok join venta_pagos p on p.venta_id = ok.id
                    where ok.d = dd.d and p.metodo::text = 'nequi'), 0)::bigint,
         coalesce((select sum(total) from ok where ok.d = dd.d and ok.metodo_pago::text = 'credito'), 0)::bigint,
         coalesce((select round(sum(costo_insumos)) from ok where ok.d = dd.d), 0)::bigint,
         coalesce((select sum(comision_datafono) from ok where ok.d = dd.d), 0)::bigint
    from (select distinct d from v) dd
   order by dd.d desc;
end $$;

revoke execute on function ventas_por_dia(date, date) from public, anon;
grant execute on function ventas_por_dia(date, date), registrar_compra(jsonb) to authenticated;
