-- =====================================================================
-- Compras de apertura (21 al 24 de septiembre de 2026), tomadas de las
-- facturas que enviaron los socios. Cada compra suma al inventario,
-- recalcula el costo promedio del insumo y crea su gasto en "Insumos".
-- Ejecutar DESPUÉS de las migraciones. Se puede repetir: una compra que
-- ya está cargada (mismo proveedor y número de factura) no se duplica.
--
-- Conversión de cantidades:
--   pan brioche: paquete de 8 und · salchicha americana: paquete de 16 und
--   salsas en galón: 4.000 g · pepinillo/jalapeño: 600 g netos por frasco
-- Supuestos por confirmar:
--   * Queso bloque de San Rafael ($55.000) = doble crema a $24.000/kg
--     (precio de esa tienda el 21-sep) → 2.292 g.
--   * La compra del 21-sep (antes de abrir) fue para pruebas: se registra
--     solo como gasto, no suma al inventario.
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
-- Verificación
-- ---------------------------------------------------------------------
select c.fecha, c.proveedor, sum(ci.costo_total) as total
  from compras c join compra_items ci on ci.compra_id = c.id
 where c.fecha between '2026-09-21' and '2026-09-24'
 group by c.id, c.fecha, c.proveedor
 order by c.fecha, c.proveedor;

commit;
