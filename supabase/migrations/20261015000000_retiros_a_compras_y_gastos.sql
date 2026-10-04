-- =====================================================================
-- Retiros de caja → compras, gastos y vales (sin duplicar)
--
-- Cuando Andrea saca efectivo de la caja para comprar algo, el cierre lo
-- descuenta, pero la salida no quedaba como compra ni gasto: no se veía en
-- Compras ni en Finanzas y el inventario no subía. Si después un socio
-- registraba esa compra "con efectivo de la caja" el mismo día, se creaba
-- OTRO retiro y la plata se descontaba dos veces.
--
-- Cada retiro se clasifica una sola vez, usando ESE retiro (no se crea otro):
-- * registrar_compra_de_retiro: compra de insumos/equipos.
-- * registrar_gasto_de_retiro: gasto (aseo, transporte, mantenimiento…).
-- * registrar_pago_de_retiro: vale o préstamo a una persona.
-- * vincular_retiro: ya estaba registrado (compra, gasto o pago de personal):
--   se une al retiro y, si ese registro había creado su propio retiro, el
--   duplicado se anula y su cierre se recalcula.
-- * marcar_retiro_sin_gasto: no es gasto (ej. plata que se le entregó a un
--   socio o se consignó).
-- * retiros_sin_registrar(): los que faltan; candidatos_retiro(): registros
--   cercanos que podrían ser el mismo.
-- Se puede correr más de una vez.
-- =====================================================================

alter table retiros_caja add column if not exists sin_gasto_motivo text;

-- En qué quedó registrado un retiro (null si en nada)
create or replace function _registro_de_retiro(p_retiro_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select 'compra' from compras where retiro_id = p_retiro_id limit 1),
    (select 'pago' from pagos_personal where retiro_id = p_retiro_id and anulado_en is null limit 1),
    (select 'gasto' from gastos where retiro_id = p_retiro_id limit 1),
    (select 'sin_gasto' from retiros_caja where id = p_retiro_id and sin_gasto_motivo is not null))
$$;

-- Retiro que la app creó sola al registrar una compra, gasto o préstamo con
-- "efectivo de la caja" (no uno que alguien sacó a mano en el POS)
create or replace function _retiro_automatico(p_retiro_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from retiros_caja
                  where id = p_retiro_id
                    and (motivo = 'Compra de insumos' or motivo like 'Gasto: %' or motivo like 'Préstamo%'))
$$;

create or replace function _retiro_libre(p_retiro_id uuid) returns retiros_caja
language plpgsql security definer set search_path = public as $$
declare r retiros_caja%rowtype;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede clasificar retiros' using errcode = '42501';
  end if;
  select * into r from retiros_caja where id = p_retiro_id for update;
  if not found or r.anulado_en is not null then
    raise exception 'Ese retiro no existe o está anulado' using errcode = '22023';
  end if;
  if _registro_de_retiro(p_retiro_id) is not null then
    raise exception 'Ese retiro ya está registrado' using errcode = '22023';
  end if;
  return r;
end $$;

