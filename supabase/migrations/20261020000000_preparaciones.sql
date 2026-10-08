-- =====================================================================
-- Preparaciones: insumos que se hacen con otros insumos
--
-- Ej. Salsa de huevo = salsa rosada + huevo duro + cebolla picada.
-- * preparaciones / preparacion_items: la receta de una tanda y cuánto rinde.
-- * preparar_tanda: descuenta los ingredientes, suma lo preparado y le pone
--   su costo por gramo (promedio con lo que ya había). Queda en el historial
--   de inventario como "Preparación".
-- * La Salsa de huevo pasa a ser un insumo: el topping gasta 22 g de él (ya
--   no salsa rosada, huevo y cebolla sueltos).
-- Se puede correr más de una vez.
-- =====================================================================

create table if not exists preparaciones (
  insumo_id    bigint primary key references insumos (id) on delete cascade,
  rendimiento  numeric(14,3) not null check (rendimiento > 0),
  nota         text
);
create table if not exists preparacion_items (
  insumo_id      bigint not null references preparaciones (insumo_id) on delete cascade,
  ingrediente_id bigint not null references insumos (id),
  cantidad       numeric(14,3) not null check (cantidad > 0),
  primary key (insumo_id, ingrediente_id)
);
alter table preparaciones enable row level security;
alter table preparacion_items enable row level security;
drop policy if exists preparaciones_socios on preparaciones;
create policy preparaciones_socios on preparaciones for all to authenticated using (es_socio()) with check (es_socio());
drop policy if exists preparacion_items_socios on preparacion_items;
create policy preparacion_items_socios on preparacion_items for all to authenticated using (es_socio()) with check (es_socio());
grant select, insert, update, delete on preparaciones, preparacion_items to authenticated;

-- Guardar (o cambiar) la receta de una preparación
create or replace function guardar_preparacion(p_insumo_id bigint, p_rendimiento numeric, p_items jsonb, p_nota text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede cambiar recetas' using errcode = '42501';
  end if;
  if coalesce(p_rendimiento, 0) <= 0 then
    raise exception 'Escribe cuánto rinde una tanda' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega los ingredientes' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) i
              where (i ->> 'ingrediente_id')::bigint = p_insumo_id or coalesce((i ->> 'cantidad')::numeric, 0) <= 0) then
    raise exception 'Revisa los ingredientes y sus cantidades' using errcode = '22023';
  end if;
  insert into preparaciones (insumo_id, rendimiento, nota) values (p_insumo_id, p_rendimiento, nullif(trim(p_nota), ''))
  on conflict (insumo_id) do update set rendimiento = excluded.rendimiento, nota = excluded.nota;
  delete from preparacion_items where insumo_id = p_insumo_id;
  insert into preparacion_items (insumo_id, ingrediente_id, cantidad)
  select p_insumo_id, (i ->> 'ingrediente_id')::bigint, sum((i ->> 'cantidad')::numeric)
    from jsonb_array_elements(p_items) i group by 2;
end $$;

-- Preparar una tanda: p_items = lo que de verdad se usó; p_producido = lo que salió
create or replace function preparar_tanda(p_insumo_id bigint, p_items jsonb, p_producido numeric, p_nota text default null)
returns numeric
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_costo  numeric := 0;
  v_stock  numeric;
  v_actual numeric;
  v_unit   numeric;
  v_nota   text;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  select nombre into v_nombre from insumos where id = p_insumo_id and activo;
  if v_nombre is null or not exists (select 1 from preparaciones where insumo_id = p_insumo_id) then
    raise exception 'Esa preparación no existe' using errcode = '22023';
  end if;
  if coalesce(p_producido, 0) <= 0 then
    raise exception 'Escribe cuánto salió' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0
     or exists (select 1 from jsonb_array_elements(p_items) i
                 where coalesce((i ->> 'cantidad')::numeric, 0) <= 0
                    or not exists (select 1 from insumos where id = (i ->> 'ingrediente_id')::bigint)) then
    raise exception 'Revisa los ingredientes y sus cantidades' using errcode = '22023';
  end if;
  v_nota := 'Preparación: ' || v_nombre || coalesce(' · ' || nullif(trim(p_nota), ''), '');

  -- Ingredientes: salen del inventario a su costo actual
  select sum((i ->> 'cantidad')::numeric * ins.costo_unitario) into v_costo
    from jsonb_array_elements(p_items) i join insumos ins on ins.id = (i ->> 'ingrediente_id')::bigint;
  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
  select ins.id, 'ajuste', -(i ->> 'cantidad')::numeric, ins.costo_unitario, v_nota
    from jsonb_array_elements(p_items) i join insumos ins on ins.id = (i ->> 'ingrediente_id')::bigint;

  -- Lo preparado: entra con su costo (promedio con lo que ya había)
  v_unit := round(coalesce(v_costo, 0) / p_producido, 4);
  select greatest(stock_actual, 0), costo_unitario into v_stock, v_actual from insumos where id = p_insumo_id for update;
  perform set_config('bpc.origen_costo', 'manual', true);
  perform set_config('bpc.motivo_costo', v_nota, true);
  update insumos
     set costo_unitario = round((v_stock * v_actual + coalesce(v_costo, 0)) / (v_stock + p_producido), 4),
         es_estimado = false
   where id = p_insumo_id;
  perform set_config('bpc.origen_costo', '', true);
  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
  values (p_insumo_id, 'ajuste', p_producido, v_unit, v_nota);
  return v_unit;
