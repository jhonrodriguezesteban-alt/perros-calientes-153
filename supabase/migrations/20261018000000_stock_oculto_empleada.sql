-- =====================================================================
-- Inventario oculto para la empleada
--
-- insumos.stock_oculto: la empleada no ve cuánto queda de ese insumo (pan y
-- salchicha), pero sí le sale el aviso de "pedir" cuando está por debajo
-- del mínimo. Los socios siguen viendo todo. Se marca desde Inventario.
-- Se puede correr más de una vez.
-- =====================================================================

alter table insumos add column if not exists stock_oculto boolean not null default false;
grant insert (stock_oculto), update (stock_oculto) on insumos to authenticated;

update insumos set stock_oculto = true
 where nombre in ('Pan brioche', 'Salchicha americana') and not stock_oculto;

-- Insumos por debajo del mínimo (aviso en el POS). Sin cantidades si están ocultos.
create or replace function alertas_stock()
returns table (insumo_id bigint, nombre text, unidad unidad_medida, stock_actual numeric, stock_minimo numeric)
language sql stable security definer set search_path = public as $$
  select id, nombre, unidad,
         case when stock_oculto and not es_socio() then null else stock_actual end,
         case when stock_oculto and not es_socio() then null else stock_minimo end
    from insumos
   where rol_actual() is not null and activo and stock_actual <= stock_minimo
   order by stock_actual / nullif(stock_minimo, 0) nulls first, nombre
$$;

-- Lista para pedir insumos (POS). Sin cantidades si están ocultos; "bajo"
-- dice si ya hay que pedirlo.
drop function if exists insumos_para_pedido();
create function insumos_para_pedido()
returns table (insumo_id bigint, nombre text, unidad unidad_medida, stock_actual numeric, stock_minimo numeric, bajo boolean)
language sql stable security definer set search_path = public as $$
  select id, nombre, unidad,
         case when stock_oculto and not es_socio() then null else stock_actual end,
         case when stock_oculto and not es_socio() then null else stock_minimo end,
         stock_actual <= stock_minimo
    from insumos
   where rol_actual() is not null and activo
   order by nombre
$$;
revoke execute on function insumos_para_pedido() from public, anon;
grant execute on function insumos_para_pedido() to authenticated;

notify pgrst, 'reload schema';