-- Une un registro existente con el retiro; anula el retiro duplicado que
-- ese registro hubiera creado.
create or replace function _vincular_retiro(p_retiro_id uuid, p_tipo text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_otro   uuid;
  v_gasto  uuid;
  v_turno  uuid;
begin
  if p_tipo = 'compra' then
    select retiro_id into v_otro from compras where id = p_id for update;
    if not found then raise exception 'La compra no existe' using errcode = '22023'; end if;
    update compras set pagado_con = 'caja', socio_id = case when monto_socio is not null then socio_id end,
                       retiro_id = p_retiro_id
     where id = p_id;
  elsif p_tipo = 'gasto' then
    select retiro_id into v_otro from gastos where id = p_id for update;
    if not found then raise exception 'El gasto no existe' using errcode = '22023'; end if;
    update gastos set pagado_con = 'caja', pagado_por_socio = null, retiro_id = p_retiro_id where id = p_id;
  elsif p_tipo = 'pago' then
    select coalesce(pp.retiro_id, g.retiro_id), pp.gasto_id into v_otro, v_gasto
      from pagos_personal pp left join gastos g on g.id = pp.gasto_id
     where pp.id = p_id and pp.anulado_en is null for update of pp;
    if not found then raise exception 'El pago no existe' using errcode = '22023'; end if;
    update pagos_personal set pagado_con = 'caja', pagado_por_socio = null, retiro_id = p_retiro_id where id = p_id;
    update gastos set pagado_con = 'caja', pagado_por_socio = null, retiro_id = p_retiro_id where id = v_gasto;
  else
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;

  if v_otro is not null and v_otro <> p_retiro_id then
    if not _retiro_automatico(v_otro) and exists (select 1 from retiros_caja where id = v_otro and anulado_en is null) then
      raise exception 'Ese registro ya está unido a otro retiro de caja' using errcode = '22023';
    end if;
    update retiros_caja set anulado_en = now(), anulado_por = auth.uid()
     where id = v_otro and anulado_en is null
    returning turno_id into v_turno;
    if v_turno is not null then
      perform _recalcular_cierre(v_turno);
    end if;
  end if;
end $$;

create or replace function vincular_retiro(p_retiro_id uuid, p_tipo text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _retiro_libre(p_retiro_id);
  perform _vincular_retiro(p_retiro_id, p_tipo, p_id);
end $$;

create or replace function registrar_compra_de_retiro(p_retiro_id uuid, p_compra jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r     retiros_caja%rowtype;
  v_id  uuid;
begin
  r := _retiro_libre(p_retiro_id);
  -- Se registra como efectivo para no crear otro retiro; luego queda con este
  v_id := registrar_compra(p_compra || jsonb_build_object(
            'pagado_con', 'efectivo', 'socio_id', null,
            'fecha', coalesce(nullif(p_compra ->> 'fecha', ''), ((r.creado_en at time zone 'America/Bogota')::date)::text)));
  update gastos set pagado_con = 'caja' where compra_id = v_id;
  perform _vincular_retiro(p_retiro_id, 'compra', v_id);
  return v_id;
end $$;

create or replace function registrar_gasto_de_retiro(p_retiro_id uuid, p_categoria_id bigint, p_descripcion text,
                                                     p_monto bigint default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r     retiros_caja%rowtype;
  v_id  uuid;
begin
  r := _retiro_libre(p_retiro_id);
  if not exists (select 1 from categorias_gasto where id = p_categoria_id) then
    raise exception 'Elige la categoría' using errcode = '22023';
  end if;
  insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, retiro_id)
  values ((r.creado_en at time zone 'America/Bogota')::date, p_categoria_id, coalesce(nullif(p_monto, 0), r.monto),
          coalesce(nullif(trim(p_descripcion), ''), r.tercero || coalesce(' · ' || r.motivo, '')), 'caja', p_retiro_id)
  returning id into v_id;
  return v_id;
end $$;

-- Vale o préstamo pagado con el efectivo de ese retiro
create or replace function registrar_pago_de_retiro(p_retiro_id uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r     retiros_caja%rowtype;
  v_id  uuid;
begin
  r := _retiro_libre(p_retiro_id);
  if p ->> 'tipo' not in ('vale', 'prestamo') then
    raise exception 'Desde un retiro solo se registran vales o préstamos' using errcode = '22023';
  end if;
  v_id := registrar_pago_personal(p || jsonb_build_object(
            'pagado_con', 'efectivo', 'socio_id', null,
            'monto', coalesce(nullif(p ->> 'monto', '')::bigint, r.monto),
            'fecha', ((r.creado_en at time zone 'America/Bogota')::date)::text));
  perform _vincular_retiro(p_retiro_id, 'pago', v_id);
  return v_id;
end $$;

create or replace function marcar_retiro_sin_gasto(p_retiro_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _retiro_libre(p_retiro_id);
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe por qué no es un gasto' using errcode = '22023';
  end if;
  update retiros_caja set sin_gasto_motivo = trim(p_motivo) where id = p_retiro_id;
end $$;

-- Registros cercanos (±4 días) que podrían ser ese retiro ya registrado
create or replace function candidatos_retiro(p_retiro_id uuid)
returns table (tipo text, id uuid, fecha date, descripcion text, monto bigint, pagado_con text, otro_retiro boolean)
language sql stable security definer set search_path = public as $$
  with r as (select (creado_en at time zone 'America/Bogota')::date as dia, monto from retiros_caja where id = p_retiro_id)
  select x.* from (
    select 'compra', c.id, c.fecha, 'Compra · ' || coalesce(c.proveedor, 'sin proveedor'),
           (select coalesce(sum(costo_total), 0) from compra_items where compra_id = c.id)
             + (select coalesce(sum(monto), 0) from gastos where compra_id = c.id),
           c.pagado_con, c.retiro_id is not null
      from compras c, r
     where c.fecha between r.dia - 4 and r.dia + 4 and c.pagado_con is distinct from 'socio'
       and (c.retiro_id is null or _retiro_automatico(c.retiro_id))
       and c.pagado_con is distinct from 'fondo' and c.retiro_id is distinct from p_retiro_id
    union all
    select 'pago', pp.id, pp.fecha,
           initcap(pp.tipo) || ' · ' || pp.persona || coalesce(' · ' || pp.periodo, ''),
           pp.monto, pp.pagado_con, coalesce(pp.retiro_id, g.retiro_id) is not null
      from pagos_personal pp left join gastos g on g.id = pp.gasto_id, r
     where pp.fecha between r.dia - 4 and r.dia + 4 and pp.tipo in ('nomina', 'vale', 'prestamo')
       and (coalesce(pp.retiro_id, g.retiro_id) is null or _retiro_automatico(coalesce(pp.retiro_id, g.retiro_id)))
       and pp.anulado_en is null and pp.pagado_con in ('caja', 'efectivo')
    union all
    select 'gasto', g.id, g.fecha, coalesce(cg.nombre, 'Gasto') || coalesce(' · ' || g.descripcion, ''),
           g.monto, g.pagado_con, g.retiro_id is not null
      from gastos g join categorias_gasto cg on cg.id = g.categoria_id, r
     where g.fecha between r.dia - 4 and r.dia + 4 and g.compra_id is null
       and (g.retiro_id is null or _retiro_automatico(g.retiro_id))
       and g.pagado_con is distinct from 'socio' and g.pagado_con is distinct from 'fondo'
       and g.retiro_id is distinct from p_retiro_id
       and not exists (select 1 from compras c where c.gasto_id = g.id)
       and not exists (select 1 from pagos_personal pp where pp.gasto_id = g.id)
  ) x (tipo, id, fecha, descripcion, monto, pagado_con, otro_retiro)
  , r
  where es_socio()
  order by abs(x.monto - r.monto), abs(x.fecha - r.dia)
$$;

-- Retiros vigentes y en qué quedaron registrados (para la pantalla de Caja)
create or replace function retiros_clasificados(p_limite int default 150)
returns table (id uuid, registro text)
language sql stable security definer set search_path = public as $$
  select r.id, _registro_de_retiro(r.id)
    from retiros_caja r
   where es_socio()
   order by r.creado_en desc
   limit p_limite
$$;

revoke execute on function _registro_de_retiro(uuid), _retiro_automatico(uuid), _retiro_libre(uuid), _vincular_retiro(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function vincular_retiro(uuid, text, uuid), registrar_compra_de_retiro(uuid, jsonb),
                           registrar_gasto_de_retiro(uuid, bigint, text, bigint), registrar_pago_de_retiro(uuid, jsonb),
                           marcar_retiro_sin_gasto(uuid, text), candidatos_retiro(uuid), retiros_clasificados(int)
  from public, anon;
grant execute on function vincular_retiro(uuid, text, uuid), registrar_compra_de_retiro(uuid, jsonb),
                          registrar_gasto_de_retiro(uuid, bigint, text, bigint), registrar_pago_de_retiro(uuid, jsonb),
                          marcar_retiro_sin_gasto(uuid, text), candidatos_retiro(uuid), retiros_clasificados(int)
  to authenticated;
