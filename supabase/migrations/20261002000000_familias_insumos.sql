-- =====================================================================
-- Familias de insumos para ordenar el inventario:
--   perro       pan, salchicha, quesos, papas, salsas y demás toppings
--   bebidas     gaseosas, aguas
--   utensilios  bandejas, servilletas, bolsas, cajitas, vasos…
--   otros       lo que no encaje
-- =====================================================================

alter table insumos
  add column familia text not null default 'perro'
  check (familia in ('perro', 'bebidas', 'utensilios', 'otros'));

update insumos set familia = 'bebidas'
 where nombre ilike 'gaseosa%' or nombre ilike 'agua%' or nombre ilike '%jugo%'
    or nombre ilike '%cerveza%' or nombre ilike '%bebida%';

update insumos set familia = 'utensilios'
 where nombre ilike '%bandeja%' or nombre ilike '%porta perro%' or nombre ilike '%servilleta%'
    or nombre ilike '%bolsa%' or nombre ilike '%cajita%' or nombre ilike '%caja %' or nombre ilike '%vaso%'
    or nombre ilike '%pitillo%' or nombre ilike '%guante%' or nombre ilike '%gorro%' or nombre ilike '%empaque%'
    or nombre ilike '%carton%' or nombre ilike '%cartón%' or nombre ilike '%palillo%';

create index on insumos (familia, nombre);

grant insert (familia), update (familia) on insumos to authenticated;
