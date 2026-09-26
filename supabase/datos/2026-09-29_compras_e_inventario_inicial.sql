-- =====================================================================
-- Compras de apertura e inventario inicial (21 al 25 de septiembre de 2026)
--
-- UN SOLO ARCHIVO para correr en el SQL Editor de Supabase, DESPUÉS de las
-- migraciones y del script de ventas del 23 al 25. Se puede repetir sin
-- duplicar nada (también si ya se habían corrido los scripts anteriores
-- de compras: usa las mismas llaves).
--
-- 1. Compras con factura: suman al inventario y recalculan el costo.
--    Conversión: pan en paquetes de 8, salchicha en paquetes de 16,
--    salsas en galón de 4 kg, pepinillo/jalapeño 600 g netos por frasco.
-- 2. Gastos sin inventario (equipos, empaques, dotación, verduras…).
-- 3. Inventario inicial: lo que se vendió del 23 al 25 sin factura de
--    compra (huevos, aguas, gaseosas personales, adicionales…) entra como
--    stock inicial, para que ningún insumo quede en negativo.
--
-- Supuestos por confirmar:
--   * Queso bloque ($55.000) = doble crema a $24.000/kg → 2.292 g.
--   * Compra del 21-sep (antes de abrir): solo gasto, sin inventario.
--   * Transferencia de gaseosas ($49.200, sin recibo) = 41 pequeñas a $1.200.
-- Después de correrlo, lo ideal es un CONTEO FÍSICO en la app
-- (Inventario → Ajustar por conteo) para dejar las cantidades exactas.
-- =====================================================================
begin;

select set_config('request.jwt.claim.sub',
                  (select id::text from auth.users where email = 'jhonrodriguezesteban@gmail.com'), true);
do $$ begin
  if auth.uid() is null or not es_socio() then
    raise exception 'No se encontró el usuario socio jhonrodriguezesteban@gmail.com';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Insumos nuevos (el costo inicial es el de la factura; la compra lo confirma)
-- ---------------------------------------------------------------------
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota) values
  ('Salsa de piña',     'g',  9.65,  1000, false, 'Galón 4 kg a $38.600 (La Inglesa)'),
  ('Salsa de tomate',   'g', 10.175, 1000, false, 'Galón 4 kg a $40.700 (La Inglesa)'),
  ('Salsa BBQ',         'g',  9.30,  1000, false, 'Galón 4 kg a $37.200 (La Inglesa)'),
  ('Salsa tártara',     'g',  9.925, 1000, false, 'Galón 4 kg a $39.700 (La Inglesa)'),
  ('Mayonesa',          'g', 13.40,  1000, false, 'El Casino 4 kg a $53.600 (La Inglesa)'),
  ('Mayonesa de ajo',   'g',  7.975, 1000, false, 'Galón 4 kg a $31.900 (La Inglesa)'),
  ('Pasta de ají',      'g',  9.60,   100, false, 'San Romo 500 g a $4.800'),
  ('Sweet relish',      'g', 13.9005, 300, false, 'Bolsa 1 kg a $13.901 (Calypso)'),
  ('Jalapeños',         'g', 22.835,  200, false, 'Rodajas, 600 g neto a $13.701 (Calypso)'),
  ('Piña en almíbar',   'g',  7.943,  500, false, 'Bolsa 2,5 kg bruto / 1,75 kg neto a $13.901 (Calypso)'),
  ('Cebolla frita',     'g', 28.401,  200, false, 'Paquete 1 kg a $28.401 (Calypso)')
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- Ayudantes (solo existen durante esta ejecución)
-- ---------------------------------------------------------------------
create function pg_temp.it(p_insumo text, p_cantidad numeric, p_costo bigint) returns jsonb
language plpgsql as $$
declare v_id bigint;
begin
  select id into v_id from insumos where nombre = p_insumo;
  if v_id is null then
    raise exception 'No existe el insumo "%"', p_insumo;
  end if;
  return jsonb_build_object('insumo_id', v_id, 'cantidad', p_cantidad, 'costo_total', p_costo);
end $$;

create function pg_temp.compra(p_fecha date, p_proveedor text, p_items jsonb) returns text
language plpgsql as $$
begin
  if exists (select 1 from compras where proveedor = p_proveedor) then
    return p_proveedor || ': ya estaba cargada';
  end if;
  perform registrar_compra(jsonb_build_object(
    'fecha', p_fecha, 'proveedor', p_proveedor, 'registrar_gasto', true, 'items', p_items));
  return p_proveedor || ': cargada';
