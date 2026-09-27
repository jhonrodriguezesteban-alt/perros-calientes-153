-- =====================================================================
-- Compra de surtido para la semana · Calypso del Caribe · 26-sep-2026
-- Factura AADB9676 · $677.009 (tarjeta débito)
--
-- Ejecutar DESPUÉS de 2026-09-29_compras_e_inventario_inicial.sql.
-- Se puede repetir sin duplicar. Al final muestra el inventario y el
-- resumen de inversión y ventas hasta hoy.
-- (Las próximas compras se pueden registrar directo en la app:
--  Panel → Compras.)
-- =====================================================================
begin;

select set_config('request.jwt.claim.sub',
                  (select id::text from auth.users where email = 'jhonrodriguezesteban@gmail.com'), true);
do $$ begin
  if auth.uid() is null or not es_socio() then
    raise exception 'No se encontró el usuario socio jhonrodriguezesteban@gmail.com';
  end if;
  if not exists (select 1 from compras where proveedor = 'Calypso · AADA143534') then
    raise exception 'Primero corre supabase/datos/2026-09-29_compras_e_inventario_inicial.sql';
  end if;
end $$;

do $$ begin
  if not exists (select 1 from compras where proveedor = 'Calypso · AADB9676') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-09-26',
      'proveedor', 'Calypso · AADB9676',
      'registrar_gasto', true,
      'items', (select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'cantidad', x.cant, 'costo_total', x.costo))
                  from (values
                    ('Cebolla frita',       2000,  56801),   -- 2 × 1 kg
                    ('Piña en almíbar',     3500,  27801),   -- 2 × 1,75 kg neto
                    ('Pepinillo',           1200,  27801),   -- 2 frascos × 600 g neto
                    ('Papa ripio',          2000,  26199),   -- 2 × 1 kg cabello de ángel Krumer
                    ('Salchicha americana',  192, 375607),   -- 12 paquetes × 16
                    ('Pan brioche',          176, 162800)    -- 22 paquetes × 8
                  ) as x(nombre, cant, costo)
                  join insumos i on i.nombre = x.nombre)));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Inventario actual
-- ---------------------------------------------------------------------
select nombre as insumo, unidad, round(stock_actual) as stock, round(costo_unitario, 2) as costo_unidad,
       round(greatest(stock_actual, 0) * costo_unitario) as valor_en_inventario
  from insumos
 where activo and (stock_actual <> 0 or exists (select 1 from movimientos_inventario m where m.insumo_id = insumos.id))
 order by valor_en_inventario desc, nombre;

-- ---------------------------------------------------------------------
-- Inversión y ventas hasta hoy
-- ---------------------------------------------------------------------
select concepto, valor from (
  select 1 as o, 'Compras de insumos (con factura)' as concepto,
         (select sum(g.monto) from gastos g join compras c on c.gasto_id = g.id) as valor
  union all
  select 2, 'Otros insumos sin inventario (prueba 21-sep, huevos, verduras, agua)',
         (select sum(g.monto) from gastos g join categorias_gasto cg on cg.id = g.categoria_id
           where cg.nombre = 'Insumos' and not exists (select 1 from compras c where c.gasto_id = g.id))
  union all
  select 3, 'Equipos y utensilios',
         (select sum(g.monto) from gastos g join categorias_gasto cg on cg.id = g.categoria_id where cg.tipo = 'inversion')
  union all
  select 4, 'Empaques, dotación y otros',
         (select sum(g.monto) from gastos g join categorias_gasto cg on cg.id = g.categoria_id
           where cg.nombre not in ('Insumos', 'Nómina') and cg.tipo <> 'inversion')
  union all
  select 5, 'Nómina (vales)',
         (select sum(g.monto) from gastos g join categorias_gasto cg on cg.id = g.categoria_id where cg.nombre = 'Nómina')
  union all
  select 6, '= TOTAL GASTADO', (select sum(monto) from gastos)
  union all
  select 7, 'Valor del inventario actual',
         (select round(sum(greatest(stock_actual, 0) * costo_unitario)) from insumos where activo)
  union all
  select 8, 'Ventas totales', (select sum(total) from ventas where estado = 'completada')
  union all
  select 9, '  de eso, fiado pendiente por cobrar',
         (select sum(total) from ventas where estado = 'completada' and metodo_pago::text = 'credito' and cobrada_en is null)
  union all
  select 10, 'Comisiones Bold', (select sum(comision_datafono) from ventas where estado = 'completada')
) r order by o;

commit;
