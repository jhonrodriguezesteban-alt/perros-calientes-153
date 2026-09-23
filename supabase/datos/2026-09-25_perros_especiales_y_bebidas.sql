-- =====================================================================
-- Perros especiales (mexicano, costeño, italiano) y precios de bebidas
-- Fecha: 25-sep-2026. Ejecutar UNA vez en el SQL Editor, después de seed.sql.
-- Se puede volver a ejecutar sin duplicar nada.
--
-- Precios de venta y costo de bebidas: confirmados por los socios.
-- Gramajes y costos de los ingredientes nuevos: ESTIMADOS de mercado
-- (es_estimado = true). Corregir con las compras reales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bebidas: gaseosa personal pequeña y agua a $2.500
-- ---------------------------------------------------------------------
update productos set nombre = 'Gaseosa personal', precio = 2500 where nombre = 'Gaseosa 400 ml';
update productos set precio = 2500 where nombre = 'Agua 600 ml';
update insumos   set nombre = 'Gaseosa personal' where nombre = 'Gaseosa 400 ml';

-- Costo de compra confirmado por los socios (queda registrado en historial_costos)
begin;
select set_config('bpc.origen_costo', 'manual', true),
       set_config('bpc.motivo_costo', 'Costo de compra confirmado por socios 25-sep-2026', true);
update insumos set costo_unitario = 1200, es_estimado = false, nota = null
 where nombre = 'Gaseosa personal' and costo_unitario <> 1200;
update insumos set costo_unitario = 1000, es_estimado = false, nota = null
 where nombre = 'Agua 600 ml' and costo_unitario <> 1000;
commit;

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
insert into productos (categoria_id, nombre, tipo, precio, orden, descripcion)
select (select id from categorias where nombre = 'Perros'), x.nombre, 'perro', x.precio, x.orden, x.descripcion
  from (values
    ('Perro mexicano', 14000, 2, 'Guacamole, frijol, pico de gallo, jalapeños y doritos'),
    ('Perro costeño',  14000, 3, 'Maduro, suero costeño, papitas y mazorca'),
    ('Perro italiano', 14000, 4, 'Peperoni, salami, queso y salsa napolitana')
  ) as x(nombre, precio, orden, descripcion)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- Insumos nuevos (costo ESTIMADO en COP por gramo)
-- ---------------------------------------------------------------------
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota) values
  ('Guacamole',          'g', 25, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Frijol refrito',     'g', 10, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Pico de gallo',      'g',  8, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Jalapeños',          'g', 25, 200, true, 'Estimado de mercado: confirmar con la compra'),
  ('Doritos',            'g', 50, 150, true, 'Estimado de mercado: confirmar con la compra'),
  ('Maduro',             'g',  6, 500, true, 'Plátano maduro. Estimado de mercado: confirmar'),
  ('Suero costeño',      'g', 12, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Mazorca desgranada', 'g', 16, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Peperoni',           'g', 50, 200, true, 'Estimado de mercado: confirmar con la compra'),
  ('Salami',             'g', 45, 200, true, 'Estimado de mercado: confirmar con la compra'),
  ('Salsa napolitana',   'g', 10, 500, true, 'Estimado de mercado: confirmar con la compra')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- Ingredientes de las especialidades como toppings (orden negativo:
-- salen primero en la pantalla). Premarcados en su perro; se pueden quitar.
-- ---------------------------------------------------------------------
insert into toppings (nombre, orden) values
  ('Guacamole',          -20),
  ('Frijol',             -19),
  ('Pico de gallo',      -18),
  ('Jalapeños',          -17),
  ('Doritos',            -16),
  ('Maduro',             -15),
  ('Suero costeño',      -14),
  ('Mazorca',            -13),
  ('Peperoni',           -12),
  ('Salami',             -11),
  ('Salsa napolitana',   -10)
on conflict (nombre) do nothing;

insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
select t.id, i.id, x.cant, true
  from (values
    ('Guacamole',        'Guacamole',          25),
    ('Frijol',           'Frijol refrito',     25),
    ('Pico de gallo',    'Pico de gallo',      20),
    ('Jalapeños',        'Jalapeños',          10),
    ('Doritos',          'Doritos',            10),
    ('Maduro',           'Maduro',             40),
    ('Suero costeño',    'Suero costeño',      20),
    ('Mazorca',          'Mazorca desgranada', 20),
    ('Peperoni',         'Peperoni',           15),
    ('Salami',           'Salami',             15),
    ('Salsa napolitana', 'Salsa napolitana',   20)
  ) as x(topping, insumo, cant)
  join toppings t on t.nombre = x.topping
  join insumos  i on i.nombre = x.insumo
on conflict (topping_id, insumo_id) do nothing;

-- Receta base: igual que el básico (salchicha, pan, bandeja, servilleta)
insert into receta_items (producto_id, insumo_id, cantidad, es_estimado)
select p.id, r.insumo_id, r.cantidad, r.es_estimado
  from productos p
  cross join receta_items r
 where p.nombre in ('Perro mexicano', 'Perro costeño', 'Perro italiano')
   and r.producto_id = (select id from productos where nombre = 'Perro básico')
on conflict (producto_id, insumo_id) do nothing;

-- Toppings de cada perro especial:
--   * sus ingredientes propios: premarcados
--   * los de la casa (papa, queso, salsas): disponibles sin marcar, salvo
--     papitas del costeño (papa ripio) y queso del italiano (doble crema)
insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, x.marcado, 0
  from (values
    ('Perro mexicano', 'Guacamole',         true),
    ('Perro mexicano', 'Frijol',            true),
    ('Perro mexicano', 'Pico de gallo',     true),
    ('Perro mexicano', 'Jalapeños',         true),
    ('Perro mexicano', 'Doritos',           true),
    ('Perro costeño',  'Maduro',            true),
    ('Perro costeño',  'Suero costeño',     true),
    ('Perro costeño',  'Mazorca',           true),
    ('Perro costeño',  'Papa ripio',        true),
    ('Perro italiano', 'Peperoni',          true),
    ('Perro italiano', 'Salami',            true),
    ('Perro italiano', 'Salsa napolitana',  true),
    ('Perro italiano', 'Queso doble crema', true)
  ) as x(producto, topping, marcado)
  join productos p on p.nombre = x.producto
  join toppings  t on t.nombre = x.topping
on conflict (producto_id, topping_id) do nothing;

insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, false, 0
  from productos p
  cross join toppings t
 where p.nombre in ('Perro mexicano', 'Perro costeño', 'Perro italiano')
   and t.nombre in ('Papa ripio', 'Papa hojuela', 'Queso doble crema', 'Queso Saravena',
                    'Salsa de huevo', 'Salsa rosada', 'Mostaza', 'Pepinillo')
on conflict (producto_id, topping_id) do nothing;

-- Resumen para verificar
select p.nombre, p.precio, round(costo_catalogo(p.id)) as costo_insumos
  from productos p
 where p.activo
 order by p.tipo, p.orden;
