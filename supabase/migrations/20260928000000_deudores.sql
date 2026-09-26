-- =====================================================================
-- Deudores: cobrar todo lo que debe una persona y corregir/unir nombres
-- (una persona se agrupa por su nombre, sin distinguir mayúsculas ni
-- espacios de sobra).
-- =====================================================================

-- Cobra de una vez todas las ventas fiadas pendientes de una persona.
-- Devuelve cuántas ventas quedaron pagadas y el total.
create or replace function cobrar_cliente(p_cliente text, p_metodo text)
returns table (ventas int, total bigint)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_ids uuid[];
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_metodo not in ('efectivo', 'datafono', 'nequi') then
    raise exception 'Método de pago inválido' using errcode = '22023';
  end if;

  select array_agg(id) into v_ids
    from ventas
   where metodo_pago::text = 'credito' and estado = 'completada' and cobrada_en is null
     and lower(trim(cliente)) = lower(trim(p_cliente));
  if v_ids is null then
    raise exception 'Esa persona no tiene deudas pendientes' using errcode = '22023';
  end if;

  update ventas
     set cobrada_en = now(),
         cobrada_metodo = p_metodo::metodo_pago,
         cobrada_por = auth.uid(),
         comision_datafono = case when p_metodo = 'datafono'
           then round(total * coalesce(parametro('comision_datafono_pct'), 0) / 100) else 0 end
   where id = any (v_ids);

  return query select cardinality(v_ids), (select sum(v.total)::bigint from ventas v where v.id = any (v_ids));
end $$;

-- Cambia el nombre de un deudor en todas sus ventas (sirve para unir
-- "Sebas" con "Sebastián Estupiñán"). Solo socios.
create or replace function renombrar_deudor(p_actual text, p_nuevo text) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_n int;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede cambiar nombres de deudores' using errcode = '42501';
  end if;
  if coalesce(trim(p_nuevo), '') = '' then
    raise exception 'Escribe el nombre nuevo' using errcode = '22023';
  end if;
  update ventas set cliente = trim(p_nuevo)
   where metodo_pago::text = 'credito' and lower(trim(cliente)) = lower(trim(p_actual));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function cobrar_cliente(text, text), renombrar_deudor(text, text) from public, anon;
grant execute on function cobrar_cliente(text, text), renombrar_deudor(text, text) to authenticated;
