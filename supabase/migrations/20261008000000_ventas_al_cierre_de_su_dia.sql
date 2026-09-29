-- =====================================================================
-- Cada venta en el cierre de su día
--
-- Si se vende antes de abrir la caja del día (con la caja del día anterior
-- todavía abierta), esas ventas quedaban en el cierre del día anterior y el
-- cierre del día en que se hicieron no cuadraba (sobraba plata).
--
-- * _turno_del_dia(fecha): la caja principal de un día (la que tiene más
--   ventas; si empatan, la última).
-- * _reasignar_ventas_dia(fecha): pasa las ventas de ese día (hora Bogotá)
--   a la caja principal de ese día y recalcula todos los cierres tocados.
-- * reasignar_ventas_dia(fecha): lo mismo, para socios, desde la app.
-- * registrar_venta_olvidada usa la caja principal del día.
-- * Se corrige el 28 de septiembre.
-- Se puede correr más de una vez.
-- =====================================================================

create or replace function _turno_del_dia(p_fecha date) returns turnos
language sql stable security definer set search_path = public as $$
  select t.* from turnos t
   where (t.abierto_en at time zone 'America/Bogota')::date = p_fecha
   order by (select count(*) from ventas v where v.turno_id = t.id and v.estado = 'completada') desc,
            t.abierto_en desc
   limit 1
$$;

create or replace function _reasignar_ventas_dia(p_fecha date) returns int
language plpgsql security definer set search_path = public as $$
declare
  t        turnos%rowtype;
  v_viejos uuid[];
  v_n      int;
  v_id     uuid;
begin
  t := _turno_del_dia(p_fecha);
  if t.id is null then
    return 0;
  end if;

  select coalesce(array_agg(distinct turno_id) filter (where turno_id is not null), '{}'), count(*)
    into v_viejos, v_n
    from ventas
   where (vendida_en at time zone 'America/Bogota')::date = p_fecha
     and turno_id is distinct from t.id;
  if v_n = 0 then
    return 0;
  end if;

  update ventas set turno_id = t.id
   where (vendida_en at time zone 'America/Bogota')::date = p_fecha
     and turno_id is distinct from t.id;

  perform _recalcular_cierre(t.id);
  foreach v_id in array v_viejos loop
    perform _recalcular_cierre(v_id);
  end loop;
  return v_n;
end $$;

create or replace function reasignar_ventas_dia(p_fecha date) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;
  return _reasignar_ventas_dia(p_fecha);
end $$;

-- Venta olvidada: a la caja principal del día, y el día queda ordenado
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

  t := _turno_del_dia(p_fecha);
  if t.id is null then
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
         notas = concat_ws(' · ', nullif(notas, ''), 'Registrada después por ' || v_quien)
   where id = (v_res ->> 'id')::uuid;

  perform _reasignar_ventas_dia(p_fecha);
  perform _recalcular_cierre(t.id);
  return v_res;
end $$;

revoke execute on function _turno_del_dia(date), _reasignar_ventas_dia(date) from public, anon, authenticated;
revoke execute on function reasignar_ventas_dia(date), registrar_venta_olvidada(jsonb, date) from public, anon;
grant execute on function reasignar_ventas_dia(date), registrar_venta_olvidada(jsonb, date) to authenticated;

-- Corrección del lunes 28 de septiembre
select _reasignar_ventas_dia('2026-09-28');
