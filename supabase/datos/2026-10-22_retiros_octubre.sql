-- Retiros de caja de octubre que faltaban por registrar. Se puede correr más de una vez.
do $$
declare
  v_socio uuid := coalesce((select id from auth.users where email = 'jhonrodriguezesteban@gmail.com'),
                           (select id from perfiles where rol = 'socio' and activo order by nombre limit 1));
  v_r     uuid;
begin
  perform set_config('request.jwt.claim.sub', v_socio::text, true);
  insert into categorias_gasto (nombre, tipo) values ('Seguridad', 'variable') on conflict (nombre) do nothing;

  -- 1-oct · $20.000 · pago de seguridad (lo entregó Jhon)
  select id into v_r from retiros_caja
   where anulado_en is null and monto = 20000 and tercero ilike '%seguridad%'
     and (creado_en at time zone 'America/Bogota')::date = '2026-10-01'
   order by creado_en limit 1;
  if v_r is not null and _registro_de_retiro(v_r) is null then
    perform registrar_gasto_de_retiro(v_r, (select id from categorias_gasto where nombre = 'Seguridad'),
                                      'Pago de seguridad (vigilancia) · lo entregó Jhon', 20000);
    raise notice 'Seguridad $20.000 registrada';
  end if;

  -- 2-oct · $30.000 · servilletas y botellones de agua
  v_r := null;
  select id into v_r from retiros_caja
   where anulado_en is null and monto = 30000 and (tercero ilike '%servilleta%' or motivo ilike '%servilleta%')
     and (creado_en at time zone 'America/Bogota')::date = '2026-10-02'
   order by creado_en limit 1;
  if v_r is not null and _registro_de_retiro(v_r) is null then
    perform registrar_gasto_de_retiro(v_r, (select id from categorias_gasto where nombre = 'Insumos'),
                                      'Servilletas y botellones de agua', 30000);
    raise notice 'Servilletas y botellones $30.000 registrados';
  end if;
end $$;

-- Retiros de octubre que siguen sin registrar (debería salir vacío)
select to_char(creado_en at time zone 'America/Bogota', 'DD Mon') as fecha, tercero, motivo, monto
  from retiros_caja r
 where anulado_en is null and creado_en >= '2026-10-01T00:00:00-05:00' and _registro_de_retiro(r.id) is null;
