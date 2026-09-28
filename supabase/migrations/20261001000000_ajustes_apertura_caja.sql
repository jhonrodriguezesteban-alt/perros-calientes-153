-- =====================================================================
-- Corregir la apertura de caja
-- * corregir_base: cambiar la base del día abierto, por si se digitó mal
--   o la abrió otra persona. Antes de la primera venta o retiro puede
--   hacerlo cualquier usuario activo (ej. la empleada que llega y cuenta
--   la base); después, solo quien abrió la caja o un socio.
-- * deshacer_apertura: quitar una apertura hecha por error, solo si ese
--   día todavía no tiene ventas ni retiros.
-- =====================================================================

create or replace function corregir_base(p_base bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
begin
  if p_base is null or p_base < 0 then
    raise exception 'Escribe la base' using errcode = '22023';
  end if;
  select * into v_turno from turnos where cerrado_en is null for update;
  if not found then
    raise exception 'No hay caja abierta' using errcode = '22023';
  end if;
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if not (es_socio() or v_turno.abierto_por = auth.uid())
     and (exists (select 1 from ventas where turno_id = v_turno.id)
          or exists (select 1 from retiros_caja where turno_id = v_turno.id)) then
    raise exception 'Ya hay ventas en este día: solo quien abrió la caja o un socio puede cambiar la base' using errcode = '42501';
  end if;
  update turnos set base_inicial = p_base where id = v_turno.id;
end $$;

create or replace function deshacer_apertura() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
begin
  select * into v_turno from turnos where cerrado_en is null for update;
  if not found then
    raise exception 'No hay caja abierta' using errcode = '22023';
  end if;
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if exists (select 1 from ventas where turno_id = v_turno.id)
     or exists (select 1 from retiros_caja where turno_id = v_turno.id) then
    raise exception 'Ya hay ventas o retiros en este día: corrige la base en vez de deshacer la apertura' using errcode = '22023';
  end if;
  delete from turnos where id = v_turno.id;
end $$;

revoke execute on function corregir_base(bigint), deshacer_apertura() from public, anon;
grant execute on function corregir_base(bigint), deshacer_apertura() to authenticated;
