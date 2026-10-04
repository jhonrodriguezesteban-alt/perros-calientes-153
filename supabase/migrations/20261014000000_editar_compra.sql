-- =====================================================================
-- Editar una compra ya registrada
--
-- editar_compra(id, compra): cambia fecha, proveedor, con qué se pagó y los
-- renglones (insumos y equipos) de una compra. Para que todo siga cuadrando:
-- * Inventario: se deshace lo que entró con los renglones viejos y entra lo
--   de los nuevos.
-- * Costo promedio: se le quita al promedio lo que puso la compra vieja y se
--   promedia con la nueva (si ya no queda stock, queda el costo de la nueva).
-- * Gasto de insumos, retiro de caja (si se pagó con la caja) y su cierre,
--   y los gastos de equipos quedan con los valores nuevos.
-- No se puede cambiar a "Efectivo de la caja" ni quitarlo (eso mueve el
-- cierre de un día); para eso, anular y registrar de nuevo.
-- Se puede correr más de una vez.
-- =====================================================================

create or replace function editar_compra(p_compra_id uuid, p_compra jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c         compras%rowtype;
  v_fecha   date := coalesce((p_compra ->> 'fecha')::date, hoy_bogota());
  v_prov    text := nullif(trim(p_compra ->> 'proveedor'), '');
  v_pago    text := nullif(p_compra ->> 'pagado_con', '');
  v_socio   uuid := nullif(p_compra ->> 'socio_id', '')::uuid;
  v_items   jsonb := coalesce(p_compra -> 'items', '[]');
  v_equipos jsonb := coalesce(p_compra -> 'equipos', '[]');
  v_eq      jsonb;
  r         record;
  v_stock   numeric;
  v_costo   numeric;
  v_total   bigint;
  v_gasto   uuid;
  v_turno   uuid;
  v_turnos  uuid[] := '{}';
  v_retiro  uuid;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede editar compras' using errcode = '42501';
  end if;
  select * into c from compras where id = p_compra_id for update;
  if not found then
    raise exception 'La compra no existe' using errcode = '22023';
  end if;
  if v_fecha > hoy_bogota() then
    raise exception 'La fecha no puede ser futura' using errcode = '22023';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_typeof(v_equipos) <> 'array'
     or jsonb_array_length(v_items) + jsonb_array_length(v_equipos) = 0 then
    raise exception 'La compra no tiene productos' using errcode = '22023';
  end if;
  if v_pago is null or v_pago not in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo') then
    raise exception 'Elige con qué se pagó' using errcode = '22023';
  end if;
  if (v_pago = 'caja') is distinct from (c.pagado_con = 'caja') then
    raise exception 'No se puede pasar a "Efectivo de la caja" ni quitarlo al editar' using errcode = '22023';
  end if;
  if v_pago = 'socio' and not exists (select 1 from perfiles where id = v_socio and rol = 'socio') then
    raise exception 'Elige qué socio puso la plata' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_items) i
              where (i ->> 'insumo_id') is null or coalesce((i ->> 'cantidad')::numeric, 0) <= 0
                 or coalesce((i ->> 'costo_total')::bigint, -1) < 0) then
    raise exception 'Cada insumo necesita cantidad y valor' using errcode = '22023';
  end if;
  for v_eq in select * from jsonb_array_elements(v_equipos) loop
    if coalesce(trim(v_eq ->> 'descripcion'), '') = '' or coalesce((v_eq ->> 'costo_total')::bigint, 0) <= 0 then
      raise exception 'Cada equipo necesita descripción y valor' using errcode = '22023';
    end if;
  end loop;

  -- 1. Deshacer los insumos viejos (costo promedio e inventario)
  perform set_config('bpc.origen_costo', 'compra', true);
  perform set_config('bpc.motivo_costo', 'Compra editada ' || p_compra_id, true);
  for r in select * from compra_items where compra_id = p_compra_id order by id loop
    select stock_actual, costo_unitario into v_stock, v_costo from insumos where id = r.insumo_id for update;
    if v_stock - r.cantidad > 0 and v_stock * v_costo - r.costo_total >= 0 then
      update insumos set costo_unitario = round((v_stock * v_costo - r.costo_total) / (v_stock - r.cantidad), 4)
       where id = r.insumo_id;
    end if;
    delete from movimientos_inventario
     where id = (select id from movimientos_inventario
                  where compra_id = p_compra_id and insumo_id = r.insumo_id and tipo = 'compra'
                  order by abs(cantidad - r.cantidad), id limit 1);
  end loop;
  perform set_config('bpc.origen_costo', '', true);
  delete from compra_items where compra_id = p_compra_id;

  -- 2. Datos de la compra
  update compras
     set fecha = v_fecha,
         proveedor = v_prov,
         pagado_con = v_pago,
         socio_id = case when v_pago = 'socio' then v_socio when monto_socio is not null then socio_id end
   where id = p_compra_id;

  -- 3. Insumos nuevos (el trigger suma al inventario y promedia el costo)
  insert into compra_items (compra_id, insumo_id, cantidad, costo_total)
  select p_compra_id, (i ->> 'insumo_id')::bigint, (i ->> 'cantidad')::numeric, (i ->> 'costo_total')::bigint
    from jsonb_array_elements(v_items) i;
  update movimientos_inventario m set creado_en = coalesce(c.creado_en, m.creado_en)
   where m.compra_id = p_compra_id and m.tipo = 'compra';

  select coalesce(sum(costo_total), 0) into v_total from compra_items where compra_id = p_compra_id;
  if c.monto_socio is not null and c.monto_socio >= v_total + coalesce((select sum((e ->> 'costo_total')::bigint) from jsonb_array_elements(v_equipos) e), 0) then
    raise exception 'La parte que puso el socio (%) no puede ser mayor que el total', c.monto_socio using errcode = '22023';
  end if;

  -- 4. Gasto de insumos
  if c.gasto_id is not null then
    if v_total > 0 then
      update gastos set monto = v_total, fecha = v_fecha,
                        descripcion = 'Compra de insumos' || coalesce(' · ' || v_prov, '')
       where id = c.gasto_id;
    else
      update compras set gasto_id = null where id = p_compra_id;
      delete from gastos where id = c.gasto_id;
    end if;
  end if;

  -- 5. Retiro de caja de los insumos
  if c.retiro_id is not null then
    select turno_id into v_turno from retiros_caja where id = c.retiro_id;
    v_turnos := v_turnos || v_turno;
    if v_total > 0 then
      update retiros_caja set monto = v_total, tercero = coalesce(v_prov, 'Proveedor') where id = c.retiro_id;
    else
      update retiros_caja set anulado_en = now(), anulado_por = auth.uid() where id = c.retiro_id and anulado_en is null;
    end if;
  end if;

  -- 6. Equipos: se reemplazan (y su retiro de caja, si lo tenían)
  for r in select g.id, g.retiro_id, rc.turno_id from gastos g left join retiros_caja rc on rc.id = g.retiro_id
            where g.compra_id = p_compra_id loop
    if r.retiro_id is not null then
      v_turnos := v_turnos || r.turno_id;
      update retiros_caja set anulado_en = now(), anulado_por = auth.uid() where id = r.retiro_id and anulado_en is null;
    end if;
    delete from gastos where id = r.id;
  end loop;

  for v_eq in select * from jsonb_array_elements(v_equipos) loop
    v_retiro := null;
    -- Pagada con la caja otro día: el retiro va a la caja de ese día
    if v_pago = 'caja' and v_fecha <> hoy_bogota() then
      v_turno := coalesce(v_turno, (_turno_del_dia(v_fecha)).id);
      if v_turno is not null then
        insert into retiros_caja (turno_id, monto, tercero, motivo)
        values (v_turno, (v_eq ->> 'costo_total')::bigint, trim(v_eq ->> 'descripcion') || coalesce(' · ' || v_prov, ''), 'Gasto: Equipos')
        returning id into v_retiro;
        v_turnos := v_turnos || v_turno;
      end if;
    end if;
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con, pagado_por_socio, compra_id, retiro_id)
    values (v_fecha,
            (select id from categorias_gasto where nombre = 'Equipos'),
            (v_eq ->> 'costo_total')::bigint,
            trim(v_eq ->> 'descripcion') || coalesce(' · ' || v_prov, ''),
            v_pago,
            case when v_pago = 'socio' then v_socio end,
            p_compra_id,
            v_retiro);
  end loop;

  -- 7. Los cierres de caja tocados se recalculan
  for v_turno in select distinct t from unnest(v_turnos) t where t is not null loop
    perform _recalcular_cierre(v_turno);
  end loop;

  return p_compra_id;
end $$;

revoke execute on function editar_compra(uuid, jsonb) from public, anon;
grant execute on function editar_compra(uuid, jsonb) to authenticated;
