-- =====================================================================
-- Nómina: medios turnos, fin del acuerdo y Fernanda
--
-- * Los turnos de una semana se pueden ajustar en medios (ej. 3½ cuando un
--   día fue medio turno).
-- * nomina_acuerdos.hasta: último día que trabajó la persona. Después de
--   esa fecha no se le cuentan turnos ni salen semanas nuevas.
-- * Andrea trabajó hasta el lunes 26 de oct. Fernanda arrancó el jueves 29
--   de oct a $70.000 por turno, lunes a sábado.
-- Se puede correr más de una vez.
-- =====================================================================

alter table nomina_acuerdos add column if not exists hasta date;
alter table nomina_periodos alter column turnos type numeric(4,1);

update nomina_acuerdos set hasta = '2026-10-26' where persona = 'Andrea' and hasta is null;
insert into nomina_acuerdos (persona, valor_turno, desde, nota)
values ('Fernanda', 70000, '2026-10-29', 'Turno de lunes a sábado; se paga los sábados')
on conflict (persona) do nothing;

-- Semana (o periodo especial) a la que va una fecha
create or replace function _semana_nomina(p_persona text, p_fecha date) returns date
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select desde from nomina_periodos
      where persona = p_persona and monto_fijo is not null and p_fecha between desde and hasta
      order by desde desc limit 1),
    (select greatest(date_trunc('week', least(p_fecha, coalesce(a.hasta, p_fecha)))::date, a.desde)
       from nomina_acuerdos a where a.persona = p_persona and p_fecha >= a.desde))
$$;

drop function if exists nomina_semanas(text);
create function nomina_semanas(p_persona text)
returns table (desde date, hasta date, turnos numeric, turnos_caja int, valor_turno bigint, devengado bigint,
               vales bigint, pagos bigint, saldo bigint, especial boolean, en_curso boolean, nota text)
language sql stable security definer set search_path = public as $$
  with a as (select * from nomina_acuerdos where persona = p_persona),
  semanas as (
    -- Periodos especiales con valor fijo
    select p.desde, p.hasta, true as especial from nomina_periodos p
     where p.persona = p_persona and p.monto_fijo is not null
    union all
    -- Semanas de lunes a sábado desde el acuerdo hasta hoy (o hasta su último día)
    select greatest(s::date, a.desde), least(s::date + 5, coalesce(a.hasta, s::date + 5)), false
      from a, generate_series(date_trunc('week', a.desde),
                              date_trunc('week', least(hoy_bogota(), coalesce(a.hasta, hoy_bogota()))::timestamp),
                              interval '1 week') s
  ),
  dias as (
    select distinct (t.abierto_en at time zone 'America/Bogota')::date as dia
      from turnos t
  ),
  w as (
    select s.*, o.monto_fijo, o.nota,
           case when s.especial then null else coalesce(o.turnos, c.n) end as turnos,
           c.n
      from semanas s
      left join nomina_periodos o on o.persona = p_persona and o.desde = s.desde
      left join lateral (select count(*) as n from dias d
                          where d.dia between s.desde and least(s.hasta, hoy_bogota())
                            and extract(isodow from d.dia) < 7) c on true
  )
  select w.desde, w.hasta, w.turnos, w.n::int,
         case when w.especial then null else a.valor_turno end,
         case when w.especial then w.monto_fijo else round(w.turnos * a.valor_turno) end::bigint,
         coalesce(v.vales, 0), coalesce(v.pagos, 0),
         (case when w.especial then w.monto_fijo else round(w.turnos * a.valor_turno) end)::bigint
           - coalesce(v.vales, 0) - coalesce(v.pagos, 0),
         w.especial,
         hoy_bogota() between w.desde and w.hasta,
         w.nota
    from w
    left join a on true
    left join lateral (select sum(pp.monto) filter (where pp.tipo = 'vale') as vales,
                              sum(pp.monto) filter (where pp.tipo = 'nomina') as pagos
                         from pagos_personal pp
                        where pp.persona = p_persona and pp.semana = w.desde and pp.anulado_en is null) v on true
   where es_socio()
     -- una semana normal que cae dentro de un periodo especial no se repite
     and (w.especial or not exists (select 1 from nomina_periodos e
                                     where e.persona = p_persona and e.monto_fijo is not null
                                       and w.desde between e.desde and e.hasta))
   order by w.desde desc
$$;

-- Ajustar los turnos de una semana (null = los que dice la caja); acepta medios
drop function if exists ajustar_turnos_semana(text, date, int, text);
create or replace function ajustar_turnos_semana(p_persona text, p_desde date, p_turnos numeric, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede ajustar la nómina' using errcode = '42501';
  end if;
  if p_turnos is not null and (p_turnos < 0 or p_turnos > 7 or p_turnos * 2 <> round(p_turnos * 2)) then
    raise exception 'Turnos inválidos' using errcode = '22023';
  end if;
  insert into nomina_periodos (persona, desde, hasta, turnos, nota)
  values (p_persona, p_desde, date_trunc('week', p_desde)::date + 5, p_turnos, nullif(trim(p_nota), ''))
  on conflict (persona, desde) do update set turnos = excluded.turnos, nota = coalesce(excluded.nota, nomina_periodos.nota)
   where nomina_periodos.monto_fijo is null;
end $$;

revoke execute on function nomina_semanas(text), ajustar_turnos_semana(text, date, numeric, text) from public, anon;
grant execute on function nomina_semanas(text), ajustar_turnos_semana(text, date, numeric, text) to authenticated;

notify pgrst, 'reload schema';
