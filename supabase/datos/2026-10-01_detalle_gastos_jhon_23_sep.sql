-- =====================================================================
-- Detalle real de los gastos que pagó Jhon el 23-sep
--   Tiendas Ara $188.040: pica todo $119.990, cocas (set ×4) $16.990,
--   trapos (set paños) $10.990, aceite Fritol ×4 $23.200, sal $1.290,
--   vinagre $2.850, toallas Scott $8.250, bolsas de basura $4.480.
--   Comercializadora CV SAS y Supermercado Comunal: agua, cilantro y limones.
-- Requiere haber corrido 2026-10-01_prestamos_sebastian_y_jhon.sql.
-- Se puede correr más de una vez.
-- =====================================================================
update gastos g set categoria_id = c.id, monto = x.monto, descripcion = x.descr
  from (values
    ('d2300000-0000-4000-8000-000000000001'::uuid, 'Equipos', 136980,
     'Tiendas Ara: pica todo $119.990, cocas (set ×4) $16.990'),
    ('d2300000-0000-4000-8000-000000000002'::uuid, 'Insumos', 27340,
     'Tiendas Ara: aceite Fritol ×4 $23.200, sal $1.290, vinagre $2.850'),
    ('d2300000-0000-4000-8000-000000000003'::uuid, 'Dotación e higiene', 23720,
     'Tiendas Ara: trapos (set paños) $10.990, toallas Scott $8.250, bolsas de basura $4.480'),
    ('d2300000-0000-4000-8000-000000000004'::uuid, 'Insumos', 29700,
     'Comercializadora CV SAS: agua, cilantro y limones'),
    ('d2300000-0000-4000-8000-000000000005'::uuid, 'Insumos', 22680,
     'Supermercado Comunal: agua, cilantro y limones')
  ) as x(id, categoria, monto, descr)
  join categorias_gasto c on c.nombre = x.categoria
 where g.id = x.id;

-- Revisión: lo de Jhon del 23-sep
select g.descripcion, cg.nombre as categoria, g.monto
  from gastos g join categorias_gasto cg on cg.id = g.categoria_id
 where g.id::text like 'd2300000-0000-4000-8000-%'
union all
select '= TOTAL', '', sum(monto) from gastos where id::text like 'd2300000-0000-4000-8000-%';
