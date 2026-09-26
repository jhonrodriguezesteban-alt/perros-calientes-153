-- =====================================================================
-- Gastos y compras del 24 y 25 de septiembre de 2026 (segunda tanda de
-- facturas). Ejecutar DESPUÉS de las migraciones. Se puede repetir sin
-- duplicar nada.
--
-- Supuesto por confirmar: la transferencia de $49.200 por gaseosas no
-- tiene detalle; se carga como 41 gaseosas pequeñas a $1.200 (da exacto).
-- El conteo físico de la nevera corrige las cantidades si hubo personales.
-- =====================================================================
begin;

select set_config('request.jwt.claim.sub',
                  (select id::text from auth.users where email = 'jhonrodriguezesteban@gmail.com'), true);
do $$ begin
  if auth.uid() is null or not es_socio() then
    raise exception 'No se encontró el usuario socio jhonrodriguezesteban@gmail.com';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 24-sep 11:44 · Gaseosas por transferencia Bre-B a Yefersson Lasso Muñoz
-- ---------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from compras where proveedor = 'Gaseosas · Bre-B TROG0X5FloEC') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-09-24',
      'proveedor', 'Gaseosas · Bre-B TROG0X5FloEC',
      'registrar_gasto', true,
      'items', jsonb_build_array(jsonb_build_object(
        'insumo_id', (select id from insumos where nombre = 'Gaseosa pequeña'),
        'cantidad', 41, 'costo_total', 49200))));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Gastos sin inventario
-- ---------------------------------------------------------------------
insert into gastos (id, fecha, categoria_id, monto, descripcion, registrado_por)
select x.id::uuid, x.fecha::date, c.id, x.monto, x.descr, auth.uid()
  from (values
    ('c2400000-0000-4000-8000-000000000001', '2026-09-24', 'Insumos', 13780,
     'Agua Cristal garrafa 5 L × 2 (uso en cocina) · Comunal Margaritas'),
    ('c2400000-0000-4000-8000-000000000002', '2026-09-24', 'Equipos', 124000,
     'Distribuciones Mateo: caneca vaivén 70 L $40.000, tanque plástico $28.000, dispensador de servilletas $20.000, pinza de hielo acero $8.000, CA-07 $28.000'),
    ('c2500000-0000-4000-8000-000000000001', '2026-09-25', 'Empaques', 10500,
     'Todo Plásticos L&M: bolsas para llevar 2 lb $2.900 y 3 lb $3.400, cartones de perro $4.200'),
    ('c2500000-0000-4000-8000-000000000002', '2026-09-25', 'Insumos', 20000,
     'Verduras: tomate, cebolla, cilantro y limones (Andrea)')
  ) as x(id, fecha, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
on conflict (id) do nothing;

-- Los $50.000 del 23-sep que se le dieron a Andrea fueron huevos normales y de codorniz
update gastos set descripcion = 'Huevos normales y de codorniz (dinero entregado a Andrea)'
 where id = 'a2300000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------
-- Verificación: todos los gastos de apertura
-- ---------------------------------------------------------------------
select g.fecha, c.nombre as categoria, g.monto, g.descripcion
  from gastos g join categorias_gasto c on c.id = g.categoria_id
 where g.fecha between '2026-09-21' and '2026-09-25'
 order by g.fecha, g.monto desc;

commit;