end $$;

-- ---------------------------------------------------------------------
-- 23-sep 10:40 · La Inglesa LCS · $340.200 (Nequi)
-- ---------------------------------------------------------------------
select pg_temp.compra('2026-09-23', 'La Inglesa · IGN 268248', jsonb_build_array(
  pg_temp.it('Salsa de piña',       4000, 38600),
  pg_temp.it('Salsa de tomate',     4000, 40700),
  pg_temp.it('Salsa BBQ',           4000, 37200),
  pg_temp.it('Salsa tártara',       4000, 39700),
  pg_temp.it('Mostaza',             4000, 30700),
  pg_temp.it('Salsa rosada',        4000, 41400),
  pg_temp.it('Mayonesa',            4000, 53600),
  pg_temp.it('Pasta de ají',         500,  4800),
  pg_temp.it('Bandeja porta perro',  200, 13800),
  pg_temp.it('Mayonesa de ajo',     4000, 31900),
  pg_temp.it('Servilleta',           600,  7800)));

-- ---------------------------------------------------------------------
-- 23-sep 10:49 · Calypso del Caribe · $516.609 (QR datáfono)
-- ---------------------------------------------------------------------
select pg_temp.compra('2026-09-23', 'Calypso · AADA143534', jsonb_build_array(
  pg_temp.it('Pepinillo',            1200,  27801),   -- 2 frascos × 600 g neto
  pg_temp.it('Sweet relish',         2000,  27801),   -- 2 × 1 kg
  pg_temp.it('Jalapeños',            1200,  27401),   -- 2 × 600 g neto
  pg_temp.it('Piña en almíbar',      3500,  27801),   -- 2 × 1,75 kg neto
  pg_temp.it('Cebolla frita',        1000,  28401),
  pg_temp.it('Tocineta',             1000,  13600),   -- 2 × 500 g en cubos
  pg_temp.it('Papa ripio',           2000,  23800),   -- 2 × 1 kg cabello de ángel
  pg_temp.it('Papa hojuela',          450,  14800),
  pg_temp.it('Salchicha americana',   112, 219104),   -- 7 paquetes × 16
  pg_temp.it('Queso cheddar',        1000,  17300),   -- salsa tipo cheddar 1 kg
  pg_temp.it('Pan brioche',            96,  88800))); -- 12 paquetes × 8

-- ---------------------------------------------------------------------
-- 23-sep 11:28 · San Rafael de la Once · $214.440 (efectivo)
-- ---------------------------------------------------------------------
select pg_temp.compra('2026-09-23', 'San Rafael de la Once · FV 142707', jsonb_build_array(
  pg_temp.it('Queso doble crema',    2292,  55000),   -- queso bloque (supuesto: doble crema a $24.000/kg)
  pg_temp.it('Queso Saravena',       2465,  39440),   -- 2,465 kg a $16.000
  pg_temp.it('Salchicha americana',    64, 120000))); -- 4 paquetes × 16

-- ---------------------------------------------------------------------
-- 24-sep 18:41 · Calypso del Caribe · $96.200 (efectivo)
-- ---------------------------------------------------------------------
select pg_temp.compra('2026-09-24', 'Calypso · AADA143728', jsonb_build_array(
  pg_temp.it('Pan brioche',           104,  96200))); -- 13 paquetes × 8

-- ---------------------------------------------------------------------
-- Costo promedio de apertura. Como las ventas de esos días se cargaron
-- antes que las compras, el stock estaba en negativo y cada compra
-- reemplazó el costo en vez de promediarlo. Aquí queda el promedio
-- ponderado de todas las compras de apertura de cada insumo.
-- ---------------------------------------------------------------------
select ajustar_costo_insumo(x.insumo_id, x.promedio, 'Promedio de compras de apertura 23 y 24-sep-2026')
  from (select ci.insumo_id, round(sum(ci.costo_total) / sum(ci.cantidad), 4) as promedio
          from compra_items ci join compras c on c.id = ci.compra_id
         where c.proveedor in ('La Inglesa · IGN 268248', 'Calypso · AADA143534',
                               'San Rafael de la Once · FV 142707', 'Calypso · AADA143728')
         group by ci.insumo_id
        having count(*) > 1) x
  join insumos i on i.id = x.insumo_id
 where i.costo_unitario <> x.promedio;

