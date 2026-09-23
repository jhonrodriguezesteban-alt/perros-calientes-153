-- Datos de arranque para desarrollo. PRECIOS, CANTIDADES Y COSTOS SON
-- PROVISIONALES: reemplazar con los de la calculadora de costeo.

insert into categorias (nombre, orden) values
  ('Perros', 1), ('Bebidas', 2);

insert into productos (categoria_id, nombre, tipo, precio, orden) values
  ((select id from categorias where nombre = 'Perros'),  'Perro básico',        'perro',  7000, 1),
  ((select id from categorias where nombre = 'Perros'),  'Perro mexicano',      'perro',  9500, 2),
  ((select id from categorias where nombre = 'Bebidas'), 'Gaseosa 400 ml',      'bebida', 3500, 1),
  ((select id from categorias where nombre = 'Bebidas'), 'Agua 600 ml',         'bebida', 2500, 2);

insert into toppings (nombre, es_premium, orden) values
  ('Cebolla', false, 1), ('Tomate', false, 2), ('Pepinillo', false, 3), ('Papa ripio', false, 4),
  ('Salsa de huevo', false, 5), ('Salsa mostaza', false, 6), ('Queso', false, 7),
  ('Guacamole', true, 10), ('Jalapeños', true, 11), ('Nachos', true, 12);

-- Toppings clásicos: disponibles y marcados por defecto en ambos perros.
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, true, 0
  from productos p cross join toppings t
 where p.tipo = 'perro' and not t.es_premium;

-- Premium: nunca premarcados (se agregan a mano). Sin costo extra en el
-- mexicano; en el básico se cobran aparte.
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, false, case when p.nombre = 'Perro mexicano' then 0 else 1500 end
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

-- Parámetros financieros (vigentes desde el arranque). Nómina y arriendo del
-- caso de negocio; merma, días y estimados son PROVISIONALES.
insert into parametros (clave, vigente_desde, valor, descripcion) values
  ('comision_datafono_pct',        '2026-01-01', 1.5,     'Comisión Bold QR, % sobre la transacción (sin cargo fijo)'),
  ('merma_pct',                    '2026-01-01', 5,       '% de merma sobre el costo de insumos de la receta'),
  ('dias_operacion_mes',           '2026-01-01', 30,      'Días de operación al mes'),
  ('nomina_mensual',               '2026-01-01', 3000000, 'Nómina mensual (salario + prestaciones + parafiscales)'),
  ('arriendo_mensual',             '2026-01-01', 2500000, 'Arriendo mensual (incluye servicios)'),
  ('pct_ventas_datafono_estimado', '2026-01-01', 50,      'Estimado de % de ventas por datáfono, solo si el mes no tiene ventas'),
  ('tasa_adjuncion_estimada',      '2026-01-01', 30,      'Estimado de % de ventas con bebida, solo si el mes no tiene ventas');

-- Plan de recuperación: PROVISIONAL (inversión del caso de negocio, 12 meses).
insert into planes_recuperacion (descripcion, monto_total, meses, inicia_en) values
  ('Inversión inicial', 8800000, 12, '2026-10-01');
