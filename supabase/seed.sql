-- =====================================================================
-- Datos de arranque — Bendito Perro Caliente
--
-- Fuente: socios, 24-sep-2026. Costos de las compras reales del 23-sep-2026
-- (proveedores recurrentes: Calypso del Caribe y La Inglesa LCS).
--
-- Marcados como ESTIMADOS (es_estimado = true, editables desde la base):
--   * gramajes de los toppings y el huevo (validar con gramera en operación)
--   * costo de la cebolla (estimado de mercado)
--   * bebidas: precio y costo PENDIENTES (no se han definido)
-- Mínimos de stock para alertas: propuesta inicial, ajustar con la operación.
-- =====================================================================

insert into categorias (nombre, orden) values
  ('Perros', 1), ('Bebidas', 2);

insert into productos (categoria_id, nombre, tipo, precio, orden) values
  ((select id from categorias where nombre = 'Perros'),  'Perro básico',   'perro',  10000, 1),
  -- PENDIENTE: precio real de bebidas
  ((select id from categorias where nombre = 'Bebidas'), 'Gaseosa 400 ml', 'bebida',  3500, 1),
  ((select id from categorias where nombre = 'Bebidas'), 'Agua 600 ml',    'bebida',  2500, 2);

-- Papa y queso: el cliente elige una variante (grupo excluyente).
insert into toppings (nombre, grupo, orden) values
  ('Papa ripio',        'Papa',  1),
  ('Papa hojuela',      'Papa',  2),
  ('Queso doble crema', 'Queso', 3),
  ('Queso Saravena',    'Queso', 4),
  ('Salsa de huevo',    null,    5),
  ('Salsa rosada',      null,    6),
  ('Mostaza',           null,    7),
  ('Pepinillo',         null,    8);

-- Todos premarcados en el básico; en los grupos se premarca la primera
-- variante (papa ripio, queso doble crema) y la empleada cambia si el cliente pide.
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, t.nombre not in ('Papa hojuela', 'Queso Saravena'), 0
  from productos p cross join toppings t
 where p.nombre = 'Perro básico';

-- costo_unitario en COP por unidad de medida (g o und)
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota) values
  ('Salchicha americana', 'und', 1956.3125, 32,   false, 'Paquete 1.280 g x16 und (80 g c/u) a $31.301 → $24,45/g'),
  ('Pan brioche',         'und',  925.0000, 16,   false, 'Paquete 640 g x8 und (80 g c/u) a $7.400 → $11,56/g'),
  ('Papa ripio',          'g',     11.9000, 500,  false, 'Papa cabello de ángel / ripio'),
  ('Papa hojuela',        'g',     32.8900, 500,  false, null),
  ('Queso doble crema',   'g',     22.0000, 500,  false, 'Libra (500 g)'),
  ('Queso Saravena',      'g',     31.2000, 500,  false, null),
  ('Salsa rosada',        'g',     10.3500, 1000, false, 'Galón 4 kg a $41.400'),
  ('Mostaza',             'g',      7.6750, 1000, false, 'Galón 4 kg a $30.700'),
  ('Pepinillo',           'g',     23.1683, 300,  false, 'Rodajas, 600 g neto a $13.901'),
  ('Cebolla cabezona',    'g',      3.4000, 300,  true,  'Estimado de mercado: confirmar con proveedor de verduras'),
  ('Huevo',               'und',  466.6667, 15,   false, 'Cubeta x30 a $14.000'),
  ('Bandeja porta perro', 'und',   69.0000, 50,   false, null),
  ('Servilleta',          'und',   13.0000, 100,  false, null),
  -- PENDIENTE: costo real de bebidas
  ('Gaseosa 400 ml',      'und', 1800.0000, 24,   true,  'PENDIENTE: costo real'),
  ('Agua 600 ml',         'und', 1100.0000, 12,   true,  'PENDIENTE: costo real');

insert into receta_items (producto_id, insumo_id, cantidad, es_estimado)
select p.id, i.id, r.cant, false
  from (values
    ('Perro básico',   'Salchicha americana', 1),
    ('Perro básico',   'Pan brioche', 1),
    ('Perro básico',   'Bandeja porta perro', 1),
    ('Perro básico',   'Servilleta', 1),
    ('Gaseosa 400 ml', 'Gaseosa 400 ml', 1),
    ('Agua 600 ml',    'Agua 600 ml', 1)
  ) as r(prod, ins, cant)
  join productos p on p.nombre = r.prod
  join insumos i on i.nombre = r.ins;

-- Porción de cada topping. ESTIMADO: validar con gramera.
insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
select t.id, i.id, r.cant, true
  from (values
    ('Papa ripio',        'Papa ripio',        15),
    ('Papa hojuela',      'Papa hojuela',      15),
    ('Queso doble crema', 'Queso doble crema', 15),
    ('Queso Saravena',    'Queso Saravena',    15),
    ('Salsa de huevo',    'Huevo',             0.5),  -- 1 huevo rinde ~2 perros
    ('Salsa de huevo',    'Cebolla cabezona',  5),
    ('Salsa rosada',      'Salsa rosada',      15),
    ('Mostaza',           'Mostaza',           15),
    ('Pepinillo',         'Pepinillo',         10)
  ) as r(topping, ins, cant)
  join toppings t on t.nombre = r.topping
  join insumos i on i.nombre = r.ins;

insert into categorias_gasto (nombre, tipo) values
  ('Arriendo', 'fijo'), ('Nómina', 'fijo'), ('Servicios (agua, luz, gas)', 'fijo'), ('Aseo y seguro', 'fijo'),
  ('Insumos', 'variable'), ('Empaques', 'variable'), ('Mantenimiento', 'variable'),
  ('Equipos', 'inversion'), ('Cuota recuperación a socios', 'inversion');

-- Parámetros (todos editables; un cambio = fila nueva con su fecha de vigencia).
insert into parametros (clave, vigente_desde, valor, descripcion) values
  ('comision_datafono_pct',        '2026-01-01', 1.5,     'Comisión Bold QR, % sobre la transacción (sin cargo fijo)'),
  ('merma_pct',                    '2026-01-01', 3,       'PROVISIONAL: % de merma sobre insumos, aún sin medir en operación'),
  ('dias_operacion_mes',           '2026-01-01', 30,      'Días de operación al mes'),
  ('nomina_mensual',               '2026-01-01', 3000000, 'POR CONFIRMAR: nómina mensual (valor del caso de negocio)'),
  ('arriendo_mensual',             '2026-01-01', 2500000, 'POR CONFIRMAR: arriendo mensual (valor del caso de negocio)'),
  ('pct_ventas_datafono_estimado', '2026-01-01', 50,      'Estimado de % de ventas por datáfono, solo si el mes no tiene ventas'),
  ('tasa_adjuncion_estimada',      '2026-01-01', 30,      'Estimado de % de ventas con bebida, solo si el mes no tiene ventas');

-- Plan de recuperación: 6 meses. El total es la suma de los conceptos.
-- PENDIENTE: utensilios de cocina y uniformes; fecha de inicio (inicia_en).
insert into planes_recuperacion (descripcion, meses, inicia_en) values
  ('Inversión inicial', 6, null);

insert into plan_recuperacion_items (plan_id, concepto, monto)
select (select id from planes_recuperacion where descripcion = 'Inversión inicial'), c, m
  from (values
    ('Muebles en acero',              5200000),
    ('Nevera',                        2700000),
    ('Gastos de envío',                200000),
    ('Salchichera',                   1250000),
    ('Puesto de estar (pago único)',  2000000)
  ) as x(c, m);
