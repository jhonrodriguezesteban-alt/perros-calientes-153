-- Los pagos a Alvaro Sanabria ya estaban como compras ("Griferia" y "Andres operario");
-- los gastos que agregué el 22-oct los duplicaban. Se borran. Se puede correr más de una vez.
delete from gastos
 where descripcion in ('Llave de grifería y conectores · Alvaro Andres Sanabria',
                       'Mano de obra Andrés (grifería) · Alvaro Andres Sanabria')
   and exists (select 1 from compras where proveedor ilike 'Griferia%' and fecha = '2026-10-01')
   and exists (select 1 from compras where proveedor ilike 'Andres operario%' and fecha = '2026-10-02');

-- Bold en octubre: lo que la app tiene como cobrado por Bold vs. lo que llegó por QR ($923.000)
select set_config('request.jwt.claim.sub',
       coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                (select id from perfiles where rol = 'socio' and activo order by nombre limit 1))::text, false);
select (select coalesce(sum(p.monto), 0) from venta_pagos p join ventas v on v.id = p.venta_id
         where v.estado = 'completada' and p.metodo::text = 'datafono' and v.vendida_en >= '2026-10-01T00:00:00-05:00')
     + (select coalesce(sum(total), 0) from ventas
         where estado = 'completada' and cobrada_metodo::text = 'datafono' and cobrada_en >= '2026-10-01T00:00:00-05:00')
         as cobrado_bold_octubre_app,
       923000 as llego_por_qr_octubre,
       (f ->> 'bold')::bigint as bold_app, 164995 as bold_real,
       (f ->> 'nequi')::bigint as nequi_app, 19286 as nequi_real
  from (select flujo_caja('2026-10-01', hoy_bogota()) as f) x;
