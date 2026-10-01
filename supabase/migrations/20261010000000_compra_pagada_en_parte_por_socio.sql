-- =====================================================================
-- Compra pagada en parte por un socio
--
-- Una compra puede pagarse con la tarjeta / Nequi / fondo del negocio y
-- que un socio ponga una parte (ej. Calypso AADB9676: $677.009 con la
-- tarjeta, de los cuales Jhon prestó $377.000).
-- * compras.monto_socio: lo que puso el socio (socio_id); el resto sale
--   del medio de pago de la compra.
-- * flujo_caja: ese pedazo no se descuenta de Bold / Nequi / fondo, sale
--   como "Lo pagó un socio" y suma en "Plata que pusieron los socios".
-- Se puede correr más de una vez.
-- =====================================================================

alter table compras add column if not exists monto_socio bigint;
alter table compras drop constraint if exists compras_monto_socio_check;
alter table compras add constraint compras_monto_socio_check
  check (monto_socio is null or (monto_socio > 0 and socio_id is not null and pagado_con is distinct from 'socio'));

-- La versión anterior de flujo_caja (con préstamos) pasa a ser una capa más
do $$
begin
  if to_regprocedure('_flujo_caja_prestamos(date, date)') is null then
    alter function flujo_caja(date, date) rename to _flujo_caja_prestamos;
  end if;
end $$;
revoke execute on function _flujo_caja_prestamos(date, date) from public, anon, authenticated;

create or replace function flujo_caja(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v      jsonb;
  v_tot  jsonb;
  v_per  jsonb;
  k      text;
  p_tarj bigint; p_trans bigint; p_fondo bigint; p_suma bigint;
begin
  v := _flujo_caja_prestamos(p_desde, p_hasta);   -- valida que sea socio

  select coalesce(jsonb_object_agg(pagado_con, monto), '{}') into v_tot
    from (select coalesce(pagado_con, 'sin_registrar') as pagado_con, sum(monto_socio) as monto
            from compras where monto_socio is not null group by 1) x;
  select coalesce(jsonb_object_agg(pagado_con, monto), '{}'), coalesce(sum(monto), 0) into v_per, p_suma
    from (select coalesce(pagado_con, 'sin_registrar') as pagado_con, sum(monto_socio) as monto
            from compras where monto_socio is not null and fecha between p_desde and p_hasta group by 1) x;
  if v_tot = '{}'::jsonb then
    return v;
  end if;

  p_tarj  := coalesce((v_tot ->> 'tarjeta')::bigint, 0);
  p_trans := coalesce((v_tot ->> 'transferencia')::bigint, 0);
  p_fondo := coalesce((v_tot ->> 'fondo')::bigint, 0);

  -- Lo que puso el socio no salió de las cuentas del negocio
  v := jsonb_set(v, '{bold}', to_jsonb((v ->> 'bold')::bigint + p_tarj));
  v := jsonb_set(v, '{nequi}', to_jsonb((v ->> 'nequi')::bigint + p_trans));
  v := jsonb_set(v, '{fondo,saldo}', to_jsonb((v #>> '{fondo,saldo}')::bigint + p_fondo));
  v := jsonb_set(v, '{disponible}', to_jsonb((v ->> 'disponible')::bigint + p_tarj + p_trans + p_fondo));

  -- Salidas del periodo: ese pedazo pasa a "Lo pagó un socio"
  for k in select jsonb_object_keys(v_per) loop
    if v #> array['periodo', 'salidas', k] is not null then
      v := jsonb_set(v, array['periodo', 'salidas', k, 'compras'],
                     to_jsonb((v #>> array['periodo', 'salidas', k, 'compras'])::bigint - (v_per ->> k)::bigint));
    end if;
  end loop;
  if p_suma > 0 and v #> '{periodo,salidas,socio}' is not null then
    v := jsonb_set(v, '{periodo,salidas,socio,compras}',
                   to_jsonb((v #>> '{periodo,salidas,socio,compras}')::bigint + p_suma));
  end if;

  -- Plata que pusieron los socios
  v := jsonb_set(v, '{puesto_por_socios}', coalesce((
    select jsonb_agg(jsonb_build_object('socio', socio, 'monto', monto) order by monto desc)
      from (select socio, sum(monto) as monto
              from (select x ->> 'socio' as socio, (x ->> 'monto')::bigint as monto
                      from jsonb_array_elements(v -> 'puesto_por_socios') x
                    union all
                    select p.nombre, c.monto_socio
                      from compras c join perfiles p on p.id = c.socio_id
                     where c.monto_socio is not null) y
             group by socio) z), '[]'));
  return v;
end $$;

revoke execute on function flujo_caja(date, date) from public, anon;
grant execute on function flujo_caja(date, date) to authenticated;
