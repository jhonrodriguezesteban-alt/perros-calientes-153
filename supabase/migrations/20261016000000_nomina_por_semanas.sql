-- =====================================================================
-- Nómina por semanas (turnos)
--
-- * nomina_acuerdos: cuánto se paga el turno a cada persona y desde cuándo
--   (Andrea: $80.000 por turno desde el jueves 1 de octubre, lunes a sábado,
--   se le paga los sábados).
-- * nomina_periodos: periodos especiales con valor fijo (la primera nómina
--   de Andrea, 23 al 30 de sept: $583.800) y ajustes de turnos de una semana.
-- * Cada semana va de lunes a sábado. Los turnos se cuentan solos con los
--   días que se abrió la caja (lunes a sábado); se pueden ajustar a mano.
-- * pagos_personal.semana: a qué semana va cada vale o pago de nómina. Un
--   vale cuenta como pago de la semana en que se dio.
-- * nomina_semanas(persona): cada semana con turnos, lo ganado, vales, pagos
--   y saldo.
-- * pagar_nomina_semana: registra un pago (completo o parcial) a una semana.
-- Se puede correr más de una vez.
-- =====================================================================

create table if not exists nomina_acuerdos (
  persona      text primary key,
  valor_turno  bigint not null check (valor_turno > 0),
  desde        date not null,
  nota         text
);
alter table nomina_acuerdos enable row level security;
drop policy if exists nomina_acuerdos_socios on nomina_acuerdos;
create policy nomina_acuerdos_socios on nomina_acuerdos for all to authenticated using (es_socio()) with check (es_socio());
grant select, insert, update, delete on nomina_acuerdos to authenticated;

create table if not exists nomina_periodos (
  id          uuid primary key default gen_random_uuid(),
  persona     text not null,
  desde       date not null,
  hasta       date not null check (hasta >= desde),
  monto_fijo  bigint check (monto_fijo > 0),
  turnos      int check (turnos >= 0),
  nota        text,
  unique (persona, desde)
);
alter table nomina_periodos enable row level security;
drop policy if exists nomina_periodos_socios on nomina_periodos;
create policy nomina_periodos_socios on nomina_periodos for all to authenticated using (es_socio()) with check (es_socio());
grant select, insert, update, delete on nomina_periodos to authenticated;

alter table pagos_personal add column if not exists semana date;

insert into nomina_acuerdos (persona, valor_turno, desde, nota)
values ('Andrea', 80000, '2026-10-01', 'Turno de lunes a sábado; se paga los sábados')
on conflict (persona) do nothing;

insert into nomina_periodos (persona, desde, hasta, monto_fijo, nota)
values ('Andrea', '2026-09-23', '2026-09-30', 583800, 'Primera nómina (cuentas cerradas hasta el miércoles 30 de sept)')
on conflict (persona, desde) do nothing;

-- Semana (o periodo especial) a la que va una fecha
create or replace function _semana_nomina(p_persona text, p_fecha date) returns date
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select desde from nomina_periodos
      where persona = p_persona and monto_fijo is not null and p_fecha between desde and hasta
      order by desde desc limit 1),
    (select greatest(date_trunc('week', p_fecha)::date, a.desde)
       from nomina_acuerdos a where a.persona = p_persona and p_fecha >= a.desde))
$$;

create or replace function pagos_personal_semana() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.semana is null and new.tipo in ('nomina', 'vale') then
    new.semana := _semana_nomina(new.persona, new.fecha);
  end if;
  return new;
end $$;

drop trigger if exists pagos_personal_semana on pagos_personal;
create trigger pagos_personal_semana before insert on pagos_personal
  for each row execute function pagos_personal_semana();

-- Los pagos y vales que ya existen
update pagos_personal set semana = _semana_nomina(persona, fecha)
 where semana is null and tipo in ('nomina', 'vale');

-- El abono de $70.000 del 3 de oct fue a la primera nómina (23 al 30 de sept)
update pagos_personal set semana = '2026-09-23'
 where persona = 'Andrea' and tipo = 'nomina' and monto = 70000 and fecha = '2026-10-03'
   and semana is distinct from '2026-09-23';

-- Cada semana: turnos, lo ganado, vales, pagos y saldo
create or replace function nomina_semanas(p_persona text)
returns table (desde date, hasta date, turnos int, turnos_caja int, valor_turno bigint, devengado bigint,
               vales bigint, pagos bigint, saldo bigint, especial boolean, en_curso boolean, nota text)
