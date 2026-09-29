-- =====================================================================
-- Nómina, vales y préstamos · Compras de equipos
--
-- * pagos_personal: pagos de nómina, vales (adelantos que se descuentan
--   en la siguiente nómina), préstamos (a un socio o a quien sea) y
--   abonos a esos préstamos.
--   - Nómina y vales quedan como gasto (categoría Nómina) con su forma de
--     pago; si salen de la caja hoy, salen como retiro (trigger de gastos).
--   - Un préstamo no es gasto: es plata que debe volver. Sale por su forma
--     de pago y baja cuando se registran abonos.
-- * Compras: además de insumos, renglones de "equipo o utensilio" que no
--   van al inventario. Se guardan como gasto de la categoría Equipos
--   (inversión), ligados a la compra con gastos.compra_id.
-- * flujo_caja descuenta los préstamos pendientes de Bold, Nequi y el fondo
--   y devuelve quién debe cuánto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Compras con equipos
-- ---------------------------------------------------------------------
alter table gastos add column compra_id uuid references compras (id) on delete cascade;
create index on gastos (compra_id);

create or replace function registrar_compra(p_compra jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_compra  uuid;
  v_gasto   uuid;
  v_total   bigint;
  v_fecha   date := coalesce((p_compra ->> 'fecha')::date, hoy_bogota());
  v_prov    text := nullif(trim(p_compra ->> 'proveedor'), '');
  v_pago    text := nullif(p_compra ->> 'pagado_con', '');
  v_socio   uuid := nullif(p_compra ->> 'socio_id', '')::uuid;
  v_turno   turnos%rowtype;
  v_retiro  uuid;
  v_items   jsonb := coalesce(p_compra -> 'items', '[]');
  v_equipos jsonb := coalesce(p_compra -> 'equipos', '[]');
  v_eq      jsonb;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede registrar compras' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_typeof(v_equipos) <> 'array'
     or jsonb_array_length(v_items) + jsonb_array_length(v_equipos) = 0 then
    raise exception 'La compra no tiene productos' using errcode = '22023';
  end if;
  if v_pago is not null and v_pago not in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo') then
    raise exception 'Forma de pago inválida' using errcode = '22023';
  end if;
  if v_pago = 'socio' and not exists (select 1 from perfiles where id = v_socio and rol = 'socio') then
    raise exception 'Elige qué socio puso la plata' using errcode = '22023';
  end if;
  for v_eq in select * from jsonb_array_elements(v_equipos) loop
    if coalesce(trim(v_eq ->> 'descripcion'), '') = '' or coalesce((v_eq ->> 'costo_total')::bigint, 0) <= 0 then
      raise exception 'Cada equipo necesita descripción y valor' using errcode = '22023';
    end if;
  end loop;

  insert into compras (fecha, proveedor, pagado_con, socio_id)
  values (v_fecha, v_prov, v_pago, case when v_pago = 'socio' then v_socio end)
  returning id into v_compra;

  -- Insumos: entran al inventario
  insert into compra_items (compra_id, insumo_id, cantidad, costo_total)
  select v_compra, (i ->> 'insumo_id')::bigint, (i ->> 'cantidad')::numeric, (i ->> 'costo_total')::bigint
    from jsonb_array_elements(v_items) i;

  select coalesce(sum(costo_total), 0) into v_total from compra_items where compra_id = v_compra;

  if coalesce((p_compra ->> 'registrar_gasto')::boolean, true) and v_total > 0 then
    insert into gastos (fecha, categoria_id, monto, descripcion)
    values (v_fecha,
            (select id from categorias_gasto where nombre = 'Insumos'),
            v_total,
            'Compra de insumos' || coalesce(' · ' || v_prov, ''))
    returning id into v_gasto;
    update compras set gasto_id = v_gasto where id = v_compra;
  end if;

  -- Pagada con el efectivo de la caja hoy: sale de la caja como retiro
  if v_pago = 'caja' and v_fecha = hoy_bogota() and v_total > 0 then
    v_turno := _turno_abierto_o_nuevo();
    insert into retiros_caja (turno_id, monto, tercero, motivo)
    values (v_turno.id, v_total, coalesce(v_prov, 'Proveedor'), 'Compra de insumos')
    returning id into v_retiro;
    update compras set retiro_id = v_retiro where id = v_compra;
  end if;

  -- Equipos y utensilios: gasto de inversión (el trigger de gastos saca de
  -- la caja lo que se pague con ella hoy)
  insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, pagado_por_socio, compra_id)
  select v_fecha,
         (select id from categorias_gasto where nombre = 'Equipos'),
         (e ->> 'costo_total')::bigint,
         trim(e ->> 'descripcion') || coalesce(' · ' || v_prov, ''),
         v_pago,
         case when v_pago = 'socio' then v_socio end,
         v_compra
    from jsonb_array_elements(v_equipos) e;

  update solicitudes_pedido
     set estado = 'comprada', atendido_por = auth.uid(), atendido_en = now(), compra_id = v_compra
   where id in (select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(p_compra -> 'solicitudes', '[]')))
     and estado = 'pendiente';

  return v_compra;
