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
-- Un solo bloque (sin tablas temporales) para el SQL Editor de Supabase.
-- Se puede correr más de una vez (si ya está bien, no cambia nada).
-- =====================================================================
do $$
declare
  v_ceb     bigint := (select id from insumos where nombre = 'Cebolla cabezona');
  v_items   bigint[];
  v_compras uuid[];
  v_desde   timestamptz;
  v_ventas  uuid[];
  v_costo   numeric;
begin
  if v_ceb is null then
    raise notice 'No existe el insumo Cebolla cabezona';
    return;
  end if;

  -- 1. Compras registradas por unidades → gramos
  select array_agg(ci.id), array_agg(distinct ci.compra_id), min(c.creado_en)
    into v_items, v_compras, v_desde
    from compra_items ci join compras c on c.id = ci.compra_id
   where ci.insumo_id = v_ceb and ci.costo_total / ci.cantidad > 100;

  if v_items is not null then
    update compra_items set cantidad = cantidad * 150 where id = any (v_items);

    -- Lo que entró al inventario (al borrar y volver a meter, el stock se corrige)
    delete from movimientos_inventario
     where tipo = 'compra' and insumo_id = v_ceb and compra_id = any (v_compras);
    insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, compra_id, nota, creado_en)
    select ci.insumo_id, 'compra', ci.cantidad, round(ci.costo_total / ci.cantidad, 4), ci.compra_id,
           'Corregido: la compra se había registrado por unidades (1 cebolla ≈ 150 g)', c.creado_en
      from compra_items ci join compras c on c.id = ci.compra_id
     where ci.id = any (v_items);
  end if;

  -- 2. Costo por gramo: el de la última compra de cebolla (ya en gramos)
  perform set_config('bpc.origen_costo', 'manual', true);
  perform set_config('bpc.motivo_costo', 'Corrección: compra de cebolla registrada por unidades', true);
  update insumos
     set costo_unitario = (select round(ci.costo_total / ci.cantidad, 4)
                             from compra_items ci join compras c on c.id = ci.compra_id
                            where ci.insumo_id = v_ceb
                            order by c.fecha desc, c.creado_en desc limit 1)
   where id = v_ceb and (costo_unitario > 100 or v_items is not null);
  select costo_unitario into v_costo from insumos where id = v_ceb;

  -- 3. Ventas con el costo dañado (o posteriores a la compra corregida)
  select array_agg(distinct venta_id) into v_ventas
    from movimientos_inventario
   where insumo_id = v_ceb and venta_id is not null and tipo = 'consumo_venta'
     and (costo_unitario > 100 or (v_desde is not null and creado_en >= v_desde));

  if v_ventas is null then
    return;
  end if;

  update movimientos_inventario set costo_unitario = v_costo
   where insumo_id = v_ceb and tipo = 'consumo_venta' and venta_id = any (v_ventas);

  update venta_items vi
     set costo_unitario = round(x.costo / vi.cantidad, 2)
    from (select c.item_id, sum(c.cantidad * coalesce(m.costo, i.costo_unitario)) as costo
            from (select vi3.venta_id, vi3.id as item_id, r.insumo_id, r.cantidad * vi3.cantidad as cantidad
                    from venta_items vi3 join receta_items r on r.producto_id = vi3.producto_id
                   where vi3.venta_id = any (v_ventas)
                  union all
                  select vi3.venta_id, vi3.id, ti.insumo_id, ti.cantidad * vi3.cantidad
                    from venta_items vi3
                    join venta_item_toppings vt on vt.venta_item_id = vi3.id
                    join topping_insumos ti on ti.topping_id = vt.topping_id
                   where vi3.venta_id = any (v_ventas)) c
            join insumos i on i.id = c.insumo_id
            left join lateral (select max(mm.costo_unitario) as costo from movimientos_inventario mm
                                where mm.venta_id = c.venta_id and mm.insumo_id = c.insumo_id
                                  and mm.tipo = 'consumo_venta') m on true
           group by c.item_id) x
   where vi.id = x.item_id;

  update ventas v
     set costo_insumos = round(x.costo, 2)
    from (select venta_id, sum(costo_unitario * cantidad) as costo from venta_items
           where venta_id = any (v_ventas) group by 1) x
   where v.id = x.venta_id;
end $$;

-- Revisión
select nombre, round(costo_unitario, 2) as costo_por_gramo, round(stock_actual) as stock_g
  from insumos where nombre = 'Cebolla cabezona';
select round(sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)) as materia_prima_por_perro_octubre
  from venta_items vi join ventas v on v.id = vi.venta_id
 where v.estado = 'completada' and vi.tipo_producto = 'perro'
   and v.vendida_en >= '2026-10-01T00:00:00-05:00';
