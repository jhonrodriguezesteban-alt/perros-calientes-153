-- =====================================================================
-- Corregir el costo de la cebolla cabezona
--
-- Una compra de cebolla se registró por UNIDADES (ej. "2 cebollas por
-- $2.250") pero en la app la cebolla va en GRAMOS: quedó a ~$1.125 el gramo
-- y disparó el costo de cada perro. Se corrige así:
--   1. Las compras de cebolla con más de $100 por gramo pasan a gramos
--      (1 cebolla ≈ 150 g) y se corrige lo que entró al inventario.
--   2. El costo de la cebolla queda en el de esa compra por gramo.
--   3. Las ventas que gastaron cebolla con ese costo se recalculan.
-- Se puede correr más de una vez (si ya está bien, no cambia nada).
-- =====================================================================
begin;

create temp table _cebolla on commit drop as
select id from insumos where nombre = 'Cebolla cabezona';

-- 1. Compras registradas por unidades → gramos
create temp table _malas on commit drop as
select ci.id, ci.compra_id, (select c.creado_en from compras c where c.id = ci.compra_id) as desde
  from compra_items ci
 where ci.insumo_id = (select id from _cebolla)
   and ci.costo_total / ci.cantidad > 100;

update compra_items set cantidad = cantidad * 150 where id in (select id from _malas);

-- Lo que entró al inventario por esas compras (al borrar y volver a meter, el stock se corrige)
delete from movimientos_inventario
 where tipo = 'compra' and insumo_id = (select id from _cebolla)
   and compra_id in (select compra_id from _malas);
insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, compra_id, nota, creado_en)
select ci.insumo_id, 'compra', ci.cantidad, round(ci.costo_total / ci.cantidad, 4), ci.compra_id,
       'Corregido: la compra se había registrado por unidades (1 cebolla ≈ 150 g)', c.creado_en
  from compra_items ci join compras c on c.id = ci.compra_id
 where ci.id in (select id from _malas);

-- 2. Costo por gramo: el de la última compra de cebolla (ya en gramos)
select set_config('bpc.origen_costo', 'manual', true),
       set_config('bpc.motivo_costo', 'Corrección: compra de cebolla registrada por unidades', true);
update insumos i
   set costo_unitario = x.costo
  from (select round(ci.costo_total / ci.cantidad, 4) as costo
          from compra_items ci join compras c on c.id = ci.compra_id
         where ci.insumo_id = (select id from _cebolla)
         order by c.fecha desc, c.creado_en desc limit 1) x
 where i.id = (select id from _cebolla)
   and (i.costo_unitario > 100 or exists (select 1 from _malas));

-- 3. Consumos de cebolla con el costo dañado → costo corregido
-- (las que tienen el costo dañado, o las posteriores a la compra corregida)
create temp table _ventas_tocadas on commit drop as
select distinct venta_id from movimientos_inventario
 where insumo_id = (select id from _cebolla) and venta_id is not null and tipo = 'consumo_venta'
   and (costo_unitario > 100 or creado_en >= (select min(desde) from _malas));

update movimientos_inventario
   set costo_unitario = (select costo_unitario from insumos where id = (select id from _cebolla))
 where insumo_id = (select id from _cebolla) and tipo = 'consumo_venta'
   and venta_id in (select venta_id from _ventas_tocadas);

-- Recalcular el costo de esas ventas con lo que de verdad descontaron
update venta_items vi
   set costo_unitario = round(x.costo / vi.cantidad, 2)
  from (select vi2.id as item_id,
               sum(c.cantidad * coalesce(m.costo_unitario, i.costo_unitario)) as costo
          from venta_items vi2
          join (select vi3.venta_id, vi3.id as item_id, r.insumo_id, r.cantidad * vi3.cantidad as cantidad
                  from venta_items vi3 join receta_items r on r.producto_id = vi3.producto_id
                union all
                select vi3.venta_id, vi3.id, ti.insumo_id, ti.cantidad * vi3.cantidad
                  from venta_items vi3
                  join venta_item_toppings vt on vt.venta_item_id = vi3.id
                  join topping_insumos ti on ti.topping_id = vt.topping_id) c on c.item_id = vi2.id
          join insumos i on i.id = c.insumo_id
          left join lateral (select max(mm.costo_unitario) as costo_unitario from movimientos_inventario mm
                              where mm.venta_id = c.venta_id and mm.insumo_id = c.insumo_id
                                and mm.tipo = 'consumo_venta') m on true
         where vi2.venta_id in (select venta_id from _ventas_tocadas)
         group by vi2.id) x
 where vi.id = x.item_id;

update ventas v
   set costo_insumos = round(x.costo, 2)
  from (select venta_id, sum(costo_unitario * cantidad) as costo from venta_items
         where venta_id in (select venta_id from _ventas_tocadas) group by 1) x
 where v.id = x.venta_id;

commit;

-- Revisión
select nombre, round(costo_unitario, 2) as costo_por_gramo, round(stock_actual) as stock_g
  from insumos where nombre = 'Cebolla cabezona';
select round(sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)) as materia_prima_por_perro_octubre
  from venta_items vi join ventas v on v.id = vi.venta_id
 where v.estado = 'completada' and vi.tipo_producto = 'perro'
   and v.vendida_en >= '2026-10-01T00:00:00-05:00';
