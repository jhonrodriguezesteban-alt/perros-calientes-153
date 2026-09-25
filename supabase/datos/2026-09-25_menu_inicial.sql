-- =====================================================================
-- Menú inicial de operación — 25-sep-2026
--   * Un solo perro ($10.000) con los toppings de la casa incluidos
--   * Adicionales a $2.000 c/u: huevo de codorniz, frijoles, queso cheddar,
--     tocineta frita, suero costeño
--   * Bebidas: gaseosa pequeña $2.500, gaseosa personal $3.500, agua $2.500
--
-- Ejecutar en el SQL Editor después de seed.sql. Se puede repetir sin
-- duplicar nada. Si alguna vez se ejecutó el script anterior de perros
-- especiales, este los desactiva (no se borran para no perder historial).
--
-- Costos de los adicionales y de la gaseosa personal: ESTIMADOS
-- (es_estimado = true), pendientes de las compras reales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perros especiales: fuera del menú por ahora
-- ---------------------------------------------------------------------
update productos set activo = false
 where nombre in ('Perro mexicano', 'Perro costeño', 'Perro italiano');

update toppings set activo = false
 where nombre in ('Guacamole', 'Frijol', 'Pico de gallo', 'Jalapeños', 'Doritos',
                  'Maduro', 'Mazorca', 'Peperoni', 'Salami', 'Salsa napolitana', 'Nachos');

-- ---------------------------------------------------------------------
-- Bebidas
-- ---------------------------------------------------------------------
do $$
begin
  -- La gaseosa de $2.500 pasa a llamarse "Gaseosa pequeña"
  if not exists (select 1 from productos where nombre = 'Gaseosa pequeña') then
    update productos set nombre = 'Gaseosa pequeña'
     where nombre in ('Gaseosa 400 ml', 'Gaseosa personal');
  end if;
  if not exists (select 1 from insumos where nombre = 'Gaseosa pequeña') then
    update insumos set nombre = 'Gaseosa pequeña'
     where nombre in ('Gaseosa 400 ml', 'Gaseosa personal');
  end if;
end $$;

update productos set precio = 2500, orden = 1 where nombre = 'Gaseosa pequeña';
update productos set precio = 2500, orden = 3 where nombre = 'Agua 600 ml';

insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota)
values ('Gaseosa personal', 'und', 1450, 12, true, 'Estimado $1.400–1.500: confirmar con la compra')
on conflict (nombre) do nothing;

insert into productos (categoria_id, nombre, tipo, precio, orden)
values ((select id from categorias where nombre = 'Bebidas'), 'Gaseosa personal', 'bebida', 3500, 2)
on conflict (nombre) do update set precio = 3500, orden = 2, activo = true;

insert into receta_items (producto_id, insumo_id, cantidad, es_estimado)
select p.id, i.id, 1, false
  from productos p, insumos i
 where p.nombre = 'Gaseosa personal' and i.nombre = 'Gaseosa personal'
on conflict (producto_id, insumo_id) do nothing;

-- Costos de compra confirmados (quedan registrados en historial_costos)
begin;
select set_config('bpc.origen_costo', 'manual', true),
       set_config('bpc.motivo_costo', 'Costo de compra confirmado por socios 25-sep-2026', true);
update insumos set costo_unitario = 1200, es_estimado = false, nota = null
 where nombre = 'Gaseosa pequeña' and costo_unitario <> 1200;
update insumos set costo_unitario = 1000, es_estimado = false, nota = null
 where nombre = 'Agua 600 ml' and costo_unitario <> 1000;
commit;

-- ---------------------------------------------------------------------
-- Adicionales ($2.000 c/u)
-- ---------------------------------------------------------------------
insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, nota) values
  ('Huevo de codorniz', 'und', 330, 24,  true, 'Estimado de mercado: confirmar con la compra'),
  ('Frijol refrito',    'g',    10, 300, true, 'Estimado de mercado: confirmar con la compra'),
  ('Queso cheddar',     'g',    30, 200, true, 'Estimado de mercado: confirmar con la compra'),
  ('Tocineta',          'g',    45, 200, true, 'Estimado de mercado: confirmar con la compra'),
  ('Suero costeño',     'g',    12, 300, true, 'Estimado de mercado: confirmar con la compra')
on conflict (nombre) do nothing;

insert into toppings (nombre, es_premium, orden, activo) values
  ('Huevo de codorniz', true, 20, true),
  ('Frijoles',          true, 21, true),
  ('Queso cheddar',     true, 22, true),
  ('Tocineta frita',    true, 23, true),
  ('Suero costeño',     true, 24, true)
on conflict (nombre) do update set es_premium = true, orden = excluded.orden, activo = true;

-- Porción por perro: ESTIMADA
insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
select t.id, i.id, x.cant, true
  from (values
    ('Huevo de codorniz', 'Huevo de codorniz', 3),
    ('Frijoles',          'Frijol refrito',    25),
    ('Queso cheddar',     'Queso cheddar',     20),
    ('Tocineta frita',    'Tocineta',          15),
    ('Suero costeño',     'Suero costeño',     20)
  ) as x(topping, insumo, cant)
  join toppings t on t.nombre = x.topping
  join insumos  i on i.nombre = x.insumo
on conflict (topping_id, insumo_id) do nothing;

insert into producto_toppings (producto_id, topping_id, incluido_por_defecto, precio_extra)
select p.id, t.id, false, 2000
  from productos p
  join toppings t on t.nombre in ('Huevo de codorniz', 'Frijoles', 'Queso cheddar',
                                  'Tocineta frita', 'Suero costeño')
 where p.nombre = 'Perro básico'
on conflict (producto_id, topping_id) do update
  set precio_extra = 2000, incluido_por_defecto = false;

-- ---------------------------------------------------------------------
-- Verificación
-- ---------------------------------------------------------------------
select p.nombre, p.precio, round(costo_catalogo(p.id)) as costo_insumos
  from productos p
 where p.activo
 order by p.tipo, p.orden;
