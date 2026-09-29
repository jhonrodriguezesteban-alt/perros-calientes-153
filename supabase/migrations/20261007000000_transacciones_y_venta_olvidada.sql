-- =====================================================================
-- Cierre con número de transacciones · Venta olvidada en un día cerrado
--
-- * _resumen_turno cuenta cuántas ventas se pagaron por cada medio
--   (efectivo, Bold, Nequi, fiado) para contar vouchers rápido. Una venta
--   con pago mixto cuenta en cada medio que usó.
-- * _recalcular_cierre: vuelve a calcular un día ya cerrado con las ventas
--   que tiene hoy, conservando lo que se contó y declaró al cerrar.
-- * registrar_venta_olvidada: un socio registra una venta que no se cargó
--   en su día; queda en ese día y el cierre se recalcula.
-- * Anular una venta de un día cerrado también recalcula ese cierre.
-- Se puede correr más de una vez.
-- =====================================================================

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
      coalesce((select sum(monto) from ret), 0) as retiros,
      (select count(distinct v.id) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'efectivo') as n_efectivo,
      (select count(distinct v.id) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'datafono') as n_bold,
      (select count(distinct v.id) from v join venta_pagos p on p.venta_id = v.id where p.metodo::text = 'nequi')    as n_nequi,
      (select count(*) from v where metodo_pago::text = 'credito') as n_fiado,
      (select count(*) from cobros where cobrada_metodo::text = 'datafono') as n_cobro_bold,
      (select count(*) from cobros where cobrada_metodo::text = 'nequi')    as n_cobro_nequi,
      (select count(*) from cobros where cobrada_metodo::text = 'efectivo') as n_cobro_efectivo
  )
  select jsonb_build_object(
    'abierto_en', p_turno.abierto_en,
    'hasta', p_hasta,
    'base_inicial', p_turno.base_inicial,
    'ventas', (select count(*) from v),
    'anuladas', (select count(*) from ventas where turno_id = p_turno.id and estado = 'anulada'),
    'total', m.efectivo + m.bold + m.nequi + m.fiado,
    'efectivo', m.efectivo, 'bold', m.bold, 'nequi', m.nequi, 'fiado', m.fiado,
    'transacciones', jsonb_build_object(
      'efectivo', m.n_efectivo + m.n_cobro_efectivo,
      'bold', m.n_bold + m.n_cobro_bold,
      'nequi', m.n_nequi + m.n_cobro_nequi,
      'fiado', m.n_fiado),
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

-- Recalcula un día cerrado: ventas y esperados de nuevo; lo contado y
-- declarado al cerrar se conserva.
create or replace function _recalcular_cierre(p_turno_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t      turnos%rowtype;
  v_res  jsonb;
begin
  select * into t from turnos where id = p_turno_id for update;
  if not found or t.cerrado_en is null or t.resumen is null then
    return;
  end if;
  v_res := t.resumen || _resumen_turno(t, t.cerrado_en);
  v_res := v_res || jsonb_build_object(
    'diferencia_efectivo', coalesce(t.efectivo_contado, 0) - (v_res ->> 'efectivo_esperado')::bigint,
    'diferencia_bancos', coalesce((v_res ->> 'bancos_declarado')::bigint, 0) - (v_res ->> 'bancos_esperado')::bigint);
  update turnos
     set ventas_efectivo = (v_res ->> 'efectivo')::bigint + (v_res #>> '{cobros_fiado,efectivo}')::bigint,
         retiros = (v_res ->> 'retiros')::bigint,
         efectivo_esperado = (v_res ->> 'efectivo_esperado')::bigint,
         bancos_esperado = (v_res ->> 'bancos_esperado')::bigint,
         resumen = v_res
   where id = p_turno_id;
end $$;

-- Anular una venta de un día ya cerrado corrige ese cierre
create or replace function venta_anulada_recalcula() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado is distinct from old.estado and new.turno_id is not null then
    perform _recalcular_cierre(new.turno_id);
  end if;
  return null;
end $$;

drop trigger if exists ventas_anulada_recalcula on ventas;
create trigger ventas_anulada_recalcula after update of estado on ventas
  for each row execute function venta_anulada_recalcula();

-- Venta que no se registró en su día (solo socios)
create or replace function registrar_venta_olvidada(p_venta jsonb, p_fecha date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t        turnos%rowtype;
  v_res    jsonb;
  v_quien  text;
  v_cuando timestamptz;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede registrar una venta de otro día' using errcode = '42501';
  end if;
  if p_fecha is null or p_fecha > hoy_bogota() then
    raise exception 'Fecha inválida' using errcode = '22023';
  end if;

  -- La caja de ese día (la última que se abrió ese día)
  select * into t from turnos
   where (abierto_en at time zone 'America/Bogota')::date = p_fecha
   order by abierto_en desc limit 1;
  if not found then
    raise exception 'Ese día no se abrió caja' using errcode = '22023';
  end if;
  -- Queda justo antes del cierre de ese día (o ahora, si la caja sigue abierta)
  v_cuando := coalesce(t.cerrado_en - interval '1 second', now());

  v_res := registrar_venta((p_venta - 'vendida_en') || jsonb_build_object('vendida_en', now()));
  if (v_res ->> 'duplicada')::boolean then
    return v_res;
  end if;

  select nombre into v_quien from perfiles where id = auth.uid();
  update ventas
     set vendida_en = v_cuando,
         turno_id = t.id,
         notas = concat_ws(' · ', nullif(notas, ''), 'Registrada después por ' || v_quien)
   where id = (v_res ->> 'id')::uuid;

  perform _recalcular_cierre(t.id);
  return v_res;
end $$;

-- Los cierres ya guardados quedan con el número de transacciones
do $$
declare r record;
begin
  for r in select id from turnos where cerrado_en is not null and resumen is not null loop
    perform _recalcular_cierre(r.id);
  end loop;
end $$;

revoke execute on function _recalcular_cierre(uuid), venta_anulada_recalcula() from public, anon, authenticated;
revoke execute on function registrar_venta_olvidada(jsonb, date) from public, anon;
grant execute on function registrar_venta_olvidada(jsonb, date) to authenticated;
