-- =====================================================================
-- Bebidas ocultas a la empleada
--
-- Gaseosas y aguas (familia "bebidas"): la empleada no ve cuántas quedan,
-- solo el aviso de pedir. Las bebidas nuevas quedan ocultas solas.
-- Se cambia por insumo en Inventario → Editar mínimos.
-- Requiere 20261018000000_stock_oculto_empleada.sql. Se puede correr más de una vez.
-- =====================================================================

update insumos set stock_oculto = true where familia = 'bebidas' and not stock_oculto;

create or replace function insumo_bebida_oculta() returns trigger
language plpgsql as $$
begin
  if new.familia = 'bebidas' then
    new.stock_oculto := true;
  end if;
  return new;
end $$;

drop trigger if exists insumos_bebida_oculta on insumos;
create trigger insumos_bebida_oculta before insert on insumos
  for each row execute function insumo_bebida_oculta();
