-- =====================================================================
-- Notificaciones al celular (Web Push)
--
-- * suscripciones_push: cada celular/computador donde un socio activó las
--   notificaciones, con qué quiere recibir (ventas, cierres, solicitudes,
--   caja: aperturas, retiros y anulaciones).
-- * ajustes_privados: la dirección y la clave con que la base avisa a la app
--   (nadie puede leerlas desde la app).
-- * _notificar(): la base le pasa el aviso a la app (/api/notificaciones/enviar)
--   con pg_net; la app lo manda a los celulares. Si algo falla, la venta o el
--   cierre siguen normal: el aviso nunca bloquea nada.
-- * Triggers: venta, venta anulada, apertura y cierre de caja, retiro de
--   caja, solicitud de insumo.
-- Se puede correr más de una vez.
-- =====================================================================

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no disponible: las notificaciones quedan apagadas';
end $$;

create table if not exists suscripciones_push (
  id           uuid primary key default gen_random_uuid(),
  perfil_id    uuid not null default auth.uid() references perfiles (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  dispositivo  text,
  ventas       boolean not null default true,
  cierres      boolean not null default true,
  solicitudes  boolean not null default true,
  caja         boolean not null default true,
  creado_en    timestamptz not null default now()
);
alter table suscripciones_push enable row level security;
drop policy if exists suscripciones_propias on suscripciones_push;
create policy suscripciones_propias on suscripciones_push for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid() and es_socio());
grant select, insert, update, delete on suscripciones_push to authenticated;
revoke all on suscripciones_push from anon;

create table if not exists ajustes_privados (
  clave  text primary key,
  valor  text not null
);
alter table ajustes_privados enable row level security;
revoke all on ajustes_privados from public, anon, authenticated;

-- $12.500
create or replace function _pesos(n numeric) returns text
language sql immutable as $$
  select '$' || replace(to_char(round(coalesce(n, 0)), 'FM999,999,999,990'), ',', '.')
$$;

