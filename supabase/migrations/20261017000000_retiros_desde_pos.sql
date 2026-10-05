-- =====================================================================
-- Retiro de caja que queda registrado desde el POS
--
-- Cuando Andrea saca efectivo, dice de una vez para qué es y queda
-- registrado con ESE retiro (sin descontar dos veces):
--   * compra: proveedor + insumos (cantidad y valor) → compra en Compras,
--     inventario y costos al día, gasto de Insumos.
--   * gasto: categoría + descripción → gasto en Finanzas.
--   * vale: a quién → vale en Nómina (cuenta como pago de la semana).
--   * entrega: plata que se le entrega a un socio → no es gasto.
--   * otro: queda pendiente para que un socio lo registre en Caja.
--
-- También: retiros_caja.manual distingue el retiro que alguien hizo a mano
-- del que la app crea sola al registrar una compra o gasto "con efectivo de
-- la caja" (antes se adivinaba por el motivo, y Andrea usa "Compra de
-- insumos" como motivo). Solo un retiro automático repetido se puede
-- anular al unirlo en Caja.
-- Se puede correr más de una vez.
-- =====================================================================

alter table retiros_caja add column if not exists manual boolean not null default false;

-- Los que ya existen: automático = lo creó la misma operación que la compra,
-- gasto o préstamo que lo usa (misma hora exacta); los demás son a mano.
update retiros_caja r set manual = true
 where not r.manual
   and not exists (select 1 from compras c where c.retiro_id = r.id and c.creado_en = r.creado_en)
   and not exists (select 1 from gastos g where g.retiro_id = r.id and g.creado_en = r.creado_en)
   and not exists (select 1 from pagos_personal p where p.retiro_id = r.id and p.creado_en = r.creado_en);

create or replace function _retiro_automatico(p_retiro_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from retiros_caja where id = p_retiro_id and not manual)
$$;

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
  insert into retiros_caja (turno_id, monto, tercero, motivo, manual)
  values (v_turno.id, p_monto, trim(p_tercero), nullif(trim(p_motivo), ''), true)
  returning id into v_id;
  return v_id;
end $$;

-- Categorías de gasto que se pueden pagar desde la caja (para el POS)
create or replace function categorias_gasto_pos()
returns table (id bigint, nombre text)
language sql stable security definer set search_path = public as $$
  select id, nombre from categorias_gasto
   where rol_actual() is not null
     and nombre not in ('Insumos', 'Nómina', 'Cuota recuperación a socios', 'Intereses y costos financieros', 'Arriendo')
   order by nombre
$$;

create or replace function registrar_retiro_detallado(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tipo    text := p ->> 'tipo';
  v_tercero text := nullif(trim(p ->> 'tercero'), '');
  v_motivo  text := nullif(trim(p ->> 'motivo'), '');
  v_monto   bigint := coalesce((p ->> 'monto')::bigint, 0);
  v_items   jsonb := coalesce(p -> 'items', '[]');
  v_retiro  uuid;
  v_compra  uuid;
  v_gasto   uuid;
  v_persona text;
  v_cat     bigint;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if v_tipo not in ('compra', 'gasto', 'vale', 'entrega', 'otro') then
    raise exception 'Elige para qué es el retiro' using errcode = '22023';
  end if;

  if v_tipo = 'compra' then
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
      raise exception 'Agrega lo que se compró' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_items) i
                where not exists (select 1 from insumos where id = (i ->> 'insumo_id')::bigint and activo)
                   or coalesce((i ->> 'cantidad')::numeric, 0) <= 0
                   or coalesce((i ->> 'costo_total')::bigint, 0) <= 0) then
      raise exception 'Cada producto necesita cantidad y valor' using errcode = '22023';
    end if;
    select sum((i ->> 'costo_total')::bigint) into v_monto from jsonb_array_elements(v_items) i;
    v_motivo := coalesce(v_motivo, 'Compra de insumos');
  elsif v_tipo = 'gasto' then
    v_cat := nullif(p ->> 'categoria_id', '')::bigint;
    if not exists (select 1 from categorias_gasto_pos() c where c.id = v_cat) then
      raise exception 'Elige qué tipo de gasto es' using errcode = '22023';
    end if;
    if v_motivo is null then
      raise exception 'Escribe qué se compró o pagó' using errcode = '22023';
    end if;
  elsif v_tipo = 'vale' then
    v_persona := coalesce(nullif(trim(p ->> 'persona'), ''), v_tercero);
    if v_persona is null then
      raise exception 'Escribe a quién es el vale' using errcode = '22023';
    end if;
    v_tercero := coalesce(v_tercero, v_persona);
    v_motivo := coalesce(v_motivo, 'Vale');
  elsif v_tipo = 'entrega' then
    v_motivo := coalesce(v_motivo, 'Entrega a socio');
  end if;

  v_retiro := registrar_retiro(v_monto, v_tercero, v_motivo);

  if v_tipo = 'compra' then
    insert into compras (fecha, proveedor, pagado_con, retiro_id)
    values (hoy_bogota(), v_tercero, 'caja', v_retiro)
    returning id into v_compra;
    insert into compra_items (compra_id, insumo_id, cantidad, costo_total)
    select v_compra, (i ->> 'insumo_id')::bigint, (i ->> 'cantidad')::numeric, (i ->> 'costo_total')::bigint
      from jsonb_array_elements(v_items) i;
    insert into gastos (fecha, categoria_id, monto, descripcion)
    values (hoy_bogota(), (select id from categorias_gasto where nombre = 'Insumos'), v_monto,
            'Compra de insumos · ' || v_tercero)
    returning id into v_gasto;
    update compras set gasto_id = v_gasto where id = v_compra;
  elsif v_tipo = 'gasto' then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, retiro_id)
    values (hoy_bogota(), v_cat, v_monto, v_motivo || ' · ' || v_tercero, 'caja', v_retiro);
  elsif v_tipo = 'vale' then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, retiro_id)
    values (hoy_bogota(), (select id from categorias_gasto where nombre = 'Nómina'), v_monto, 'Vale · ' || v_persona, 'caja', v_retiro)
    returning id into v_gasto;
    insert into pagos_personal (fecha, persona, tipo, monto, pagado_con, nota, gasto_id, retiro_id)
    values (hoy_bogota(), v_persona, 'vale', v_monto, 'caja', nullif(v_motivo, 'Vale'), v_gasto, v_retiro);
  elsif v_tipo = 'entrega' then
    update retiros_caja set sin_gasto_motivo = v_motivo where id = v_retiro;
  end if;

  return v_retiro;
end $$;

revoke execute on function categorias_gasto_pos(), registrar_retiro_detallado(jsonb) from public, anon;
grant execute on function categorias_gasto_pos(), registrar_retiro_detallado(jsonb) to authenticated;

notify pgrst, 'reload schema';
