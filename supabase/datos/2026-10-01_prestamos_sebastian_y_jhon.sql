-- =====================================================================
-- Plata que pusieron los socios (el negocio se la debe)
--
-- * Sebastián prestó la plata de todo lo comprado el 24-sep:
--     Calypso AADA143728 $96.200 · Gaseosas Bre-B $49.200 ·
--     Agua Cristal $13.780 · Distribuciones Mateo (equipos) $124.000
-- * Jhon pagó de su bolsillo el 23-sep (gastos nuevos):
--     Tiendas Ara (tarjeta) $188.040:
--       equipos: picador $119.990, set ×4 $16.990, set panes $10.990, salero $1.290
--       cocina: aceite Fritol ×4 $23.200, vinagre $2.850
--       aseo: toallas Scott $8.250, bolsas de basura $4.480
--     Comercializadora CV SAS (Bre-B 15:29) $29.700
--     Supermercado Comunal (16:16) $22.680 + 4x1000 $91
--   La transferencia de $1.000 a "Bendito Perro Caliente" (16:30) fue una
--   prueba hacia la cuenta del negocio: no es gasto.
-- Quedan como "Lo pagó un socio": en Flujo de caja → Plata que pusieron
-- los socios. Se puede correr más de una vez.
-- =====================================================================
begin;

do $$
declare
  v_sebas uuid := (select id from perfiles where rol = 'socio' and activo and nombre ilike 'Sebas%' limit 1);
  v_jhon  uuid := (select id from perfiles where rol = 'socio' and activo and nombre ilike 'Jhon%' limit 1);
begin
  if v_sebas is null then
    raise exception 'No encontré a Sebastián como socio en la app (perfiles). Créalo como socio o dime con qué nombre está.';
  end if;
  if v_jhon is null then
    raise exception 'No encontré a Jhon como socio en la app (perfiles).';
  end if;

  -- 24-sep: lo prestó Sebastián
  update compras set pagado_con = 'socio', socio_id = v_sebas
   where fecha = '2026-09-24' and retiro_id is null;
  update gastos set pagado_con = 'socio', pagado_por_socio = v_sebas
   where fecha = '2026-09-24' and retiro_id is null;

  -- 23-sep: lo pagó Jhon
  insert into gastos (id, fecha, categoria_id, monto, descripcion, pagado_con, pagado_por_socio, registrado_por)
  select x.id::uuid, '2026-09-23', c.id, x.monto, x.descr, 'socio', v_jhon, v_jhon
    from (values
      ('d2300000-0000-4000-8000-000000000001', 'Equipos', 149260,
       'Tiendas Ara: picador $119.990, set ×4 $16.990, set panes $10.990, salero $1.290'),
      ('d2300000-0000-4000-8000-000000000002', 'Insumos', 26050,
       'Tiendas Ara: aceite Fritol ×4 $23.200, vinagre $2.850'),
      ('d2300000-0000-4000-8000-000000000003', 'Dotación e higiene', 12730,
       'Tiendas Ara: toallas Scott $8.250, bolsas de basura $4.480'),
      ('d2300000-0000-4000-8000-000000000004', 'Insumos', 29700,
       'Comercializadora CV SAS (transferencia Bre-B)'),
      ('d2300000-0000-4000-8000-000000000005', 'Insumos', 22680,
       'Supermercado Comunal (tarjeta)'),
      ('d2300000-0000-4000-8000-000000000006', 'Intereses y costos financieros', 91,
       '4x1000 compra Supermercado Comunal')
    ) as x(id, categoria, monto, descr)
    join categorias_gasto c on c.nombre = x.categoria
  on conflict (id) do nothing;
end $$;

commit;

-- Revisión: lo que cada socio puso y el negocio le debe
select p.nombre as socio, x.fecha, x.que, x.monto
  from (select c.socio_id as socio, c.fecha, 'Compra · ' || coalesce(c.proveedor, '') as que, sum(ci.costo_total) as monto
          from compras c join compra_items ci on ci.compra_id = c.id where c.pagado_con = 'socio' group by c.id
        union all
        select g.pagado_por_socio, g.fecha, 'Gasto · ' || coalesce(g.descripcion, ''), g.monto
          from gastos g where g.pagado_con = 'socio' and not exists (select 1 from compras c where c.gasto_id = g.id)) x
  join perfiles p on p.id = x.socio
union all
select p.nombre, null, '= TOTAL QUE SE LE DEBE', sum(x.monto)
  from (select c.socio_id as socio, ci.costo_total as monto
          from compras c join compra_items ci on ci.compra_id = c.id where c.pagado_con = 'socio'
        union all
        select g.pagado_por_socio, g.monto
          from gastos g where g.pagado_con = 'socio' and not exists (select 1 from compras c where c.gasto_id = g.id)) x
  join perfiles p on p.id = x.socio
 group by p.nombre
order by 1, 2 nulls last;