create or replace function _notificar(p_tipo text, p_titulo text, p_cuerpo text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url     text;
  v_secreto text;
  v_subs    jsonb;
begin
  select valor into v_url from ajustes_privados where clave = 'notificaciones_url';
  select valor into v_secreto from ajustes_privados where clave = 'notificaciones_secreto';
  if v_url is null or v_secreto is null or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'net' and p.proname = 'http_post') then
    return;
  end if;

  select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth)))
    into v_subs
    from suscripciones_push s join perfiles p on p.id = s.perfil_id and p.activo and p.rol = 'socio'
   where case p_tipo when 'venta' then s.ventas when 'cierre' then s.cierres
                     when 'solicitud' then s.solicitudes else s.caja end;
  if v_subs is null then
    return;
  end if;

  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using v_url,
          jsonb_build_object('tipo', p_tipo, 'titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'suscripciones', v_subs),
          jsonb_build_object('Content-Type', 'application/json', 'x-secreto', v_secreto);
exception when others then
  raise warning 'No se pudo enviar la notificación: %', sqlerrm;
end $$;

-- La app avisa cuáles celulares ya no existen (desinstalaron o bloquearon)
create or replace function quitar_suscripciones_vencidas(p_secreto text, p_endpoints text[]) returns int
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if p_secreto is null or p_secreto is distinct from (select valor from ajustes_privados where clave = 'notificaciones_secreto') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  delete from suscripciones_push where endpoint = any (p_endpoints);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------
-- Qué se avisa
-- ---------------------------------------------------------------------
create or replace function _nombre_medio(v ventas) returns text
language sql stable security definer set search_path = public as $$
  select case v.metodo_pago::text
           when 'credito' then 'Fiado' || coalesce(' · ' || v.cliente, '')
           when 'mixto' then (select string_agg(case p.metodo::text when 'datafono' then 'Bold' when 'nequi' then 'Nequi' else 'Efectivo' end
                                                || ' ' || _pesos(p.monto), ' + ' order by p.monto desc)
                                from venta_pagos p where p.venta_id = v.id)
           when 'datafono' then 'Bold'
           when 'nequi' then 'Nequi'
           else 'Efectivo' end
$$;

create or replace function notificar_venta() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_items text;
  v_quien text;
begin
  -- Venta nueva: registrar_venta la crea en 0 y luego le pone el total
  if tg_op = 'UPDATE' and old.total = 0 and new.total > 0 and new.estado = 'completada' then
    select string_agg(cantidad || '× ' || nombre_producto, ', ' order by id) into v_items
      from venta_items where venta_id = new.id;
    select nombre into v_quien from perfiles where id = new.vendedor_id;
    perform _notificar('venta',
      '🌭 Venta #' || new.numero || ' · ' || _pesos(new.total),
      _nombre_medio(new) || ' · ' || coalesce(v_items, '') || coalesce(' · ' || v_quien, ''),
      '/panel');
  elsif tg_op = 'UPDATE' and old.estado = 'completada' and new.estado = 'anulada' then
    select nombre into v_quien from perfiles where id = new.anulada_por;
    perform _notificar('caja',
      '❌ Venta #' || new.numero || ' anulada · ' || _pesos(new.total),
      coalesce(new.motivo_anulacion, 'Sin motivo') || coalesce(' · ' || v_quien, ''),
      '/panel/ventas');
  end if;
  return null;
end $$;

drop trigger if exists ventas_notificar on ventas;
create trigger ventas_notificar after update of total, estado on ventas
  for each row execute function notificar_venta();

create or replace function notificar_turno() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r      jsonb;
  v_quien text;
  dif_e  bigint;
  dif_b  bigint;
  txt    text;
begin
  if tg_op = 'INSERT' then
    select nombre into v_quien from perfiles where id = new.abierto_por;
    perform _notificar('caja',
      '🔓 Caja abierta · ' || _pesos(new.base_inicial),
      coalesce(v_quien, 'Alguien') || ' abrió el día'
        || case when new.base_esperada is not null and new.base_esperada <> new.base_inicial
                then ' · el cierre anterior dejó ' || _pesos(new.base_esperada) else '' end,
      '/panel/caja');
  elsif old.cerrado_en is null and new.cerrado_en is not null then
    r := new.resumen;
    select nombre into v_quien from perfiles where id = new.cerrado_por;
    dif_e := (r ->> 'diferencia_efectivo')::bigint;
    dif_b := (r ->> 'diferencia_bancos')::bigint;
    txt := 'Vendido ' || _pesos((r ->> 'total')::bigint) || ' (' || coalesce(r ->> 'ventas', '0') || ' ventas, '
        || coalesce(r ->> 'perros', '0') || ' perros)'
        || ' · Efectivo: ' || case when dif_e is null then '—' when dif_e = 0 then 'cuadra'
                                   when dif_e > 0 then 'sobran ' || _pesos(dif_e) else 'faltan ' || _pesos(-dif_e) end
        || ' · Bancos: ' || case when dif_b is null then '—' when dif_b = 0 then 'cuadra'
                                 when dif_b > 0 then 'sobran ' || _pesos(dif_b) else 'faltan ' || _pesos(-dif_b) end;
    perform _notificar('cierre', '🔒 Cierre de caja' || coalesce(' · ' || v_quien, ''), txt, '/panel/caja');
  end if;
  return null;
end $$;

drop trigger if exists turnos_notificar on turnos;
create trigger turnos_notificar after insert or update of cerrado_en on turnos
  for each row execute function notificar_turno();

create or replace function notificar_retiro() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  select nombre into v_quien from perfiles where id = new.registrado_por;
  perform _notificar('caja',
    '💸 Retiro de caja · ' || _pesos(new.monto),
    new.tercero || coalesce(' · ' || new.motivo, '') || coalesce(' · registró ' || v_quien, ''),
    '/panel/caja');
  return null;
end $$;

drop trigger if exists retiros_notificar on retiros_caja;
create trigger retiros_notificar after insert on retiros_caja
  for each row execute function notificar_retiro();

create or replace function notificar_solicitud() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_quien text;
begin
  select nombre into v_quien from perfiles where id = new.solicitado_por;
  perform _notificar('solicitud',
    '📦 ' || coalesce(v_quien, 'Alguien') || ' pide: ' || new.descripcion,
    concat_ws(' · ',
      case when new.cantidad is not null then trim(to_char(new.cantidad, 'FM999999990.###')) || coalesce(' ' || new.unidad::text, '') end,
      new.nota),
    '/panel/solicitudes');
  return null;
end $$;

drop trigger if exists solicitudes_notificar on solicitudes_pedido;
create trigger solicitudes_notificar after insert on solicitudes_pedido
  for each row execute function notificar_solicitud();

revoke execute on function _notificar(text, text, text, text), _nombre_medio(ventas), notificar_venta(),
                           notificar_turno(), notificar_retiro(), notificar_solicitud()
  from public, anon, authenticated;
revoke execute on function quitar_suscripciones_vencidas(text, text[]) from public, authenticated;
grant execute on function quitar_suscripciones_vencidas(text, text[]) to anon;
