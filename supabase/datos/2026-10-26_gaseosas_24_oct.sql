-- Gaseosas mini del sábado 24 de octubre: $92.500 pagados con Bold.
-- Coca-Cola 12 · Coca-Cola Zero 24 · Colombiana 12 · Uva 12 · Manzana 12 (72 und).
do $$
declare
  v_total bigint := 92500;
  v_socio uuid := coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                           (select id from perfiles where rol = 'socio' and activo order by nombre limit 1));
  v_items jsonb;
begin
  if exists (select 1 from compras where proveedor = 'Gaseosas mini (Coca-Cola y Postobón)' and fecha = '2026-10-24') then
    raise notice 'Esta compra ya estaba registrada';
    return;
  end if;
  perform set_config('request.jwt.claim.sub', v_socio::text, true);

  select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'cantidad', x.und,
                   'costo_total', case when x.ultimo then v_total - (v_total / 72) * (72 - x.und) else (v_total / 72) * x.und end))
    into v_items
    from (values ('Gaseosa pequeña · Coca-Cola', 12, false),
                 ('Gaseosa pequeña · Coca-Cola Zero', 24, false),
                 ('Gaseosa pequeña · Colombiana', 12, false),
                 ('Gaseosa pequeña · Uva', 12, false),
                 ('Gaseosa pequeña · Manzana', 12, true)) x(nombre, und, ultimo)
    join insumos i on i.nombre = x.nombre;
  if jsonb_array_length(coalesce(v_items, '[]')) <> 5 then
    raise exception 'Faltan sabores de gaseosa en el inventario: corre primero el código de bebidas por sabor';
  end if;

  perform registrar_compra(jsonb_build_object(
    'fecha', '2026-10-24', 'proveedor', 'Gaseosas mini (Coca-Cola y Postobón)',
    'pagado_con', 'tarjeta', 'registrar_gasto', true, 'items', v_items));
  raise notice 'Compra de 72 gaseosas mini registrada por $92.500 (Bold)';
end $$;

select i.nombre, round(i.stock_actual) as hay_ahora, round(i.costo_unitario) as costo_por_unidad
  from insumos i where i.nombre in ('Gaseosa pequeña · Coca-Cola', 'Gaseosa pequeña · Coca-Cola Zero',
                                    'Gaseosa pequeña · Colombiana', 'Gaseosa pequeña · Uva', 'Gaseosa pequeña · Manzana')
 order by 1;