end $$;

-- Preparaciones con su receta (para el POS y el panel)
create or replace function preparaciones_lista()
returns table (insumo_id bigint, nombre text, unidad unidad_medida, rendimiento numeric, ingredientes jsonb)
language sql stable security definer set search_path = public as $$
  select p.insumo_id, i.nombre, i.unidad, p.rendimiento,
         coalesce((select jsonb_agg(jsonb_build_object('ingrediente_id', pi.ingrediente_id, 'nombre', g.nombre,
                                                       'unidad', g.unidad, 'cantidad', pi.cantidad,
                                                       'costo_unitario', case when es_socio() then g.costo_unitario end)
                                    order by g.nombre)
                     from preparacion_items pi join insumos g on g.id = pi.ingrediente_id
                    where pi.insumo_id = p.insumo_id), '[]')
    from preparaciones p join insumos i on i.id = p.insumo_id and i.activo
   where rol_actual() is not null
   order by i.nombre
$$;

revoke execute on function guardar_preparacion(bigint, numeric, jsonb, text), preparar_tanda(bigint, jsonb, numeric, text),
                           preparaciones_lista() from public, anon;
grant execute on function guardar_preparacion(bigint, numeric, jsonb, text), preparar_tanda(bigint, jsonb, numeric, text),
                          preparaciones_lista() to authenticated;

-- ---------------------------------------------------------------------
-- Salsa de huevo: tanda de 8 huevos duros + 1 cebolla (150 g) + 600 g de
-- salsa rosada ≈ 1.150 g. El topping gasta 22 g por perro.
-- ---------------------------------------------------------------------
do $$
declare
  v_salsa bigint;
  v_costo numeric;
  v_top   bigint;
begin
  if not exists (select 1 from insumos where nombre in ('Salsa rosada', 'Huevo', 'Cebolla cabezona') having count(*) = 3) then
    raise notice 'Faltan salsa rosada, huevo o cebolla: la salsa de huevo no se creó';
    return;
  end if;
  select (600 * (select costo_unitario from insumos where nombre = 'Salsa rosada')
        + 8 * (select costo_unitario from insumos where nombre = 'Huevo')
        + 150 * (select costo_unitario from insumos where nombre = 'Cebolla cabezona')) / 1150
    into v_costo;

  insert into insumos (nombre, unidad, costo_unitario, stock_minimo, es_estimado, familia, nota)
  values ('Salsa de huevo', 'g', round(v_costo, 4), 300, true, 'perro', 'Se prepara: salsa rosada + huevo duro + cebolla')
  on conflict (nombre) do update set activo = true
  returning id into v_salsa;

  if not exists (select 1 from preparaciones where insumo_id = v_salsa) then
    insert into preparaciones (insumo_id, rendimiento, nota)
    values (v_salsa, 1150, '8 huevos duros picados, 1 cebolla picada y salsa rosada');
    insert into preparacion_items (insumo_id, ingrediente_id, cantidad)
    select v_salsa, id, case nombre when 'Salsa rosada' then 600 when 'Huevo' then 8 else 150 end
      from insumos where nombre in ('Salsa rosada', 'Huevo', 'Cebolla cabezona');
  end if;

  -- El topping gasta la salsa de huevo preparada
  select id into v_top from toppings where nombre = 'Salsa de huevo';
  if v_top is not null then
    delete from topping_insumos where topping_id = v_top and insumo_id <> v_salsa;
    insert into topping_insumos (topping_id, insumo_id, cantidad, es_estimado)
    values (v_top, v_salsa, 22, false)
    on conflict (topping_id, insumo_id) do nothing;
  end if;
end $$;

notify pgrst, 'reload schema';
