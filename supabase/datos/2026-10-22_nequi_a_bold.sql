-- Todo lo que quedó registrado como pagado "por Nequi" en realidad salió de Bold.
-- Se pasa a Bold y queda marcado con "[antes Nequi]" para poder revisarlo o devolverlo.
-- (Los abonos que entraron a Nequi no se tocan.) Se puede correr más de una vez.
do $$
declare n1 int; n2 int; n3 int;
begin
  update compras set pagado_con = 'tarjeta', proveedor = coalesce(proveedor, 'Compra') || ' [antes Nequi]'
   where pagado_con = 'transferencia';
  get diagnostics n1 = row_count;
  update gastos set pagado_con = 'tarjeta', descripcion = coalesce(descripcion, '') || ' [antes Nequi]'
   where pagado_con = 'transferencia';
  get diagnostics n2 = row_count;
  update pagos_personal set pagado_con = 'tarjeta', nota = concat_ws(' ', nota, '[antes Nequi]')
   where pagado_con = 'transferencia' and tipo <> 'abono' and anulado_en is null;
  get diagnostics n3 = row_count;
  raise notice 'Pasados de Nequi a Bold: % compras, % gastos, % pagos de personal', n1, n2, n3;
end $$;

-- Lo que se pasó a Bold
select 'Compra' as que, c.fecha, c.proveedor as detalle,
       (select coalesce(sum(costo_total), 0) from compra_items where compra_id = c.id) as monto
  from compras c where c.proveedor like '%[antes Nequi]%'
union all
select 'Gasto', g.fecha, g.descripcion, g.monto from gastos g
 where g.descripcion like '%[antes Nequi]%' and g.compra_id is null
   and not exists (select 1 from compras c where c.gasto_id = g.id)
union all
select initcap(tipo), fecha, persona || ' · ' || coalesce(nota, ''), monto from pagos_personal
 where nota like '%[antes Nequi]%' and gasto_id is null
order by 2;

-- Cómo quedan (real: Bold $164.995 · Nequi $19.286)
select set_config('request.jwt.claim.sub',
       coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                (select id from perfiles where rol = 'socio' and activo order by nombre limit 1))::text, false);
select (f ->> 'bold')::bigint as bold_app, (f ->> 'bold')::bigint - 164995 as diferencia_bold,
       (f ->> 'nequi')::bigint as nequi_app, (f ->> 'nequi')::bigint - 19286 as diferencia_nequi
  from (select flujo_caja('2026-10-01', hoy_bogota()) as f) x;