end $$;

-- ---------------------------------------------------------------------
-- Nómina, vales y préstamos
-- ---------------------------------------------------------------------
create table pagos_personal (
  id                uuid primary key default gen_random_uuid(),
  fecha             date not null default hoy_bogota(),
  persona           text not null check (trim(persona) <> ''),
  tipo              text not null check (tipo in ('nomina', 'vale', 'prestamo', 'abono')),
  monto             bigint not null check (monto >= 0),       -- lo que se movió de plata
  bruto             bigint,                                   -- nómina: valor antes de descontar vales
  periodo           text,
  pagado_con        text not null check (pagado_con in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo')),
  pagado_por_socio  uuid references perfiles (id),
  nota              text,
  gasto_id          uuid references gastos (id) on delete set null,
  retiro_id         uuid references retiros_caja (id),
  descontado_en     uuid references pagos_personal (id),     -- vale: nómina en la que se descontó
  registrado_por    uuid not null default auth.uid() references perfiles (id),
  creado_en         timestamptz not null default now(),
  anulado_en        timestamptz,
  constraint pagos_personal_socio check (pagado_con is distinct from 'socio' or pagado_por_socio is not null),
  constraint pagos_personal_abono check (tipo <> 'abono' or pagado_con in ('efectivo', 'transferencia', 'fondo')),
  constraint pagos_personal_prestamo check (tipo not in ('prestamo', 'abono') or pagado_con <> 'socio')
);
create index on pagos_personal (fecha desc);
create index on pagos_personal (persona);

alter table pagos_personal enable row level security;
create policy pagos_personal_socios on pagos_personal for select to authenticated using (es_socio());
grant select on pagos_personal to authenticated;
revoke insert, update, delete on pagos_personal from authenticated;
revoke all on pagos_personal from anon;

create or replace function registrar_pago_personal(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id      uuid := gen_random_uuid();
  v_tipo    text := p ->> 'tipo';
  v_persona text := nullif(trim(p ->> 'persona'), '');
  v_fecha   date := coalesce(nullif(p ->> 'fecha', '')::date, hoy_bogota());
  v_pago    text := p ->> 'pagado_con';
  v_socio   uuid := nullif(p ->> 'socio_id', '')::uuid;
  v_monto   bigint := coalesce((p ->> 'monto')::bigint, 0);
  v_bruto   bigint;
  v_vales   uuid[] := coalesce(array(select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(p -> 'vales', '[]')) x), '{}');
  v_desc    bigint := 0;
  v_periodo text := nullif(trim(p ->> 'periodo'), '');
  v_nota    text := nullif(trim(p ->> 'nota'), '');
  v_gasto   uuid;
  v_retiro  uuid;
  v_turno   turnos%rowtype;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede registrar pagos de personal' using errcode = '42501';
  end if;
  if v_tipo not in ('nomina', 'vale', 'prestamo', 'abono') then
    raise exception 'Tipo inválido' using errcode = '22023';
  end if;
  if v_persona is null then
    raise exception 'Escribe a quién' using errcode = '22023';
  end if;
  if v_pago = 'socio' and not exists (select 1 from perfiles where id = v_socio and rol = 'socio') then
    raise exception 'Elige qué socio puso la plata' using errcode = '22023';
  end if;

  if v_tipo = 'nomina' then
    v_bruto := coalesce((p ->> 'bruto')::bigint, 0);
    if v_bruto <= 0 then
      raise exception 'Escribe el valor de la nómina' using errcode = '22023';
    end if;
    select coalesce(sum(monto), 0) into v_desc from pagos_personal
     where id = any (v_vales) and tipo = 'vale' and persona = v_persona and descontado_en is null and anulado_en is null;
    if (select count(*) from pagos_personal where id = any (v_vales) and tipo = 'vale' and persona = v_persona
          and descontado_en is null and anulado_en is null) <> cardinality(v_vales) then
      raise exception 'Algún vale ya se descontó o no es de %', v_persona using errcode = '22023';
    end if;
    v_monto := v_bruto - v_desc;
    if v_monto < 0 then
      raise exception 'Los vales (%) suman más que la nómina', v_desc using errcode = '22023';
    end if;
  elsif v_monto <= 0 then
    raise exception 'Escribe el valor' using errcode = '22023';
  end if;

  if v_tipo = 'abono' then
    if v_monto > (select coalesce(sum(case when tipo = 'prestamo' then monto else -monto end), 0)
                    from pagos_personal where persona = v_persona and tipo in ('prestamo', 'abono') and anulado_en is null) then
      raise exception '% no debe tanto', v_persona using errcode = '22023';
    end if;
  end if;

  -- Nómina y vales: gasto de la categoría Nómina
  if v_tipo in ('nomina', 'vale') and v_monto > 0 then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, pagado_por_socio)
    values (v_fecha, (select id from categorias_gasto where nombre = 'Nómina'), v_monto,
            case v_tipo when 'nomina' then 'Nómina · ' || v_persona || coalesce(' · ' || v_periodo, '')
                        else 'Vale · ' || v_persona end,
            v_pago, case when v_pago = 'socio' then v_socio end)
    returning id, retiro_id into v_gasto, v_retiro;
  end if;

  -- Préstamo con plata de la caja hoy: sale como retiro
  if v_tipo = 'prestamo' and v_pago = 'caja' and v_fecha = hoy_bogota() then
    v_turno := _turno_abierto_o_nuevo();
    insert into retiros_caja (turno_id, monto, tercero, motivo)
    values (v_turno.id, v_monto, v_persona, 'Préstamo' || coalesce(': ' || v_nota, ''))
    returning id into v_retiro;
  end if;

  insert into pagos_personal (id, fecha, persona, tipo, monto, bruto, periodo, pagado_con, pagado_por_socio, nota, gasto_id, retiro_id)
  values (v_id, v_fecha, v_persona, v_tipo, v_monto, v_bruto, v_periodo, v_pago,
          case when v_pago = 'socio' then v_socio end, v_nota, v_gasto, v_retiro);

  if v_tipo = 'nomina' then
    update pagos_personal set descontado_en = v_id where id = any (v_vales);
  end if;
  return v_id;
