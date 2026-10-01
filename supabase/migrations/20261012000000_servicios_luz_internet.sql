-- =====================================================================
-- Servicios (luz e internet) en los costos fijos del punto de equilibrio
-- * Parámetros servicios_luz_mensual y servicios_internet_mensual
--   (empiezan en $0; se ponen en Finanzas → Parámetros).
-- * punto_equilibrio los suma a los costos fijos junto con los intereses.
-- Se puede correr más de una vez.
-- =====================================================================

insert into parametros (clave, vigente_desde, valor, descripcion) values
  ('servicios_luz_mensual',      '2026-09-01', 0, 'Luz al mes'),
  ('servicios_internet_mensual', '2026-09-01', 0, 'Internet al mes')
on conflict (clave, vigente_desde) do nothing;

create or replace function punto_equilibrio(p_mes date default hoy_bogota()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v        jsonb := _punto_equilibrio_base(p_mes);   -- valida que sea socio
  v_fecha  date := least(p_mes, hoy_bogota());
  v_int    bigint := coalesce(parametro('intereses_prestamo_mensual', v_fecha), 0);
  v_luz    bigint := coalesce(parametro('servicios_luz_mensual', v_fecha), 0);
  v_net    bigint := coalesce(parametro('servicios_internet_mensual', v_fecha), 0);
  v_dias   numeric := coalesce(parametro('dias_operacion_mes', v_fecha), 30);
  v_margen numeric := nullif((v ->> 'margen_combinado_por_perro')::numeric, 0);
  v_fijos  bigint := (v ->> 'costos_fijos')::bigint + v_int + v_luz + v_net;
  v_pe     numeric := case when v_margen > 0 then ceil(v_fijos / v_margen) end;
begin
  return v || jsonb_build_object(
    'intereses',       v_int,
    'luz',             v_luz,
    'internet',        v_net,
    'costos_fijos',    v_fijos,
    'pe_unidades_mes', v_pe,
    'pe_unidades_dia', ceil(v_pe / nullif(v_dias, 0)),
    'pe_pesos_mes',    round(v_pe * (v ->> 'precio_perro')::numeric),
    'avance_pct',      round(100 * (v ->> 'margen_contribucion_mes')::numeric / nullif(v_fijos, 0), 1));
end $$;

revoke execute on function punto_equilibrio(date) from public, anon;
grant execute on function punto_equilibrio(date) to authenticated;
