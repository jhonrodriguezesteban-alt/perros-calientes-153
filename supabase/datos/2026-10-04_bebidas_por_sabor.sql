-- =====================================================================
-- Bebidas por sabor y tamaño
--
-- Cada sabor y tamaño es su propio insumo, para saber exactamente qué hay:
--   Gaseosa pequeña y Gaseosa personal: Coca-Cola, Coca-Cola Zero,
--     Cola Romana, Sprite, Colombiana, Pepsi, Manzana, Uva, Naranja
--   Agua (600 ml) y Agua pequeña (280 ml): Normal, Con gas, Saborizada
-- En el POS siguen los mismos botones (Gaseosa pequeña, Gaseosa personal,
-- Agua, Agua pequeña) y al tocarlos se elige el sabor; la venta descuenta
-- ese sabor del inventario.
--
-- Los insumos que ya existían se renombran (conservan stock, costo e
-- historial):
--   Gaseosa personal → Gaseosa personal · Coca-Cola
--   Gaseosa pequeña  → Gaseosa pequeña · Coca-Cola
--   Agua 600 ml      → Agua · Normal
--   Agua saborizada  → Agua · Saborizada
-- Después hay que repartir lo que hay de verdad con un conteo de inventario
-- (ej. las 2 Pepsi mini) y corregir la compra de Coca-Cola con "Editar".
-- El producto "Agua saborizada" queda dentro de "Agua" (sabor Saborizada).
-- "Agua pequeña" se crea a $2.000: cambia el precio en Menú si es otro.
-- Un solo bloque para el SQL Editor. Se puede correr más de una vez.
-- =====================================================================
do $$
declare
  v_gaseosas text[] := array['Coca-Cola', 'Coca-Cola Zero', 'Cola Romana', 'Sprite', 'Colombiana', 'Pepsi', 'Manzana', 'Uva', 'Naranja'];
  v_aguas    text[] := array['Normal', 'Con gas', 'Saborizada'];
  v_cat      bigint;
  v_prod     bigint;
  v_top      bigint;
  v_ins      bigint;
  v_costo    numeric;
  r          record;
  v_sabor    text;
  n          int;
begin
  -- 1. Insumos que ya existían → renombrar (si el nombre nuevo no existe)
  for r in select * from (values ('Gaseosa personal', 'Gaseosa personal · Coca-Cola'),
                                 ('Gaseosa pequeña', 'Gaseosa pequeña · Coca-Cola'),
                                 ('Agua 600 ml', 'Agua · Normal'),
                                 ('Agua saborizada', 'Agua · Saborizada')) x(viejo, nuevo) loop
    if not exists (select 1 from insumos where nombre = r.nuevo) then
      update insumos set nombre = r.nuevo, familia = 'bebidas' where nombre = r.viejo;
    end if;
  end loop;

  -- 2. Productos: Agua 600 ml → Agua; Agua saborizada queda dentro de Agua
  update productos set nombre = 'Agua' where nombre = 'Agua 600 ml' and not exists (select 1 from productos where nombre = 'Agua');
  update productos set activo = false where nombre = 'Agua saborizada';
  select categoria_id into v_cat from productos where nombre = 'Gaseosa personal';
  if not exists (select 1 from productos where nombre = 'Agua pequeña') then
    insert into productos (categoria_id, nombre, tipo, precio, orden, activo)
    values (v_cat, 'Agua pequeña', 'bebida', 2000,
            coalesce((select max(orden) from productos where categoria_id = v_cat), 0) + 1, true);
  end if;

  -- 3. Cada tamaño: un insumo y un topping (grupo "Sabor") por sabor
  for r in select * from (values ('Gaseosa pequeña', 'Gaseosa pequeña', 1),
                                 ('Gaseosa personal', 'Gaseosa personal', 1),
                                 ('Agua', 'Agua', 2),
                                 ('Agua pequeña', 'Agua pequeña', 2)) x(producto, prefijo, clase) loop
    select id into v_prod from productos where nombre = r.producto;
    if v_prod is null then
      raise notice 'No existe el producto %', r.producto;
      continue;
    end if;
    -- Costo de referencia del tamaño (el del insumo que ya existía)
    select max(costo_unitario) into v_costo from insumos where nombre like r.prefijo || ' · %';
    v_costo := coalesce(v_costo, case r.producto when 'Agua pequeña' then 963 when 'Gaseosa pequeña' then 1600 else 2450 end);

    -- La bebida ya no descuenta por receta: descuenta el sabor elegido
    delete from receta_items where producto_id = v_prod;

    n := 0;
    foreach v_sabor in array case r.clase when 1 then v_gaseosas else v_aguas end loop
      n := n + 1;
      insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, familia, nota)
      values (r.prefijo || ' · ' || v_sabor, 'und', v_costo, 0, true, 'bebidas', 'Costo estimado hasta la primera compra')
      on conflict (nombre) do update set activo = true, familia = 'bebidas'
      returning id into v_ins;

      insert into toppings (nombre, es_premium, orden, activo, grupo)
      values (r.prefijo || ' · ' || v_sabor, false, n, true, 'Sabor')
      on conflict (nombre) do update set activo = true, grupo = 'Sabor', orden = excluded.orden
      returning id into v_top;

      delete from topping_insumos where topping_id = v_top;
      insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado) values (v_top, v_ins, 1, false);

      -- El primero (Coca-Cola / Normal) viene marcado
      insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
      values (v_prod, v_top, n = 1, 0)
      on conflict (producto_id, topping_id) do update set incluido_por_defecto = excluded.incluido_por_defecto;
    end loop;
  end loop;
end $$;

-- Revisión: bebidas del POS con sus sabores y el stock de cada uno
select p.nombre as producto, p.precio, t.nombre as sabor, i.stock_actual as stock, round(i.costo_unitario) as costo
  from productos p
  join producto_toppings pt on pt.producto_id = p.id
  join toppings t on t.id = pt.topping_id and t.grupo = 'Sabor'
  join topping_insumos ti on ti.topping_id = t.id
  join insumos i on i.id = ti.insumo_id
 where p.activo and p.tipo = 'bebida'
 order by p.orden, t.orden;
