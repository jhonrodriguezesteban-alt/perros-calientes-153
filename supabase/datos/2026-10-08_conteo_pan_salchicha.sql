-- =====================================================================
-- Conteo de Andrea del 8 de octubre: Pan brioche 122 (15 bolsas × 8 + 2),
-- Salchicha americana 103 (6 paquetes × 16 + 7 en la parrilla).
-- 1. Quita los ajustes de apertura que dejaban stock de más (la app queda
--    en compras − ventas). 2. La diferencia contra el conteo queda como merma.
-- Al final, tabla comparativa por mes. Se puede correr más de una vez.
-- =====================================================================
-- Corregir pan y salchicha al conteo de Andrea (8 de octubre)
do $$
declare
  r record;
  v_esperado numeric;
begin
  for r in select i.id, i.nombre, i.stock_actual, i.costo_unitario, x.real
             from (values ('Pan brioche', 122), ('Salchicha americana', 103)) x(nombre, real)
             join insumos i on i.nombre = x.nombre loop
    if exists (select 1 from movimientos_inventario where insumo_id = r.id and nota like 'Conteo Andrea 8-oct%') then
      continue;  -- ya se corrigió
    end if;
    v_esperado := coalesce((select sum(cantidad) from compra_items where insumo_id = r.id), 0)
                + coalesce((select sum(cantidad) from movimientos_inventario
                             where insumo_id = r.id and tipo in ('consumo_venta', 'reverso_venta')), 0);
    -- 1. Quitar los ajustes viejos que dejaron de más: la app queda en compras − ventas
    if r.stock_actual <> v_esperado then
      insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
      values (r.id, 'ajuste', v_esperado - r.stock_actual, r.costo_unitario,
              'Conteo Andrea 8-oct: se quitan ajustes de apertura que no existían');
    end if;
    -- 2. Lo que falta contra lo que debería haber: pérdida
    if r.real <> v_esperado then
      insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
      values (r.id, case when r.real < v_esperado then 'merma' else 'ajuste' end::tipo_movimiento, r.real - v_esperado, r.costo_unitario,
              'Conteo Andrea 8-oct: diferencia contra compras − ventas');
    end if;
  end loop;
end $$;

-- Tabla para Andrea
with i as (select id, nombre, stock_actual, costo_unitario from insumos where nombre in ('Pan brioche', 'Salchicha americana')),
compras as (
  select ci.insumo_id,
         sum(ci.cantidad) filter (where c.fecha < '2026-10-01') as sep,
         sum(ci.cantidad) filter (where c.fecha >= '2026-10-01') as oct,
         sum(ci.cantidad) as total
    from compra_items ci join compras c on c.id = ci.compra_id group by 1),
ventas as (
  select m.insumo_id,
         -sum(m.cantidad) filter (where (v.vendida_en at time zone 'America/Bogota')::date < '2026-10-01') as sep,
         -sum(m.cantidad) filter (where (v.vendida_en at time zone 'America/Bogota')::date >= '2026-10-01') as oct,
         -sum(m.cantidad) as total
    from movimientos_inventario m join ventas v on v.id = m.venta_id
   where m.tipo in ('consumo_venta', 'reverso_venta') group by 1),
conteo as (
  select insumo_id, sum(cantidad) filter (where tipo = 'ajuste') as ajuste, sum(cantidad) filter (where tipo = 'merma') as merma
    from movimientos_inventario where nota like 'Conteo Andrea 8-oct%' group by 1)
select i.nombre                                              as "Producto",
       round(coalesce(c.sep, 0))                             as "Comprado sept",
       round(coalesce(c.oct, 0))                             as "Comprado oct",
       round(coalesce(c.total, 0))                           as "Total comprado",
       round(coalesce(v.sep, 0))                             as "Vendido sept",
       round(coalesce(v.oct, 0))                             as "Vendido oct",
       round(coalesce(v.total, 0))                           as "Total vendido",
       round(coalesce(c.total, 0) - coalesce(v.total, 0))    as "Debería haber",
       round(i.stock_actual - coalesce(k.ajuste, 0) - coalesce(k.merma, 0)) as "Decía la app",
       round(i.stock_actual)                                 as "Conteo Andrea",
       round(i.stock_actual - (coalesce(c.total, 0) - coalesce(v.total, 0))) as "Diferencia",
       round((i.stock_actual - (coalesce(c.total, 0) - coalesce(v.total, 0))) * i.costo_unitario) as "Valor diferencia"
  from i left join compras c on c.insumo_id = i.id left join ventas v on v.insumo_id = i.id left join conteo k on k.insumo_id = i.id
 order by 1;
