-- =====================================================================
-- Recalcular el costo y el consumo de las ventas ya hechas con los
-- gramajes medidos (requiere 2026-10-02_gramajes_toppings.sql)
--
-- Cada venta conserva los toppings que se marcaron; solo cambia cuánto
-- insumo gastó cada uno. Se recalcula:
--   * venta_items.costo_unitario y ventas.costo_insumos (margen, finanzas
--     y punto de equilibrio se actualizan solos)
--   * el consumo de inventario de cada venta (el stock queda con lo que de
--     verdad se gastó)
-- El costo de cada insumo es el que tenía el día de la venta; si un insumo
-- no se había descontado antes en esa venta, se usa su costo actual.
-- Solo ventas completadas. Se puede correr más de una vez.
-- =====================================================================
begin;

-- Antes: costo promedio de materia prima por perro, por mes
create temp table _antes on commit drop as
select date_trunc('month', v.vendida_en at time zone 'America/Bogota')::date as mes,
       round(sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)) as por_perro
  from venta_items vi join ventas v on v.id = vi.venta_id
 where v.estado = 'completada' and vi.tipo_producto = 'perro'
 group by 1;

-- Costo de cada insumo en cada venta (el del día de la venta)
create temp table _costo_viejo on commit drop as
select m.venta_id, m.insumo_id, max(m.costo_unitario) as costo
  from movimientos_inventario m join ventas v on v.id = m.venta_id and v.estado = 'completada'
 where m.tipo = 'consumo_venta'
 group by 1, 2;

-- Consumo nuevo: receta de cada línea + toppings marcados, con los gramajes de hoy
create temp table _consumo on commit drop as
select vi.venta_id, vi.id as item_id, r.insumo_id, r.cantidad * vi.cantidad as cantidad
  from venta_items vi join ventas v on v.id = vi.venta_id and v.estado = 'completada'
  join receta_items r on r.producto_id = vi.producto_id
union all
select vi.venta_id, vi.id, ti.insumo_id, ti.cantidad * vi.cantidad
  from venta_items vi join ventas v on v.id = vi.venta_id and v.estado = 'completada'
  join venta_item_toppings vt on vt.venta_item_id = vi.id
  join topping_insumos ti on ti.topping_id = vt.topping_id;

create temp table _consumo_costeado on commit drop as
select c.*, coalesce(cv.costo, i.costo_unitario) as costo
  from _consumo c
  join insumos i on i.id = c.insumo_id
  left join _costo_viejo cv on cv.venta_id = c.venta_id and cv.insumo_id = c.insumo_id;

-- Costo por línea y por venta
update venta_items vi
   set costo_unitario = round(x.costo / vi.cantidad, 2)
  from (select item_id, sum(cantidad * costo) as costo from _consumo_costeado group by 1) x
 where vi.id = x.item_id;

update ventas v
   set costo_insumos = round(x.costo, 2)
  from (select venta_id, sum(costo_unitario * cantidad) as costo from venta_items group by 1) x
 where v.id = x.venta_id and v.estado = 'completada';

-- Inventario: se reemplaza el consumo de cada venta por el recalculado
-- (al borrar se devuelve el stock viejo; al insertar se descuenta el nuevo)
delete from movimientos_inventario m
 using ventas v
 where v.id = m.venta_id and v.estado = 'completada' and m.tipo = 'consumo_venta';

insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, venta_id, nota, creado_en)
select c.insumo_id, 'consumo_venta', -sum(c.cantidad), max(c.costo), c.venta_id,
       'Recalculado con gramajes medidos (2-oct)', v.vendida_en
  from _consumo_costeado c join ventas v on v.id = c.venta_id
 group by c.insumo_id, c.venta_id, v.vendida_en;

-- Resultado: materia prima por perro antes y después, por mes
select to_char(a.mes, 'YYYY-MM') as mes, a.por_perro as antes,
       round(sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)) as ahora
  from _antes a
  join ventas v on date_trunc('month', v.vendida_en at time zone 'America/Bogota')::date = a.mes and v.estado = 'completada'
  join venta_items vi on vi.venta_id = v.id and vi.tipo_producto = 'perro'
 group by a.mes, a.por_perro
 order by a.mes;

commit;
