-- =====================================================================
-- Ajustes a lo que se le debe a Sebastián (Johans)
-- * Distribuciones Mateo estaba dos veces: el resumen de $124.000 y cada
--   artículo por separado. Se borra el resumen.
-- * Calypso AADA143728 ($96.200, panes del 24-sep) salió del efectivo de la
--   caja del local, no de Sebastián.
-- Se puede correr más de una vez.
-- =====================================================================
delete from gastos
 where fecha = '2026-09-24'
   and monto = 124000
   and descripcion ilike 'Distribuciones Mateo: caneca vaivén 70 L%';

update compras set pagado_con = 'caja', socio_id = null
 where proveedor = 'Calypso · AADA143728';
update gastos set pagado_con = 'caja', pagado_por_socio = null
 where id in (select gasto_id from compras where proveedor = 'Calypso · AADA143728');
