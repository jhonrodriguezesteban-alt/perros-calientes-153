-- =====================================================================
-- * Calypso AADB9676 (26-sep, $677.009, tarjeta débito): Jhon prestó
--   $377.000; el resto ($300.009) salió de la tarjeta del negocio.
-- * Plan de recuperación de la inversión: 12 meses.
-- Requiere la migración 20261010000000. Se puede correr más de una vez.
-- =====================================================================
update compras
   set pagado_con = coalesce(pagado_con, 'tarjeta'),
       monto_socio = 377000,
       socio_id = (select id from auth.users where email = 'jhonrodriguezesteban@gmail.com')
 where proveedor = 'Calypso · AADB9676';

update planes_recuperacion set meses = 12 where descripcion = 'Inversión inicial';

select proveedor, pagado_con, monto_socio,
       (select sum(costo_total) from compra_items where compra_id = c.id) as total
  from compras c where proveedor = 'Calypso · AADB9676';
