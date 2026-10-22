-- Evento de Sebastián · sábado 17 de octubre · 56 perros por $540.000 en efectivo
do $$
declare
  v_socio  uuid := coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                            (select id from perfiles where rol = 'socio' and activo order by nombre limit 1));
  v_perro  bigint := (select id from productos where nombre = 'Perro básico');
  v_id     uuid := gen_random_uuid();
  v_turno  uuid;
  v_hora   timestamptz := '2026-10-17 20:00:00-05';
  v_retiro uuid;
begin
  if exists (select 1 from ventas where notas like 'Evento de Sebastián 17-oct%' and estado = 'completada') then
    raise notice 'La venta del evento ya estaba registrada';
    return;
  end if;
  perform set_config('request.jwt.claim.sub', v_socio::text, true);

  -- 56 perros básicos con los toppings de la casa (descuenta pan, salchicha y toppings)
  perform registrar_venta(jsonb_build_object(
    'id', v_id, 'metodo_pago', 'efectivo',
    'notas', 'Evento de Sebastián 17-oct: 56 perros por $540.000 (precio especial)',
    'items', jsonb_build_array(jsonb_build_object(
      'producto_id', v_perro, 'cantidad', 56,
      'toppings', (select coalesce(jsonb_agg(topping_id), '[]') from producto_toppings
                    where producto_id = v_perro and incluido_por_defecto)))));

  -- Precio cerrado del evento y fecha del sábado
  v_turno := (_turno_del_dia('2026-10-17')).id;
  update venta_items set precio_unitario = round(540000 / 56.0), extras_unitario = 0, subtotal = 540000 where venta_id = v_id;
  update venta_pagos set monto = 540000 where venta_id = v_id;
  update ventas set total = 540000, vendida_en = v_hora, turno_id = v_turno where id = v_id;
  update movimientos_inventario set creado_en = v_hora where venta_id = v_id;

  -- La plata no entró a la caja del local: sale el mismo día (el cierre sigue cuadrando)
  if v_turno is not null then
    insert into retiros_caja (turno_id, monto, tercero, motivo, creado_en)
    values (v_turno, 540000, 'Evento de Sebastián', 'Plata del evento (no entró a la caja del local)', v_hora)
    returning id into v_retiro;
    if exists (select 1 from information_schema.columns where table_name = 'retiros_caja' and column_name = 'sin_gasto_motivo') then
      execute 'update retiros_caja set sin_gasto_motivo = $1 where id = $2'
        using 'Efectivo del evento de Sebastián: lo manejan los socios fuera de la caja', v_retiro;
    end if;
    if exists (select 1 from information_schema.columns where table_name = 'retiros_caja' and column_name = 'manual') then
      execute 'update retiros_caja set manual = true where id = $1' using v_retiro;
    end if;
    perform _recalcular_cierre(v_turno);
  end if;
  raise notice 'Venta del evento registrada el sábado 17 (caja %)', coalesce(v_turno::text, 'sin caja ese día');
end $$;

-- Revisión
select numero, to_char(vendida_en at time zone 'America/Bogota', 'DD Mon HH24:MI') as fecha, total, metodo_pago,
       (select sum(cantidad) from venta_items where venta_id = v.id) as perros, notas
  from ventas v where notas like 'Evento de Sebastián 17-oct%';
