-- =====================================================================
-- Ventas de los primeros días (23, 24 y 25 de septiembre de 2026)
-- reconstruidas con lo que reportaron los socios. Ejecutar DESPUÉS de la
-- migración 20260927000000_nequi_y_fiado.sql, y antes del 30 de septiembre
-- (el sistema no acepta ventas de más de 7 días atrás).
-- Se puede repetir: cada venta tiene un id fijo y no se duplica.
--
-- Criterio acordado para el 23 (no hubo conteo de productos): todo se tasa
-- como perros de $10.000, el resto en gaseosas de $2.500.
-- Diferencias que no se pueden repartir en productos: 23-sep $1.700,
-- 25-sep $1.000 (quedan anotadas en la venta).
-- =====================================================================
begin;

-- Las ventas quedan registradas a nombre de Jhon (socio).
select set_config('request.jwt.claim.sub',
                  (select id::text from auth.users where email = 'jhonrodriguezesteban@gmail.com'), true);
do $$ begin
  if auth.uid() is null or not es_socio() then
    raise exception 'No se encontró el usuario socio jhonrodriguezesteban@gmail.com';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Agua saborizada pequeña ($2.500). Costo ESTIMADO: corregir con la compra.
-- ---------------------------------------------------------------------
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota)
values ('Agua saborizada', 'und', 1200, 6, true, 'Costo estimado: confirmar con la compra')
on conflict (nombre) do nothing;

insert into productos (categoria_id, nombre, tipo, precio, orden)
values ((select id from categorias where nombre = 'Bebidas'), 'Agua saborizada', 'bebida', 2500, 4)
on conflict (nombre) do nothing;

insert into receta_items (producto_id, insumo_id, cantidad, es_estimado)
select p.id, i.id, 1, false from productos p, insumos i
 where p.nombre = 'Agua saborizada' and i.nombre = 'Agua saborizada'
on conflict (producto_id, insumo_id) do nothing;

-- ---------------------------------------------------------------------
-- Ayudantes (solo existen durante esta ejecución)
-- ---------------------------------------------------------------------
-- Perro básico con los toppings de la casa + adicionales opcionales
create function pg_temp.perro(p_cant int, p_adicionales text[] default '{}') returns jsonb
language sql as $$
  select jsonb_build_object(
    'producto_id', p.id,
    'cantidad', p_cant,
    'toppings', (select coalesce(jsonb_agg(pt.topping_id), '[]')
                   from producto_toppings pt join toppings t on t.id = pt.topping_id
                  where pt.producto_id = p.id
                    and (pt.incluido_por_defecto or t.nombre = any (p_adicionales))))
  from productos p where p.nombre = 'Perro básico'
$$;

create function pg_temp.item(p_nombre text, p_cant int) returns jsonb
language sql as $$
  select jsonb_build_object('producto_id', id, 'cantidad', p_cant, 'toppings', '[]'::jsonb)
    from productos where nombre = p_nombre
$$;

create function pg_temp.venta(p_id uuid, p_cuando text, p_metodo text, p_items jsonb,
                              p_cliente text default null, p_notas text default null) returns jsonb
language sql as $$
  select registrar_venta(jsonb_build_object(
    'id', p_id, 'vendida_en', p_cuando, 'metodo_pago', p_metodo,
    'cliente', p_cliente, 'notas', p_notas, 'items', p_items))
$$;

-- ---------------------------------------------------------------------
-- 23 de septiembre — Bold $183.200 · Efectivo $376.000 · Nequi $10.000 ·
-- Fiado $100.000 · Total $669.200 → 66 perros + 3 gaseosas pequeñas
-- ---------------------------------------------------------------------
select pg_temp.venta('23000000-0000-4000-8000-000000000001', '2026-09-23T19:00:00-05:00', 'nequi',
  jsonb_build_array(pg_temp.perro(1)));

select pg_temp.venta('23000000-0000-4000-8000-000000000002', '2026-09-23T19:05:00-05:00', 'credito',
  jsonb_build_array(pg_temp.perro(10)),
  'Deudores 23-sep (sin detalle)', 'Saldo pendiente reportado el 23-sep');

select pg_temp.venta('23000000-0000-4000-8000-000000000003', '2026-09-23T19:10:00-05:00', 'datafono',
  jsonb_build_array(pg_temp.perro(18), pg_temp.item('Gaseosa pequeña', 1)),
  null, 'Bold reportó $183.200: $700 sin repartir en productos');

select pg_temp.venta('23000000-0000-4000-8000-000000000004', '2026-09-23T19:15:00-05:00', 'efectivo',
  jsonb_build_array(pg_temp.perro(37), pg_temp.item('Gaseosa pequeña', 2)),
  null, 'Efectivo reportado $376.000 (incluye $15.000 y 2 perros que repuso Jhon): $1.000 sin repartir');

