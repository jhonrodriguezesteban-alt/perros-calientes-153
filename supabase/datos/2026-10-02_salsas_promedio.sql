-- =====================================================================
-- Salsas: un solo topping con 4 salsas por perro en promedio
--
-- Antes se costeaba una sola salsa (rosada o mostaza). En la realidad cada
-- perro lleva ~4 salsas de tarro entre: tomate, mayonesa, mayonesa de ajo,
-- piña, rosada, BBQ y mostaza. Queda un topping "Salsas" (por defecto en el
-- Perro básico) que gasta 4/7 de la porción de cada una:
--   tomate 2,9 g · mayonesa 2,9 g · ajo 2,9 g · piña 3,4 g · rosada 2,9 g
--   BBQ 2,3 g · mostaza 1,7 g  → ~19 g de salsa por perro.
-- * Las 7 salsas sueltas salen del POS (la salsa de huevo y la tártara
--   siguen igual).
-- * Las ventas de perros que llevaban alguna de esas salsas pasan a
--   "Salsas" y se recalcula su costo (el inventario ya descontado no se toca).
-- Un solo bloque para el SQL Editor de Supabase. Se puede correr más de una vez.
-- =====================================================================
do $$
declare
  v_t      bigint;
  v_viejas bigint[];
  v_items  bigint[];
  v_ventas uuid[];
  x        record;
begin
  insert into toppings (nombre, es_premium, orden, activo) values ('Salsas', false, 1, true)
  on conflict (nombre) do update set activo = true, orden = 1
  returning id into v_t;

  -- Porción de cada salsa × 4 salsas ÷ 7 salsas
  delete from topping_insumos where topping_id = v_t;
  for x in select * from (values ('Salsa de tomate', 5), ('Mayonesa', 5), ('Mayonesa de ajo', 5),
                                 ('Salsa de piña', 6), ('Salsa rosada', 5), ('Salsa BBQ', 4), ('Mostaza', 3)) s(insumo, g) loop
    if not exists (select 1 from insumos where nombre = x.insumo) then
      raise notice 'No existe el insumo "%": Salsas queda sin ese consumo', x.insumo;
      continue;
    end if;
    insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
    values (v_t, (select id from insumos where nombre = x.insumo), round(x.g * 4.0 / 7, 3), true);
  end loop;

  -- En todos los perros que ofrecían salsas: "Salsas" por defecto y sin costo
  select array_agg(id) into v_viejas from toppings
   where nombre in ('Salsa de tomate', 'Mayonesa', 'Mayonesa de ajo', 'Salsa de piña', 'Salsa rosada', 'Salsa BBQ', 'Mostaza');

  insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
  select distinct pt.producto_id, v_t, true, 0
    from producto_toppings pt where pt.topping_id = any (v_viejas)
  on conflict (producto_id, topping_id) do update set incluido_por_defecto = true;
  insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
  select id, v_t, true, 0 from productos where nombre = 'Perro básico'
  on conflict (producto_id, topping_id) do update set incluido_por_defecto = true;

  delete from producto_toppings where topping_id = any (v_viejas);
  update toppings set activo = false where id = any (v_viejas);

  -- Ventas pasadas: las salsas sueltas pasan a "Salsas"
  select array_agg(distinct vt.venta_item_id) into v_items
    from venta_item_toppings vt where vt.topping_id = any (v_viejas);
  if v_items is null then
    return;
  end if;

  insert into venta_item_toppings (venta_item_id, topping_id, nombre_topping, precio_extra)
  select i, v_t, 'Salsas', 0 from unnest(v_items) i
  on conflict do nothing;
  delete from venta_item_toppings where venta_item_id = any (v_items) and topping_id = any (v_viejas);

  select array_agg(distinct venta_id) into v_ventas from venta_items where id = any (v_items);

  update venta_items vi
     set costo_unitario = round(y.costo / vi.cantidad, 2)
    from (select c.item_id, sum(c.cantidad * coalesce(m.costo, i.costo_unitario)) as costo
            from (select vi3.venta_id, vi3.id as item_id, r.insumo_id, r.cantidad * vi3.cantidad as cantidad
                    from venta_items vi3 join receta_items r on r.producto_id = vi3.producto_id
                   where vi3.venta_id = any (v_ventas)
                  union all
                  select vi3.venta_id, vi3.id, ti.insumo_id, ti.cantidad * vi3.cantidad
                    from venta_items vi3
                    join venta_item_toppings vt on vt.venta_item_id = vi3.id
                    join topping_insumos ti on ti.topping_id = vt.topping_id
                   where vi3.venta_id = any (v_ventas)) c
            join insumos i on i.id = c.insumo_id
            left join lateral (select max(mm.costo_unitario) as costo from movimientos_inventario mm
                                where mm.venta_id = c.venta_id and mm.insumo_id = c.insumo_id
                                  and mm.tipo = 'consumo_venta') m on true
           group by c.item_id) y
   where vi.id = y.item_id;

  update ventas v
     set costo_insumos = round(y.costo, 2)
    from (select venta_id, sum(costo_unitario * cantidad) as costo from venta_items
           where venta_id = any (v_ventas) group by 1) y
   where v.id = y.venta_id;
end $$;

-- Revisión: lo que cuesta el topping Salsas y el perro de octubre
select t.nombre, string_agg(i.nombre || ' ' || rtrim(rtrim(ti.cantidad::text, '0'), '.') || ' g', ' + ') as lleva,
       round(sum(ti.cantidad * i.costo_unitario)) as costo
  from toppings t join topping_insumos ti on ti.topping_id = t.id join insumos i on i.id = ti.insumo_id
 where t.nombre = 'Salsas' group by t.nombre;
select round(sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)) as materia_prima_por_perro_octubre
  from venta_items vi join ventas v on v.id = vi.venta_id
 where v.estado = 'completada' and vi.tipo_producto = 'perro'
   and v.vendida_en >= '2026-10-01T00:00:00-05:00';
