-- =====================================================================
-- Compras de apertura pagadas con el fondo de inversión de los socios
--
-- Estas facturas salieron de los ~$13.000.000 que pusieron los socios, no
-- de la caja ni de Bold/Nequi del negocio:
--   * Calypso AADA143534 (23-sep) ............ $516.609
--   * La Inglesa IGN 268248 (23-sep) ......... $340.200
--   * San Rafael de la Once FV 142707 (23-sep)  $214.440
--   * San Rafael de la Once (21-sep, prueba) .. $201.300
--   * Aseo por transferencia Bre-B (23-sep) ... $50.000 (+ $200 de 4x1000) — nuevo
-- Se puede correr más de una vez: no duplica nada.
-- =====================================================================
begin;

-- Compras con factura (y su gasto ligado)
update compras set pagado_con = 'fondo', socio_id = null
 where proveedor in ('Calypso · AADA143534', 'La Inglesa · IGN 268248', 'San Rafael de la Once · FV 142707');
update gastos set pagado_con = 'fondo', pagado_por_socio = null
 where id in (select gasto_id from compras
               where proveedor in ('Calypso · AADA143534', 'La Inglesa · IGN 268248', 'San Rafael de la Once · FV 142707'));

-- Compra de prueba del 21-sep (gasto sin inventario)
update gastos set pagado_con = 'fondo', pagado_por_socio = null
 where id = 'c2100000-0000-4000-8000-000000000001'
    or (fecha = '2026-09-21' and descripcion ilike 'Compra de prueba antes de abrir%');

-- Aseo por transferencia (23-sep 11:12) y el 4x1000 de esa transferencia
insert into gastos (id, fecha, categoria_id, monto, descripcion, pagado_con, registrado_por)
select x.id::uuid, '2026-09-23', c.id, x.monto, x.descr, 'fondo',
       (select id from perfiles where rol = 'socio' and activo order by (nombre ilike 'Jhon%') desc limit 1)
  from (values
    ('c2300000-0000-4000-8000-000000000010', 'Dotación e higiene', 50000, 'Implementos de aseo (transferencia Bre-B a Daviplata)'),
    ('c2300000-0000-4000-8000-000000000011', 'Intereses y costos financieros', 200, '4x1000 de la transferencia de aseo')
  ) as x(id, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
on conflict (id) do nothing;

commit;

-- Revisión: lo pagado con el fondo y cuánto queda
select concepto, valor from (
  select 1 as o, 'Aportado por los socios' as concepto,
         coalesce((select sum(monto) from aportes_socios where tipo = 'aporte'), 0) as valor
  union all
  select 2, 'Devuelto a socios', coalesce((select sum(monto) from aportes_socios where tipo = 'devolucion'), 0)
  union all
  select 3, 'Compras pagadas con el fondo',
         coalesce((select sum(ci.costo_total) from compras c join compra_items ci on ci.compra_id = c.id where c.pagado_con = 'fondo'), 0)
  union all
  select 4, 'Gastos pagados con el fondo',
         coalesce((select sum(g.monto) from gastos g where g.pagado_con = 'fondo'
                    and not exists (select 1 from compras c where c.gasto_id = g.id)), 0)
  union all
  select 5, 'Préstamos pendientes desde el fondo',
         coalesce((select sum(case when tipo = 'prestamo' then monto else -monto end) from pagos_personal
                    where pagado_con = 'fondo' and tipo in ('prestamo', 'abono') and anulado_en is null), 0)
) r order by o;
