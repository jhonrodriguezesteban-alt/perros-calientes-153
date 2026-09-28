-- =====================================================================
-- Caja del día: retiros de efectivo y "Finalizar día"
--
-- * Retiros: sacar efectivo de la caja a nombre de alguien (socio,
--   proveedor…). Resta del efectivo que debería haber.
-- * Finalizar día: la empleada cuenta el efectivo y dice cuánto entró por
--   Bold y por Nequi (a ciegas: no ve antes lo que dice el sistema). Se
--   cierra el turno y se guarda un resumen completo del día.
-- * Si no se abrió turno, se crea solo desde el inicio del día (o desde el
--   último cierre) con base $0, y se le asignan las ventas sueltas.
-- =====================================================================

alter table turnos
  add column retiros            bigint not null default 0,
  add column bancos_esperado    bigint,
  add column bancos_declarado   bigint check (bancos_declarado >= 0),
  add column diferencia_bancos  bigint generated always as (bancos_declarado - bancos_esperado) stored,
  add column resumen            jsonb;

create table retiros_caja (
  id              uuid primary key default gen_random_uuid(),
  turno_id        uuid not null references turnos (id),
  monto           bigint not null check (monto > 0),
  tercero         text not null check (trim(tercero) <> ''),
  motivo          text,
  registrado_por  uuid not null default auth.uid() references perfiles (id),
  creado_en       timestamptz not null default now(),
  anulado_en      timestamptz,
  anulado_por     uuid references perfiles (id)
);
create index on retiros_caja (turno_id);
create index on retiros_caja (creado_en desc);

alter table retiros_caja enable row level security;
create policy retiros_lectura on retiros_caja for select to authenticated using (rol_actual() is not null);
grant select on retiros_caja to authenticated;
revoke insert, update, delete on retiros_caja from authenticated;
revoke all on retiros_caja from anon;
alter publication supabase_realtime add table retiros_caja;

-- ---------------------------------------------------------------------
-- Turno abierto; si no hay, lo crea desde el inicio del día (o desde el
-- último cierre de hoy) y le asigna las ventas que quedaron sin turno.
-- ---------------------------------------------------------------------
create or replace function _turno_abierto_o_nuevo() returns turnos
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
  v_desde timestamptz;
begin
  select * into v_turno from turnos where cerrado_en is null for update;
  if found then
    return v_turno;
  end if;

  v_desde := greatest(
    (hoy_bogota()::timestamp at time zone 'America/Bogota'),
    coalesce((select max(cerrado_en) from turnos), '-infinity'));

  insert into turnos (base_inicial, abierto_en) values (0, v_desde) returning * into v_turno;

  update ventas set turno_id = v_turno.id
   where turno_id is null and vendida_en >= v_desde;

  return v_turno;
end $$;

