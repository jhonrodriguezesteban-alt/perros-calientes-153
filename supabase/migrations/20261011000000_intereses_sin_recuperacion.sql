-- =====================================================================
-- Punto de equilibrio: intereses del préstamo, sin "inversión a recuperar"
--
-- La inversión inicial se hizo con el préstamo de ~$13.000.000 de los
-- socios: no hay una inversión aparte que recuperar. Lo que cuesta cada mes
-- son los intereses de ese préstamo.
-- * Se quita el plan "Inversión inicial" (la cuota de recuperación queda en 0).
-- * Nuevo parámetro intereses_prestamo_mensual ($390.000 = 3 % de $13.000.000),
--   editable en Finanzas → Parámetros.
-- * punto_equilibrio suma los intereses a los costos fijos.
-- Se puede correr más de una vez.
-- =====================================================================

delete from planes_recuperacion where descripcion = 'Inversión inicial';

insert into parametros (clave, vigente_desde, valor, descripcion)
values ('intereses_prestamo_mensual', '2026-09-01', 390000,
        'Intereses del préstamo de los socios al mes (3 % de $13.000.000)')
on conflict (clave, vigente_desde) do nothing;

do $$
begin
  if to_regprocedure('_punto_equilibrio_base(date)') is null then
    alter function punto_equilibrio(date) rename to _punto_equilibrio_base;
  end if;
end $$;
revoke execute on function _punto_equilibrio_base(date) from public, anon, authenticated;

create or replace function punto_equilibrio(p_mes date default hoy_bogota()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v        jsonb := _punto_equilibrio_base(p_mes);   -- valida que sea socio
  v_fecha  date := least(p_mes, hoy_bogota());
  v_int    bigint := coalesce(parametro('intereses_prestamo_mensual', v_fecha), 0);
  v_dias   numeric := coalesce(parametro('dias_operacion_mes', v_fecha), 30);
  v_margen numeric := nullif((v ->> 'margen_combinado_por_perro')::numeric, 0);
  v_fijos  bigint := (v ->> 'costos_fijos')::bigint + v_int;
  v_pe     numeric := case when v_margen > 0 then ceil(v_fijos / v_margen) end;
begin
  return v || jsonb_build_object(
    'intereses',       v_int,
    'costos_fijos',    v_fijos,
    'pe_unidades_mes', v_pe,
    'pe_unidades_dia', ceil(v_pe / nullif(v_dias, 0)),
    'pe_pesos_mes',    round(v_pe * (v ->> 'precio_perro')::numeric),
    'avance_pct',      round(100 * (v ->> 'margen_contribucion_mes')::numeric / nullif(v_fijos, 0), 1));
end $$;

revoke execute on function punto_equilibrio(date) from public, anon;
grant execute on function punto_equilibrio(date) to authenticated;
