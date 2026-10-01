-- =====================================================================
-- Gramajes reales de los toppings (medición con gramera, 2-oct)
--
-- Pan + salchicha ≈ 143–154 g. Por perro:
--   cebolla 36 g · piña en cuadros 24 g · pepinillo 12 g (jalapeño igual)
--   cebolla crispy 5 g · salsa de huevo 22 g · papa ripio 8 g
--   papa de pollo (hojuela) 11 g · queso Saravena 8 g
--   salsas: piña 6 g, BBQ 4 g, mostaza 3 g, tártara 3 g; las demás ~5 g
-- Ajustes:
--   * Cebolla: los 36 g incluyen el agua donde se remoja; seca se estima en
--     25 g (una cebolla picada ≈ 150 g → ~6 perros).
--   * Salsa de huevo por tanda: 8 huevos duros (~400 g) + 1 cebolla (~150 g)
--     + salsa rosada (~600 g, estimado) ≈ 1.150 g. En 22 g por perro van
--     ~0,15 huevo + ~3 g de cebolla + ~12 g de salsa rosada.
--   * Queso doble crema desmoronado: 8 g, igual que el Saravena.
--   * Pico de gallo (tomate, cebolla, limón, vinagre y sal): sin medir, como
--     la cebolla ≈ 25 g → tomate 15 g + cebolla 8 g + 0,1 limón.
-- Estimados (es_estimado): cebolla, salsa de huevo, pico de gallo, relish.
--
-- Todos quedan como toppings del Perro básico SIN costo extra, para que en
-- el POS se marque lo que la persona pidió y el consumo sea real. Los que
-- ya venían marcados por defecto siguen igual. Los adicionales de $2.000 no
-- se tocan. Solo cambia el consumo de las ventas de aquí en adelante.
-- Se puede correr más de una vez.
-- =====================================================================
begin;

-- Insumos del pico de gallo (costo estimado hasta la primera compra)
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota, familia) values
  ('Tomate', 'g',   5, 500, true, 'Estimado ~$5.000 el kilo: confirmar con la compra', 'perro'),
  ('Limón',  'und', 400, 10, true, 'Estimado: confirmar con la compra', 'perro')
on conflict (nombre) do nothing;

create or replace function pg_temp.topping(p_nombre text, p_orden int, p_insumos jsonb, p_estimado boolean default false)
returns void language plpgsql as $$
declare
  v_t  bigint;
  v_p  bigint := (select id from productos where nombre = 'Perro básico');
  x    jsonb;
begin
  insert into toppings (nombre, es_premium, orden, activo) values (p_nombre, false, p_orden, true)
  on conflict (nombre) do update set activo = true
  returning id into v_t;

  delete from topping_insumos where topping_id = v_t;
  for x in select * from jsonb_array_elements(p_insumos) loop
    if not exists (select 1 from insumos where nombre = x ->> 'insumo') then
      raise notice 'No existe el insumo "%": el topping % queda sin ese consumo', x ->> 'insumo', p_nombre;
      continue;
    end if;
    insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
    values (v_t, (select id from insumos where nombre = x ->> 'insumo'), (x ->> 'g')::numeric, p_estimado);
  end loop;

  -- En el Perro básico, sin costo extra (si ya estaba, se respeta si viene por defecto)
  insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
  values (v_p, v_t, false, 0)
  on conflict (producto_id, topping_id) do nothing;
end $$;

-- Los de la casa (ya existían)
select pg_temp.topping('Salsa rosada',      1, '[{"insumo":"Salsa rosada","g":5}]');
select pg_temp.topping('Mostaza',           2, '[{"insumo":"Mostaza","g":3}]');
select pg_temp.topping('Pepinillo',         3, '[{"insumo":"Pepinillo","g":12}]');
select pg_temp.topping('Salsa de huevo',    4, '[{"insumo":"Salsa rosada","g":12},{"insumo":"Huevo","g":0.15},{"insumo":"Cebolla cabezona","g":3}]', true);
select pg_temp.topping('Papa ripio',        5, '[{"insumo":"Papa ripio","g":8}]');
select pg_temp.topping('Papa hojuela',      6, '[{"insumo":"Papa hojuela","g":11}]');
select pg_temp.topping('Queso doble crema', 7, '[{"insumo":"Queso doble crema","g":8}]');
select pg_temp.topping('Queso Saravena',    8, '[{"insumo":"Queso Saravena","g":8}]');

-- Nuevos sin costo extra
select pg_temp.topping('Cebolla',           9, '[{"insumo":"Cebolla cabezona","g":25}]', true);
select pg_temp.topping('Piña',             10, '[{"insumo":"Piña en almíbar","g":24}]');
select pg_temp.topping('Cebolla crispy',   11, '[{"insumo":"Cebolla frita","g":5}]');
select pg_temp.topping('Jalapeños',        12, '[{"insumo":"Jalapeños","g":12}]');
select pg_temp.topping('Salsa de piña',    13, '[{"insumo":"Salsa de piña","g":6}]');
select pg_temp.topping('Salsa BBQ',        14, '[{"insumo":"Salsa BBQ","g":4}]');
select pg_temp.topping('Salsa tártara',    15, '[{"insumo":"Salsa tártara","g":3}]');
select pg_temp.topping('Salsa de tomate',  16, '[{"insumo":"Salsa de tomate","g":5}]');
select pg_temp.topping('Mayonesa',         17, '[{"insumo":"Mayonesa","g":5}]');
select pg_temp.topping('Mayonesa de ajo',  18, '[{"insumo":"Mayonesa de ajo","g":5}]');
select pg_temp.topping('Sweet relish',     19, '[{"insumo":"Sweet relish","g":5}]', true);
select pg_temp.topping('Pico de gallo',    20, '[{"insumo":"Tomate","g":15},{"insumo":"Cebolla cabezona","g":8},{"insumo":"Limón","g":0.1}]', true);

commit;

-- Revisión: cada topping del Perro básico, su gramaje y lo que cuesta
select t.nombre as topping,
       case when pt.incluido_por_defecto then 'sí' else '' end as por_defecto,
       pt.precio_extra,
       string_agg(i.nombre || ' ' || rtrim(rtrim(ti.cantidad::text, '0'), '.') || ' ' || i.unidad, ' + ') as lleva,
       round(sum(ti.cantidad * i.costo_unitario)) as costo
  from producto_toppings pt
  join toppings t on t.id = pt.topping_id and t.activo
  join productos p on p.id = pt.producto_id and p.nombre = 'Perro básico'
  left join topping_insumos ti on ti.topping_id = t.id
  left join insumos i on i.id = ti.insumo_id
 group by t.nombre, t.orden, pt.incluido_por_defecto, pt.precio_extra
 order by pt.precio_extra, t.orden;