-- ---------------------------------------------------------------------
-- 24 de septiembre — 14 perros + 4 gaseosas mini · Efectivo $75.000 ·
-- Bold $75.000 · Total $150.000
-- ---------------------------------------------------------------------
select pg_temp.venta('24000000-0000-4000-8000-000000000001', '2026-09-24T19:00:00-05:00', 'efectivo',
  jsonb_build_array(pg_temp.perro(7), pg_temp.item('Gaseosa pequeña', 2)));

select pg_temp.venta('24000000-0000-4000-8000-000000000002', '2026-09-24T19:05:00-05:00', 'datafono',
  jsonb_build_array(pg_temp.perro(7), pg_temp.item('Gaseosa pequeña', 2)));

-- ---------------------------------------------------------------------
-- 25 de septiembre — 35 perros, 38 adicionales (reparto estimado),
-- 10 gaseosas mini, 5 personales, 3 aguas, 1 agua saborizada.
-- Efectivo $140.000 · Bold $238.000 · Sebas debe $90.000 ·
-- Eduar (logística) $14.000 · Total $482.000
-- ---------------------------------------------------------------------
select pg_temp.venta('25000000-0000-4000-8000-000000000001', '2026-09-25T19:00:00-05:00', 'credito',
  jsonb_build_array(pg_temp.perro(9)), 'Sebas');

select pg_temp.venta('25000000-0000-4000-8000-000000000002', '2026-09-25T19:05:00-05:00', 'credito',
  jsonb_build_array(pg_temp.perro(1, array['Tocineta frita', 'Queso cheddar'])), 'Eduar (logística)');

select pg_temp.venta('25000000-0000-4000-8000-000000000003', '2026-09-25T19:10:00-05:00', 'datafono',
  jsonb_build_array(
    pg_temp.perro(2, array['Suero costeño', 'Huevo de codorniz']),
    pg_temp.perro(2, array['Suero costeño', 'Frijoles']),
    pg_temp.perro(1, array['Suero costeño', 'Queso cheddar']),
    pg_temp.perro(3, array['Huevo de codorniz']),
    pg_temp.perro(3, array['Frijoles']),
    pg_temp.perro(3, array['Queso cheddar']),
    pg_temp.perro(3, array['Tocineta frita']),
    pg_temp.perro(2, array['Suero costeño'])));

select pg_temp.venta('25000000-0000-4000-8000-000000000004', '2026-09-25T19:15:00-05:00', 'efectivo',
  jsonb_build_array(
    pg_temp.perro(3, array['Huevo de codorniz', 'Frijoles']),
    pg_temp.perro(3, array['Queso cheddar', 'Tocineta frita']),
    pg_temp.item('Gaseosa pequeña', 10),
    pg_temp.item('Gaseosa personal', 5),
    pg_temp.item('Agua 600 ml', 3),
    pg_temp.item('Agua saborizada', 1)),
  null, 'Efectivo reportado $140.000: $1.000 sin repartir en productos');

-- ---------------------------------------------------------------------
-- Dinero entregado a Andrea del primer día ($100.000)
-- ---------------------------------------------------------------------
insert into gastos (id, fecha, categoria_id, monto, descripcion, registrado_por)
select x.id::uuid, '2026-09-23', c.id, x.monto, x.descr, auth.uid()
  from (values
    ('a2300000-0000-4000-8000-000000000001', 'Nómina',   50000, 'Vale Andrea (anticipo de sueldo)'),
    ('a2300000-0000-4000-8000-000000000002', 'Insumos',  50000, 'Huevos (pago de hoy y compra de mañana)')
  ) as x(id, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Verificación: debe coincidir con lo reportado
-- ---------------------------------------------------------------------
with v as (
  select (vendida_en at time zone 'America/Bogota')::date as dia, *
    from ventas
   where estado = 'completada' and vendida_en < '2026-09-26T00:00:00-05:00'
)
select v.dia,
       sum(total) filter (where metodo_pago::text = 'efectivo') as efectivo,
       sum(total) filter (where metodo_pago::text = 'datafono') as bold,
       sum(total) filter (where metodo_pago::text = 'nequi')    as nequi,
       sum(total) filter (where metodo_pago::text = 'credito')  as fiado,
       sum(total) as total,
       (select sum(vi.cantidad) from venta_items vi join v v2 on v2.id = vi.venta_id
         where vi.tipo_producto = 'perro' and v2.dia = v.dia) as perros
  from v
 group by v.dia
 order by v.dia;

commit;
