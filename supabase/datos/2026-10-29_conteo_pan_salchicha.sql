-- =====================================================================
-- Conteo del 29 de octubre (entrada de Fernanda)
-- Salchicha americana: 3 paquetes × 16 + 3 sueltas = 51. Además se
--   perdieron 2 que estaban en el horno.
-- Pan brioche: se dejan 5 bolsas completas × 8 = 40. La bolsa abierta
--   estaba maltratada y se pierde (con el pan que ya se iba a perder).
-- La app queda en el conteo; la diferencia sale como merma con su motivo.
-- Al final: tabla de pan y salchicha y el reporte de todo el inventario.
-- Se puede correr más de una vez.
-- =====================================================================
do $$
declare
  r       record;
  v_falta numeric;
  v_parte numeric;
begin
  for r in select i.id, i.nombre, i.stock_actual, i.costo_unitario, x.real, x.motivo, x.cant_motivo
             from (values ('Salchicha americana', 51, 'Conteo 29-oct: 2 salchichas que se perdieron en el horno', 2),
                          ('Pan brioche', 40, 'Conteo 29-oct: bolsa abierta maltratada que se pierde (y el pan que se iba a perder)', 9))
                    x(nombre, real, motivo, cant_motivo)
             join insumos i on i.nombre = x.nombre loop
    if exists (select 1 from movimientos_inventario where insumo_id = r.id and nota like 'Conteo 29-oct%') then
      continue;  -- ya se corrigió
    end if;
    v_falta := r.stock_actual - r.real;
    if v_falta > 0 then
      -- 1. La pérdida que ya sabemos (horno / bolsa maltratada)
      v_parte := least(v_falta, r.cant_motivo);
      insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
      values (r.id, 'merma', -v_parte, r.costo_unitario, r.motivo);
      -- 2. El resto: lo que faltó contra lo que decía la app
      if v_falta > v_parte then
        insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
        values (r.id, 'merma', -(v_falta - v_parte), r.costo_unitario, 'Conteo 29-oct: diferencia contra lo que decía la app');
      end if;
    elsif v_falta < 0 then
      insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
      values (r.id, 'ajuste', -v_falta, r.costo_unitario, 'Conteo 29-oct: había más de lo que decía la app');
    end if;
  end loop;
end $$;

-- Tabla de pan y salchicha: desde el conteo del 8 de octubre hasta hoy
with i as (select id, nombre, stock_actual, costo_unitario from insumos where nombre in ('Pan brioche', 'Salchicha americana')),
corte as (select insumo_id, max(creado_en) as en from movimientos_inventario where nota like 'Conteo Andrea 8-oct%' group by 1),
mov as (
  select m.insumo_id,
         sum(m.cantidad) filter (where m.tipo = 'compra' and m.creado_en > coalesce(k.en, '-infinity'))                            as comprado,
         -sum(m.cantidad) filter (where m.tipo in ('consumo_venta', 'reverso_venta') and m.creado_en > coalesce(k.en, '-infinity')) as vendido,
         -sum(m.cantidad) filter (where m.nota like 'Conteo 29-oct%' and m.cantidad < 0 and m.nota not like '%diferencia%')          as perdida_conocida,
         -sum(m.cantidad) filter (where m.nota like 'Conteo 29-oct: diferencia%')                                                     as faltante,
         sum(m.cantidad) filter (where m.nota like 'Conteo 29-oct%')                                                                  as ajuste_hoy
    from movimientos_inventario m left join corte k on k.insumo_id = m.insumo_id
   group by 1)
select i.nombre                                                   as "Producto",
       round(coalesce(m.comprado, 0))                             as "Comprado desde el 8-oct",
       round(coalesce(m.vendido, 0))                              as "Vendido desde el 8-oct",
       round(i.stock_actual - coalesce(m.ajuste_hoy, 0))          as "Decía la app",
       round(coalesce(m.perdida_conocida, 0))                     as "Perdido (horno / bolsa)",
       round(coalesce(m.faltante, 0))                             as "Faltante sin explicar",
       round(i.stock_actual)                                      as "Conteo real hoy",
       round(-coalesce(m.ajuste_hoy, 0) * i.costo_unitario)       as "Valor perdido"
  from i left join mov m on m.insumo_id = i.id
 order by 1;

-- Reporte de todo el inventario
select coalesce(familia::text, '—')                                    as "Familia",
       nombre                                                          as "Insumo",
       round(stock_actual, 1)                                          as "Hay",
       unidad::text                                                    as "Unidad",
       round(stock_minimo, 1)                                          as "Mínimo",
       case when stock_actual <= 0 then 'Agotado'
            when stock_actual <= stock_minimo then 'Pedir'
            else 'OK' end                                              as "Estado",
       round(costo_unitario, 2)                                        as "Costo unidad",
       round(greatest(stock_actual, 0) * costo_unitario)               as "Valor en bodega"
  from insumos
 where activo
 order by case when stock_actual <= stock_minimo then 0 else 1 end, familia nulls last, nombre;
