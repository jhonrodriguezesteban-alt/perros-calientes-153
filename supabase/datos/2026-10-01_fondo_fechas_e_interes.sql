-- =====================================================================
-- Fondo de inversión: fechas reales e interés del 3 %
--
-- * El aporte de los ~$13.000.000 entró el 21-sep.
-- * Pago a Esneider y la salchichera: 21-sep. Muebles: 22-sep.
-- * Interés del 3 % ($390.000) descontado al recibir el dinero: gasto de
--   "Intereses y costos financieros" pagado con el fondo, 21-sep. Si ya
--   estaba registrado, solo se le corrige la fecha; si el aporte se había
--   guardado neto ($12.610.000), se deja en $13.000.000 + el interés aparte
--   (el saldo del fondo queda igual).
-- Se puede correr más de una vez.
-- =====================================================================
begin;

-- Aporte principal → 21-sep (y bruto si estaba neto del interés)
update aportes_socios set fecha = '2026-09-21'
 where tipo = 'aporte' and monto >= 10000000;
update aportes_socios set monto = 13000000,
       descripcion = concat_ws(' · ', nullif(descripcion, ''), 'Bruto: el interés de $390.000 va como gasto aparte')
 where tipo = 'aporte' and monto = 12610000
   and not exists (select 1 from gastos g join categorias_gasto c on c.id = g.categoria_id
                    where c.nombre = 'Intereses y costos financieros' and g.monto = 390000);

-- Pagos hechos con el fondo → su fecha real
update gastos set fecha = '2026-09-21'
 where pagado_con = 'fondo' and descripcion ilike any (array['%esneider%', '%salchicher%']);
update gastos set fecha = '2026-09-22'
 where pagado_con = 'fondo' and descripcion ilike '%mueble%';

-- Interés del 3 %: corregir fecha si ya existe, crearlo si no
update gastos set fecha = '2026-09-21', pagado_con = 'fondo'
 where monto = 390000 and categoria_id = (select id from categorias_gasto where nombre = 'Intereses y costos financieros');
insert into gastos (id, fecha, categoria_id, monto, descripcion, pagado_con, registrado_por)
select 'f2100000-0000-4000-8000-000000000390', '2026-09-21',
       (select id from categorias_gasto where nombre = 'Intereses y costos financieros'),
       390000, 'Interés 3 % sobre $13.000.000 (descontado al recibir el dinero)', 'fondo',
       (select id from perfiles where rol = 'socio' and activo order by (nombre ilike 'Jhon%') desc limit 1)
 where not exists (select 1 from gastos g join categorias_gasto c on c.id = g.categoria_id
                    where c.nombre = 'Intereses y costos financieros' and g.monto = 390000);

commit;

-- Revisión: todos los movimientos del fondo, del más antiguo al más nuevo
select fecha, movimiento, detalle, valor from (
  select a.fecha, case a.tipo when 'aporte' then 'Aporte' else 'Devolución' end as movimiento,
         coalesce(p.nombre, 'Sin socio') || coalesce(' · ' || a.descripcion, '') as detalle,
         case a.tipo when 'aporte' then a.monto else -a.monto end as valor
    from aportes_socios a left join perfiles p on p.id = a.socio_id
  union all
  select c.fecha, 'Compra', coalesce(c.proveedor, 'Compra'), -sum(ci.costo_total)
    from compras c join compra_items ci on ci.compra_id = c.id where c.pagado_con = 'fondo' group by c.id
  union all
  select g.fecha, 'Pago · ' || cg.nombre, coalesce(g.descripcion, ''), -g.monto
    from gastos g join categorias_gasto cg on cg.id = g.categoria_id
   where g.pagado_con = 'fondo' and not exists (select 1 from compras c where c.gasto_id = g.id)
) m
union all
select null, '= SALDO DEL FONDO', '', (
  coalesce((select sum(case when tipo = 'devolucion' then -monto else monto end) from aportes_socios), 0)
  - coalesce((select sum(ci.costo_total) from compras c join compra_items ci on ci.compra_id = c.id where c.pagado_con = 'fondo'), 0)
  - coalesce((select sum(g.monto) from gastos g where g.pagado_con = 'fondo' and not exists (select 1 from compras c where c.gasto_id = g.id)), 0))
order by 1 nulls last, 4 desc;
