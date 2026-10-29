-- Compras del sábado 17 de octubre (evento de Sebastián)
--   Calypso AADA146722 $269.798: salchicha + pan pagados con Bold ($187.997);
--   el resto con el efectivo del evento ($81.801).
--   San Rafael FV 145116: queso medio bloque $27.500, efectivo del evento.
--   Movilidad de Andrea para el evento: $35.000, efectivo del evento.
-- Se puede correr más de una vez.
do $$
declare
  v_socio uuid := coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                           (select id from perfiles where rol = 'socio' and activo order by nombre limit 1));
begin
  perform set_config('request.jwt.claim.sub', v_socio::text, true);

  if not exists (select 1 from compras where proveedor = 'Calypso · AADA146722 (Bold)') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-10-17', 'proveedor', 'Calypso · AADA146722 (Bold)', 'pagado_con', 'tarjeta', 'registrar_gasto', true,
      'items', (select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'cantidad', x.cant, 'costo_total', x.costo))
                  from (values ('Salchicha americana', 64, 127197),   -- 8 paquetes × 8
                               ('Pan brioche',         64,  60800))   -- 8 paquetes × 8
                       x(nombre, cant, costo) join insumos i on i.nombre = x.nombre)));
  end if;

  if not exists (select 1 from compras where proveedor = 'Calypso · AADA146722 (efectivo)') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-10-17', 'proveedor', 'Calypso · AADA146722 (efectivo)', 'pagado_con', 'efectivo', 'registrar_gasto', true,
      'items', (select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'cantidad', x.cant, 'costo_total', x.costo))
                  from (values ('Cebolla frita',   1000, 25501),
                               ('Piña en almíbar', 1750, 13900),   -- bolsa 2,5 kg bruto, 1,75 kg neto
                               ('Pepinillo',        600, 13900),   -- bolsa 1 kg bruto, 600 g neto
                               ('Jalapeños',        600, 13700),   -- bolsa 1 kg bruto, 600 g neto
                               ('Papa hojuela',     450, 14800))
                       x(nombre, cant, costo) join insumos i on i.nombre = x.nombre)));
  end if;

  if not exists (select 1 from compras where proveedor = 'San Rafael de la Once · FV 145116') then
    perform registrar_compra(jsonb_build_object(
      'fecha', '2026-10-17', 'proveedor', 'San Rafael de la Once · FV 145116', 'pagado_con', 'efectivo', 'registrar_gasto', true,
      'items', (select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'cantidad', 1146, 'costo_total', 27500))
                  from insumos i where i.nombre = 'Queso doble crema')));   -- medio bloque ≈ 1.146 g
  end if;

  insert into categorias_gasto (nombre, tipo) values ('Transporte y movilidad', 'variable') on conflict (nombre) do nothing;
  if not exists (select 1 from gastos where descripcion = 'Movilidad Andrea · evento de Sebastián 17-oct') then
    insert into gastos (fecha, categoria_id, monto, descripcion, pagado_con)
    values ('2026-10-17', (select id from categorias_gasto where nombre = 'Transporte y movilidad'), 35000,
            'Movilidad Andrea · evento de Sebastián 17-oct', 'efectivo');
  end if;
end $$;

-- Revisión
select c.fecha, c.proveedor, c.pagado_con, sum(ci.costo_total) as total
  from compras c join compra_items ci on ci.compra_id = c.id
 where c.fecha = '2026-10-17' group by 1, 2, 3 order by 2;
select fecha, descripcion, monto, pagado_con from gastos where descripcion like 'Movilidad Andrea%';
