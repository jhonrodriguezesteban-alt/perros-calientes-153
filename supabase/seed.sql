-- Datos de arranque para desarrollo. PRECIOS, CANTIDADES Y COSTOS SON
-- PROVISIONALES: reemplazar con los de la calculadora de costeo.

insert into categorias (nombre, orden) values
  ('Perros', 1), ('Combos', 2), ('Bebidas', 3);

insert into productos (categoria_id, nombre, tipo, precio, orden) values
  ((select id from categorias where nombre = 'Perros'),  'Perro básico',        'perro',  7000, 1),
  ((select id from categorias where nombre = 'Perros'),  'Perro mexicano',      'perro',  9500, 2),
  ((select id from categorias where nombre = 'Bebidas'), 'Gaseosa 400 ml',      'bebida', 3500, 1),
  ((select id from categorias where nombre = 'Bebidas'), 'Agua 600 ml',         'bebida', 2500, 2),
  ((select id from categorias where nombre = 'Combos'),  'Combo sencillo',      'combo', 10000, 1),
  ((select id from categorias where nombre = 'Combos'),  'Combo amigos',        'combo', 16000, 2);

insert into combo_cupos (combo_id, nombre, producto_id, categoria_id, cantidad) values
  ((select id from productos where nombre = 'Combo sencillo'), 'Perro',  (select id from productos where nombre = 'Perro básico'), null, 1),
  ((select id from productos where nombre = 'Combo sencillo'), 'Bebida', null, (select id from categorias where nombre = 'Bebidas'), 1),
  ((select id from productos where nombre = 'Combo amigos'),   'Perros', (select id from productos where nombre = 'Perro básico'), null, 2),
  ((select id from productos where nombre = 'Combo amigos'),   'Bebidas', null, (select id from categorias where nombre = 'Bebidas'), 2);

insert into toppings (nombre, es_premium, orden) values
  ('Cebolla', false, 1), ('Tomate', false, 2), ('Pepinillo', false, 3), ('Papa ripio', false, 4),
  ('Salsa de huevo', false, 5), ('Salsa mostaza', false, 6), ('Queso', false, 7),
  ('Guacamole', true, 10), ('Jalapeños', true, 11), ('Nachos', true, 12);

-- Toppings clásicos: disponibles y marcados por defecto en ambos perros.
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, true, 0
  from productos p cross join toppings t
 where p.tipo = 'perro' and not t.es_premium;

-- Premium: incluidos en el mexicano; en el básico se cobran aparte.
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, p.nombre = 'Perro mexicano', case when p.nombre = 'Perro mexicano' then 0 else 1500 end
  from productos p cross join toppings t
 where p.tipo = 'perro' and t.es_premium;

insert into insumos (nombre, unidad, costo_unitario, stock_minimo) values
  ('Pan perro',          'und',  600,   30),
  ('Salchicha básica',   'und', 1200,   30),
  ('Salchicha premium',  'und', 2200,   20),
  ('Cebolla',            'g',      6,  500),
  ('Tomate',             'g',      7,  500),
  ('Pepinillo',          'g',     18,  300),
  ('Papa ripio',         'g',     25,  500),
  ('Salsa de huevo',     'ml',    12,  500),
  ('Salsa mostaza',      'ml',    10,  500),
  ('Queso',              'g',     35,  500),
  ('Guacamole',          'g',     30,  300),
  ('Jalapeños',          'g',     28,  200),
  ('Nachos',             'g',     22,  300),
  ('Gaseosa 400 ml',     'und', 1800,   24),
  ('Agua 600 ml',        'und', 1100,   12),
  ('Servilleta + bandeja','und', 150,  100);

insert into receta_items (producto_id, insumo_id, cantidad)
select p.id, i.id, r.cant
  from (values
    ('Perro básico',   'Pan perro', 1), ('Perro básico',   'Salchicha básica', 1),  ('Perro básico',   'Servilleta + bandeja', 1),
    ('Perro mexicano', 'Pan perro', 1), ('Perro mexicano', 'Salchicha premium', 1), ('Perro mexicano', 'Servilleta + bandeja', 1),
    ('Gaseosa 400 ml', 'Gaseosa 400 ml', 1),
    ('Agua 600 ml',    'Agua 600 ml', 1)
  ) as r(prod, ins, cant)
  join productos p on p.nombre = r.prod
  join insumos i on i.nombre = r.ins;

insert into topping_insumos (topping_id, insumo_id, cantidad)
select t.id, i.id, r.cant
  from (values
    ('Cebolla', 15), ('Tomate', 15), ('Pepinillo', 10), ('Papa ripio', 12),
    ('Salsa de huevo', 15), ('Salsa mostaza', 10), ('Queso', 20),
    ('Guacamole', 30), ('Jalapeños', 10), ('Nachos', 15)
  ) as r(nombre, cant)
  join toppings t on t.nombre = r.nombre
  join insumos i on i.nombre = r.nombre;

insert into categorias_gasto (nombre, tipo) values
  ('Arriendo', 'fijo'), ('Nómina', 'fijo'), ('Servicios (agua, luz, gas)', 'fijo'), ('Aseo y seguro', 'fijo'),
  ('Insumos', 'variable'), ('Empaques', 'variable'), ('Mantenimiento', 'variable'),
  ('Equipos', 'inversion'), ('Cuota recuperación a socios', 'inversion');

-- Parámetros financieros: CONFIRMAR con la tarifa real de Bold y la calculadora.
insert into parametros (clave, vigente_desde, valor, descripcion) values
  ('comision_datafono_pct',   '2026-01-01', 0,  'Comisión Bold QR en % sobre la venta (pendiente tarifa real)'),
  ('comision_datafono_fija',  '2026-01-01', 0,  'Cargo fijo por transacción Bold, COP'),
  ('iva_comision_pct',        '2026-01-01', 19, 'IVA sobre la comisión'),
  ('colchon_imprevistos_pct', '2026-01-01', 5,  'Colchón de imprevistos como % variable de cada venta'),
  ('cuota_recuperacion_mensual', '2026-01-01', 0, 'Cuota mensual de recuperación de inversión a socios (pendiente)');
