-- Cuadre Bold / Nequi (octubre):
--   * Coca-Cola $177.400 (3-oct) se pagó desde Bold (Bre-B a Nilton Osorio), no por Nequi.
--   * 1-oct $150.000 a Alvaro Andres Sanabria: llave de grifería y conectores (Bold).
--   * 2-oct $100.000 a Alvaro Andres Sanabria: mano de obra de Andrés (Bold).
-- Se puede correr más de una vez.
do $$
declare
  v_socio uuid := coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                           (select id from perfiles where rol = 'socio' and activo order by nombre limit 1));
  v_cat   bigint := (select id from categorias_gasto where nombre = 'Mantenimiento');
  n       int;
begin
  perform set_config('request.jwt.claim.sub', v_socio::text, true);

  -- 1. Coca-Cola: de Nequi a Bold
  update compras set pagado_con = 'tarjeta'
   where proveedor ilike '%coca%' and pagado_con = 'transferencia' and fecha between '2026-10-01' and '2026-10-05';
  get diagnostics n = row_count;
  update gastos set pagado_con = 'tarjeta'
   where compra_id in (select id from compras where proveedor ilike '%coca%' and fecha between '2026-10-01' and '2026-10-05')
     and pagado_con = 'transferencia';
  raise notice 'Compras de Coca-Cola pasadas a Bold: %', n;

  -- 2 y 3. Pagos a Alvaro Andres Sanabria (si ya estaban, solo se pasan a Bold)
  if v_cat is null then
    insert into categorias_gasto (nombre, tipo) values ('Mantenimiento', 'variable') returning id into v_cat;
  end if;

  update gastos set pagado_con = 'tarjeta', descripcion = coalesce(nullif(descripcion, ''), 'Llave de grifería y conectores · Alvaro Andres Sanabria')
   where fecha = '2026-10-01' and monto = 150000 and compra_id is null and pagado_con is distinct from 'tarjeta';
  if not exists (select 1 from gastos where fecha = '2026-10-01' and monto = 150000 and compra_id is null) then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con)
    values ('2026-10-01', v_cat, 150000, 'Llave de grifería y conectores · Alvaro Andres Sanabria', 'tarjeta');
  end if;

  update gastos set pagado_con = 'tarjeta', descripcion = coalesce(nullif(descripcion, ''), 'Mano de obra Andrés (grifería) · Alvaro Andres Sanabria')
   where fecha = '2026-10-02' and monto = 100000 and compra_id is null and pagado_con is distinct from 'tarjeta';
  if not exists (select 1 from gastos where fecha = '2026-10-02' and monto = 100000 and compra_id is null) then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con)
    values ('2026-10-02', v_cat, 100000, 'Mano de obra Andrés (grifería) · Alvaro Andres Sanabria', 'tarjeta');
  end if;
end $$;

-- Cómo quedan Bold y Nequi en la app (real: Bold $164.995 · Nequi $19.286)
select set_config('request.jwt.claim.sub',
       coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                (select id from perfiles where rol = 'socio' and activo order by nombre limit 1))::text, false);
select (f ->> 'bold')::bigint as bold_app, 164995 as bold_real, (f ->> 'bold')::bigint - 164995 as diferencia_bold,
       (f ->> 'nequi')::bigint as nequi_app, 19286 as nequi_real, (f ->> 'nequi')::bigint - 19286 as diferencia_nequi
  from (select flujo_caja('2026-10-01', hoy_bogota()) as f) x;