-- ---------------------------------------------------------------------
-- Retiros
-- ---------------------------------------------------------------------
create or replace function registrar_retiro(p_monto bigint, p_tercero text, p_motivo text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
  v_id    uuid;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'Escribe cuánto efectivo sale' using errcode = '22023';
  end if;
  if coalesce(trim(p_tercero), '') = '' then
    raise exception 'Escribe a nombre de quién sale el dinero' using errcode = '22023';
  end if;

  v_turno := _turno_abierto_o_nuevo();
  insert into retiros_caja (turno_id, monto, tercero, motivo)
  values (v_turno.id, p_monto, trim(p_tercero), nullif(trim(p_motivo), ''))
  returning id into v_id;
  return v_id;
end $$;

-- Anular un retiro mal digitado: solo mientras el día siguen abierto;
-- la empleada solo los suyos, los socios cualquiera.
create or replace function anular_retiro(p_retiro_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_r retiros_caja%rowtype;
begin
  select * into v_r from retiros_caja where id = p_retiro_id for update;
  if not found or v_r.anulado_en is not null then
    raise exception 'Ese retiro no existe o ya estaba anulado' using errcode = '22023';
  end if;
  if not (es_socio() or v_r.registrado_por = auth.uid()) then
    raise exception 'Solo quien lo registró o un socio puede anularlo' using errcode = '42501';
  end if;
  if exists (select 1 from turnos where id = v_r.turno_id and cerrado_en is not null) then
    raise exception 'Ese día ya se cerró; el retiro no se puede anular' using errcode = '22023';
  end if;
  update retiros_caja set anulado_en = now(), anulado_por = auth.uid() where id = p_retiro_id;
end $$;

-- Retiros del turno abierto (para el POS)
create or replace function retiros_de_hoy()
returns table (id uuid, monto bigint, tercero text, motivo text, creado_en timestamptz,
               registrado_por text, puede_anular boolean)
language sql stable security definer set search_path = public as $$
  select r.id, r.monto, r.tercero, r.motivo, r.creado_en, p.nombre,
         es_socio() or r.registrado_por = auth.uid()
    from retiros_caja r
    join turnos t on t.id = r.turno_id and t.cerrado_en is null
    join perfiles p on p.id = r.registrado_por
   where rol_actual() is not null and r.anulado_en is null
   order by r.creado_en desc
$$;

-- ---------------------------------------------------------------------
-- Resumen de un turno (lo que dice el sistema)
-- ---------------------------------------------------------------------
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
      coalesce((select sum(total) from v where metodo_pago::text = 'efectivo'), 0) as efectivo,
      coalesce((select sum(total) from v where metodo_pago::text = 'datafono'), 0) as bold,
      coalesce((select sum(total) from v where metodo_pago::text = 'nequi'), 0)    as nequi,
      coalesce((select sum(total) from v where metodo_pago::text = 'credito'), 0)  as fiado,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'efectivo'), 0) as cobro_efectivo,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'datafono'), 0) as cobro_bold,
      coalesce((select sum(total) from cobros where cobrada_metodo::text = 'nequi'), 0)    as cobro_nequi,
      coalesce((select sum(monto) from ret), 0) as retiros
  )
  select jsonb_build_object(
    'abierto_en', p_turno.abierto_en,
    'hasta', p_hasta,
    'base_inicial', p_turno.base_inicial,
    'ventas', (select count(*) from v),
    'anuladas', (select count(*) from ventas where turno_id = p_turno.id and estado = 'anulada'),
    'total', m.efectivo + m.bold + m.nequi + m.fiado,
    'efectivo', m.efectivo, 'bold', m.bold, 'nequi', m.nequi, 'fiado', m.fiado,
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

-- ---------------------------------------------------------------------
-- Finalizar día
-- ---------------------------------------------------------------------
create or replace function finalizar_dia(p_efectivo_contado bigint, p_bold_declarado bigint,
                                         p_nequi_declarado bigint, p_notas text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_turno   turnos%rowtype;
  v_ahora   timestamptz := now();
  v_res     jsonb;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Escribe el efectivo contado' using errcode = '22023';
  end if;
  if coalesce(p_bold_declarado, 0) < 0 or coalesce(p_nequi_declarado, 0) < 0 then
    raise exception 'Los valores de bancos no pueden ser negativos' using errcode = '22023';
  end if;

  v_turno := _turno_abierto_o_nuevo();
  v_res := _resumen_turno(v_turno, v_ahora);

  v_res := v_res || jsonb_build_object(
    'efectivo_contado', p_efectivo_contado,
    'diferencia_efectivo', p_efectivo_contado - (v_res ->> 'efectivo_esperado')::bigint,
    'bold_declarado', coalesce(p_bold_declarado, 0),
    'nequi_declarado', coalesce(p_nequi_declarado, 0),
    'bancos_declarado', coalesce(p_bold_declarado, 0) + coalesce(p_nequi_declarado, 0),
    'diferencia_bancos', coalesce(p_bold_declarado, 0) + coalesce(p_nequi_declarado, 0)
                         - (v_res ->> 'bancos_esperado')::bigint,
    'cerrado_por', (select nombre from perfiles where id = auth.uid()),
    'abierto_por', (select nombre from perfiles where id = v_turno.abierto_por),
    'notas', nullif(trim(p_notas), ''));

  update turnos
     set cerrado_por = auth.uid(), cerrado_en = v_ahora,
         ventas_efectivo = (v_res ->> 'efectivo')::bigint + (v_res #>> '{cobros_fiado,efectivo}')::bigint,
         retiros = (v_res ->> 'retiros')::bigint,
         efectivo_esperado = (v_res ->> 'efectivo_esperado')::bigint,
         efectivo_contado = p_efectivo_contado,
         bancos_esperado = (v_res ->> 'bancos_esperado')::bigint,
         bancos_declarado = (v_res ->> 'bancos_declarado')::bigint,
         notas_cierre = nullif(trim(p_notas), ''),
         resumen = v_res
   where id = v_turno.id;

  return v_res;
end $$;

-- cerrar_turno (versión anterior) ahora también descuenta los retiros.
create or replace function cerrar_turno(p_efectivo_contado bigint, p_notas text default null)
returns table (base_inicial bigint, ventas_efectivo bigint, efectivo_esperado bigint,
               efectivo_contado bigint, diferencia bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from turnos where cerrado_en is null;
  if v_id is null then
    raise exception 'No hay un turno abierto' using errcode = '22023';
  end if;
  perform finalizar_dia(p_efectivo_contado, null, null, p_notas);
  return query
    select t.base_inicial, t.ventas_efectivo, t.efectivo_esperado, t.efectivo_contado, t.diferencia
      from turnos t where t.id = v_id;
end $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke execute on function _turno_abierto_o_nuevo(), _resumen_turno(turnos, timestamptz)
  from public, anon, authenticated;
revoke execute on function registrar_retiro(bigint, text, text), anular_retiro(uuid), retiros_de_hoy(),
                           finalizar_dia(bigint, bigint, bigint, text)
  from public, anon;
grant execute on function registrar_retiro(bigint, text, text), anular_retiro(uuid), retiros_de_hoy(),
                          finalizar_dia(bigint, bigint, bigint, text), cerrar_turno(bigint, text)
  to authenticated;