-- ---------------------------------------------------------------------
-- Gastos sin inventario
-- ---------------------------------------------------------------------
insert into categorias_gasto (nombre, tipo) values ('Dotación e higiene', 'variable')
on conflict (nombre) do nothing;

insert into gastos (id, fecha, categoria_id, monto, descripcion, registrado_por)
select x.id::uuid, x.fecha::date, c.id, x.monto, x.descr, auth.uid()
  from (values
    ('c2100000-0000-4000-8000-000000000001', '2026-09-21', 'Insumos', 201300,
     'Compra de prueba antes de abrir · San Rafael de la Once (salchichas, quesos, papas, salsas, pan)'),
    ('c2300000-0000-4000-8000-000000000001', '2026-09-23', 'Empaques', 4000, 'Bolsas'),
    ('c2300000-0000-4000-8000-000000000002', '2026-09-23', 'Dotación e higiene', 37000, 'Gorros ($15.000) y guantes ($22.000)')
  ) as x(id, fecha, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 24-sep 11:44 · Gaseosas por transferencia Bre-B a Yefersson Lasso Muñoz
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from compras where proveedor = 'Gaseosas · Bre-B TROG0X5FloEC') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-09-24',
      'proveedor', 'Gaseosas · Bre-B TROG0X5FloEC',
      'registrar_gasto', true,
      'items', jsonb_build_array(jsonb_build_object(
        'insumo_id', (select id from insumos where nombre = 'Gaseosa pequeña'),
        'cantidad', 41, 'costo_total', 49200))));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Gastos sin inventario
-- ---------------------------------------------------------------------
insert into gastos (id, fecha, categoria_id, monto, descripcion, registrado_por)
select x.id::uuid, x.fecha::date, c.id, x.monto, x.descr, auth.uid()
  from (values
    ('c2400000-0000-4000-8000-000000000001', '2026-09-24', 'Insumos', 13780,
     'Agua Cristal garrafa 5 L × 2 (uso en cocina) · Comunal Margaritas'),
    ('c2400000-0000-4000-8000-000000000002', '2026-09-24', 'Equipos', 124000,
     'Distribuciones Mateo: caneca vaivén 70 L $40.000, tanque plástico $28.000, dispensador de servilletas $20.000, pinza de hielo acero $8.000, CA-07 $28.000'),
    ('c2500000-0000-4000-8000-000000000001', '2026-09-25', 'Empaques', 10500,
     'Todo Plásticos L&M: bolsas para llevar 2 lb $2.900 y 3 lb $3.400, cartones de perro $4.200'),
    ('c2500000-0000-4000-8000-000000000002', '2026-09-25', 'Insumos', 20000,
     'Verduras: tomate, cebolla, cilantro y limones (Andrea)')
  ) as x(id, fecha, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
on conflict (id) do nothing;

-- Los $50.000 del 23-sep que se le dieron a Andrea fueron huevos normales y de codorniz
update gastos set descripcion = 'Huevos normales y de codorniz (dinero entregado a Andrea)'
 where id = 'a2300000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------
-- Inventario inicial: lo que se usó del 23 al 25 sin factura de compra.
-- Queda fechado el 23-sep a las 6 a. m. (antes de la primera venta) y a
-- costo actual. Solo se completa lo que falta para no quedar en negativo.
-- ---------------------------------------------------------------------
insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota, creado_en)
select i.id, 'inicial', -i.stock_actual, i.costo_unitario,
       'Inventario inicial de apertura (usado del 23 al 25-sep sin factura de compra)',
       '2026-09-23T06:00:00-05:00'
  from insumos i
 where i.stock_actual < 0
   and not exists (select 1 from movimientos_inventario m
                    where m.insumo_id = i.id and m.tipo = 'inicial'
                      and m.nota like 'Inventario inicial de apertura%');

-- ---------------------------------------------------------------------
-- Resultado
-- ---------------------------------------------------------------------
select c.fecha, c.proveedor, sum(ci.costo_total) as total
  from compras c join compra_items ci on ci.compra_id = c.id
 where c.fecha between '2026-09-21' and '2026-09-25'
 group by c.id, c.fecha, c.proveedor
 order by c.fecha, c.proveedor;

select nombre as insumo, unidad, round(stock_actual) as stock, round(costo_unitario, 2) as costo_unidad,
       round(greatest(stock_actual, 0) * costo_unitario) as valor_en_inventario
  from insumos
 where activo and (stock_actual <> 0 or exists (select 1 from movimientos_inventario m where m.insumo_id = insumos.id))
 order by nombre;

commit;