end $$;

create or replace function anular_pago_personal(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r pagos_personal%rowtype;
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;
  select * into r from pagos_personal where id = p_id and anulado_en is null for update;
  if not found then
    raise exception 'Ese movimiento no existe o ya se anuló' using errcode = '22023';
  end if;
  if r.tipo = 'vale' and r.descontado_en is not null then
    raise exception 'Ese vale ya se descontó en una nómina: anula primero la nómina' using errcode = '22023';
  end if;
  if r.retiro_id is not null then
    if exists (select 1 from retiros_caja rc join turnos t on t.id = rc.turno_id
                where rc.id = r.retiro_id and t.cerrado_en is not null) then
      raise exception 'Salió de la caja de un día ya cerrado; no se puede anular' using errcode = '22023';
    end if;
    update retiros_caja set anulado_en = now(), anulado_por = auth.uid() where id = r.retiro_id;
  end if;
  update pagos_personal set anulado_en = now(), gasto_id = null where id = p_id;
  if r.gasto_id is not null then
    delete from gastos where id = r.gasto_id;
  end if;
  update pagos_personal set descontado_en = null where descontado_en = p_id;
end $$;

-- Préstamos pendientes (prestado − abonado) por forma de pago en un rango
create or replace function _prestamos_netos(p_desde date, p_hasta date)
returns table (pagado_con text, monto bigint)
language sql stable security definer set search_path = public as $$
  select pagado_con, sum(case when tipo = 'prestamo' then monto else -monto end)::bigint
    from pagos_personal
   where tipo in ('prestamo', 'abono') and anulado_en is null and fecha between p_desde and p_hasta
   group by pagado_con
$$;

-- ---------------------------------------------------------------------
-- flujo_caja con préstamos: la función anterior pasa a ser la base
-- ---------------------------------------------------------------------
alter function flujo_caja(date, date) rename to _flujo_caja_base;
revoke execute on function _flujo_caja_base(date, date) from public, anon, authenticated;

create or replace function flujo_caja(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
  v_tot jsonb;
  v_per jsonb;
  k text;
  n_tarjeta bigint; n_transf bigint; n_fondo bigint;
begin
  v := _flujo_caja_base(p_desde, p_hasta);   -- valida que sea socio

  select coalesce(jsonb_object_agg(pagado_con, monto), '{}') into v_tot from _prestamos_netos('-infinity', 'infinity');
  select coalesce(jsonb_object_agg(pagado_con, monto), '{}') into v_per from _prestamos_netos(p_desde, p_hasta);
  n_tarjeta := coalesce((v_tot ->> 'tarjeta')::bigint, 0);
  n_transf  := coalesce((v_tot ->> 'transferencia')::bigint, 0);
  n_fondo   := coalesce((v_tot ->> 'fondo')::bigint, 0);

  v := jsonb_set(v, '{bold}', to_jsonb((v ->> 'bold')::bigint - n_tarjeta));
  v := jsonb_set(v, '{nequi}', to_jsonb((v ->> 'nequi')::bigint - n_transf));
  v := jsonb_set(v, '{fondo,saldo}', to_jsonb((v #>> '{fondo,saldo}')::bigint - n_fondo));
  v := jsonb_set(v, '{disponible}', to_jsonb((v ->> 'disponible')::bigint - n_tarjeta - n_transf - n_fondo));

  -- Préstamos del periodo dentro de las salidas
  for k in select jsonb_object_keys(v #> '{periodo,salidas}') loop
    v := jsonb_set(v, array['periodo', 'salidas', k, 'prestamos'], to_jsonb(coalesce((v_per ->> k)::bigint, 0)));
  end loop;

  -- Movimientos del fondo: préstamos y abonos
  v := jsonb_set(v, '{fondo,movimientos}', coalesce((
    select jsonb_agg(m order by m ->> 'fecha' desc) from (
      select jsonb_array_elements(v #> '{fondo,movimientos}') as m
      union all
      select jsonb_build_object('fecha', fecha, 'tipo', case tipo when 'prestamo' then 'pago' else 'aporte' end,
                                'monto', monto, 'quien', persona,
                                'nota', case tipo when 'prestamo' then 'Préstamo' else 'Abono a préstamo' end)
        from pagos_personal where pagado_con = 'fondo' and tipo in ('prestamo', 'abono') and anulado_en is null) x), '[]'));

  return v || jsonb_build_object(
    'prestamos_por_cobrar', coalesce((
      select jsonb_agg(jsonb_build_object('persona', persona, 'monto', saldo) order by saldo desc)
        from (select persona, sum(case when tipo = 'prestamo' then monto else -monto end) as saldo
                from pagos_personal where tipo in ('prestamo', 'abono') and anulado_en is null
               group by persona) x where saldo > 0), '[]'));
end $$;

revoke execute on function _prestamos_netos(date, date) from public, anon, authenticated;
revoke execute on function flujo_caja(date, date), registrar_pago_personal(jsonb), anular_pago_personal(uuid)
  from public, anon;
grant execute on function flujo_caja(date, date), registrar_pago_personal(jsonb), anular_pago_personal(uuid),
                          registrar_compra(jsonb)
  to authenticated;
