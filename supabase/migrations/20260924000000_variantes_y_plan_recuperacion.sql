-- =====================================================================
-- Variantes de topping (papa y queso a elección del cliente), marcas de
-- "dato estimado" y desglose del plan de recuperación de inversión.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Variantes de topping
-- Toppings con el mismo `grupo` son excluyentes: en un perro va una sola
-- variante (o ninguna). Ej. grupo 'Papa' = Papa ripio | Papa hojuela.
-- Cada variante tiene su propio insumo, así el costo real de cada venta
-- sale de la variante que se usó, no de un promedio.
-- ---------------------------------------------------------------------
alter table toppings add column grupo text;
create index on toppings (grupo) where grupo is not null;

create or replace function _agregar_toppings(p_item_id bigint, p_producto_id bigint, p_toppings jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_invalidos int;
  v_grupo     text;
begin
  if p_toppings is null or jsonb_typeof(p_toppings) <> 'array' or jsonb_array_length(p_toppings) = 0 then
    return;
  end if;

  select count(*) into v_invalidos
    from (select distinct value::bigint as tid from jsonb_array_elements_text(p_toppings)) s
   where not exists (select 1 from producto_toppings pt
                       join toppings t on t.id = pt.topping_id and t.activo
                      where pt.producto_id = p_producto_id and pt.topping_id = s.tid);
  if v_invalidos > 0 then
    raise exception 'Hay toppings que no aplican a este producto' using errcode = '22023';
  end if;

  select t.grupo into v_grupo
    from (select distinct value::bigint as tid from jsonb_array_elements_text(p_toppings)) s
    join toppings t on t.id = s.tid
   where t.grupo is not null
   group by t.grupo
  having count(*) > 1
   limit 1;
  if v_grupo is not null then
    raise exception 'Elige una sola opción de %', lower(v_grupo) using errcode = '22023';
  end if;

  insert into venta_item_toppings (venta_item_id, topping_id, nombre_topping, precio_extra)
  select p_item_id, t.id, t.nombre, pt.precio_extra
    from (select distinct value::bigint as tid from jsonb_array_elements_text(p_toppings)) s
    join toppings t on t.id = s.tid
    join producto_toppings pt on pt.topping_id = t.id and pt.producto_id = p_producto_id;
end $$;

-- ---------------------------------------------------------------------
-- Datos estimados (pendientes de validar en operación real)
-- ---------------------------------------------------------------------
alter table receta_items    add column es_estimado boolean not null default true;
alter table topping_insumos add column es_estimado boolean not null default true;
alter table insumos         add column es_estimado boolean not null default false;  -- costo estimado
alter table insumos         add column nota text;                                    -- proveedor, presentación…

grant insert (es_estimado, nota) on insumos to authenticated;
grant update (es_estimado, nota) on insumos to authenticated;

-- ---------------------------------------------------------------------
-- Plan de recuperación con desglose
-- monto_total = suma de sus conceptos (se recalcula solo al agregar,
-- editar o quitar un concepto, ej. cuando lleguen utensilios y uniformes).
-- inicia_en puede quedar vacío mientras se define: mientras tanto la cuota
-- se proyecta en todos los meses (para no subestimar el punto de equilibrio).
-- ---------------------------------------------------------------------
alter table planes_recuperacion drop constraint planes_recuperacion_monto_total_check;
alter table planes_recuperacion add constraint planes_recuperacion_monto_total_check check (monto_total >= 0);
alter table planes_recuperacion alter column monto_total set default 0;
alter table planes_recuperacion alter column inicia_en drop not null;

create table plan_recuperacion_items (
  id         bigint generated always as identity primary key,
  plan_id    bigint not null references planes_recuperacion (id) on delete cascade,
  concepto   text not null,
  monto      bigint not null check (monto > 0),
  creado_en  timestamptz not null default now()
);
create index on plan_recuperacion_items (plan_id);

create or replace function recalcular_monto_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update planes_recuperacion p
     set monto_total = coalesce((select sum(monto) from plan_recuperacion_items i where i.plan_id = p.id), 0)
   where p.id in (coalesce(new.plan_id, old.plan_id), coalesce(old.plan_id, new.plan_id));
  return null;
end $$;
create trigger plan_items_recalcular after insert or update or delete on plan_recuperacion_items
  for each row execute function recalcular_monto_plan();

create or replace function cuota_recuperacion(p_mes date default hoy_bogota()) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(monto_total::numeric / meses)), 0)::bigint
    from planes_recuperacion
   where monto_total > 0
     and (inicia_en is null
          or (date_trunc('month', p_mes) >= date_trunc('month', inicia_en)
              and date_trunc('month', p_mes) < date_trunc('month', inicia_en) + make_interval(months => meses)))
$$;

alter table plan_recuperacion_items enable row level security;
create policy plan_recuperacion_items_socios on plan_recuperacion_items for all to authenticated
  using (es_socio()) with check (es_socio());
revoke all on plan_recuperacion_items from anon;

-- Supabase da EXECUTE a authenticated en toda función nueva: se quita a las internas.
revoke execute on function _agregar_toppings(bigint, bigint, jsonb), recalcular_monto_plan()
  from public, anon, authenticated;