language sql stable security definer set search_path = public as $$
  with a as (select * from nomina_acuerdos where persona = p_persona),
  semanas as (
    -- Periodos especiales con valor fijo
    select p.desde, p.hasta, true as especial from nomina_periodos p
     where p.persona = p_persona and p.monto_fijo is not null
    union all
    -- Semanas de lunes a sábado desde el acuerdo hasta hoy
    select greatest(s::date, a.desde), s::date + 5, false
      from a, generate_series(date_trunc('week', a.desde), date_trunc('week', hoy_bogota()::timestamp), interval '1 week') s
  ),
  dias as (
    select distinct (t.abierto_en at time zone 'America/Bogota')::date as dia
      from turnos t
  )
  select s.desde, s.hasta,
         case when s.especial then null else coalesce(o.turnos, c.n) end::int,
         c.n::int,
         case when s.especial then null else a.valor_turno end,
         case when s.especial then o.monto_fijo else coalesce(o.turnos, c.n) * a.valor_turno end,
         coalesce(v.vales, 0), coalesce(v.pagos, 0),
         (case when s.especial then o.monto_fijo else coalesce(o.turnos, c.n) * a.valor_turno end)
           - coalesce(v.vales, 0) - coalesce(v.pagos, 0),
         s.especial,
         hoy_bogota() between s.desde and s.hasta,
         o.nota
    from semanas s
    left join a on true
    left join nomina_periodos o on o.persona = p_persona and o.desde = s.desde
    left join lateral (select count(*) as n from dias d
                        where d.dia between s.desde and least(s.hasta, hoy_bogota())
                          and extract(isodow from d.dia) < 7) c on true
    left join lateral (select sum(pp.monto) filter (where pp.tipo = 'vale') as vales,
                              sum(pp.monto) filter (where pp.tipo = 'nomina') as pagos
                         from pagos_personal pp
                        where pp.persona = p_persona and pp.semana = s.desde and pp.anulado_en is null) v on true
   where es_socio()
     -- una semana normal que cae dentro de un periodo especial no se repite
     and (s.especial or not exists (select 1 from nomina_periodos e
                                     where e.persona = p_persona and e.monto_fijo is not null
                                       and s.desde between e.desde and e.hasta))
   order by s.desde desc
$$;

-- Ajustar los turnos de una semana (null = los que dice la caja)
create or replace function ajustar_turnos_semana(p_persona text, p_desde date, p_turnos int, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede ajustar la nómina' using errcode = '42501';
  end if;
  if p_turnos is not null and (p_turnos < 0 or p_turnos > 7) then
    raise exception 'Turnos inválidos' using errcode = '22023';
  end if;
  insert into nomina_periodos (persona, desde, hasta, turnos, nota)
  values (p_persona, p_desde, date_trunc('week', p_desde)::date + 5, p_turnos, nullif(trim(p_nota), ''))
  on conflict (persona, desde) do update set turnos = excluded.turnos, nota = coalesce(excluded.nota, nomina_periodos.nota)
   where nomina_periodos.monto_fijo is null;
end $$;

-- Pago (completo o parcial) de la nómina de una semana
create or replace function pagar_nomina_semana(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_semana date := nullif(p ->> 'semana', '')::date;
  v_monto  bigint := coalesce((p ->> 'monto')::bigint, 0);
begin
  if v_semana is null then
    raise exception 'Elige la semana que se paga' using errcode = '22023';
  end if;
  if v_monto <= 0 then
    raise exception 'Escribe el valor' using errcode = '22023';
  end if;
  v_id := registrar_pago_personal(p || jsonb_build_object('tipo', 'nomina', 'bruto', v_monto, 'vales', '[]'::jsonb));
  update pagos_personal set semana = v_semana where id = v_id;
  return v_id;
end $$;

revoke execute on function _semana_nomina(text, date), pagos_personal_semana() from public, anon, authenticated;
revoke execute on function nomina_semanas(text), ajustar_turnos_semana(text, date, int, text), pagar_nomina_semana(jsonb)
  from public, anon;
grant execute on function nomina_semanas(text), ajustar_turnos_semana(text, date, int, text), pagar_nomina_semana(jsonb)
  to authenticated;
