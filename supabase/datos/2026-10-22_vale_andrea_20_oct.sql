-- Vale de $200.000 del 20-oct: primero cancela el saldo de la primera nómina (23 al 30 de sept)
-- y el resto va a la semana del 12 al 17 de oct. Se puede correr más de una vez.
do $$
declare
  v_vale  pagos_personal%rowtype;
  v_pend  bigint;
begin
  select * into v_vale from pagos_personal
   where persona = 'Andrea' and tipo = 'vale' and fecha = '2026-10-20' and anulado_en is null
     and monto = 200000 and semana is distinct from '2026-10-12'
   order by creado_en limit 1;
  if not found then
    raise notice 'El vale del 20 de oct ya estaba repartido (o no existe)';
    return;
  end if;

  -- Lo que falta de la primera nómina ($583.800 menos vales y pagos)
  select 583800 - coalesce(sum(monto), 0) into v_pend
    from pagos_personal where persona = 'Andrea' and semana = '2026-09-23' and anulado_en is null;
  v_pend := least(greatest(v_pend, 0), v_vale.monto);

  if v_pend > 0 then
    insert into pagos_personal (fecha, persona, tipo, monto, pagado_con, nota, retiro_id, semana, creado_en, registrado_por)
    values (v_vale.fecha, 'Andrea', 'vale', v_pend, v_vale.pagado_con,
            'Parte del vale del 20-oct: cancela la primera nómina', v_vale.retiro_id, '2026-09-23', v_vale.creado_en, v_vale.registrado_por);
  end if;
  update pagos_personal
     set monto = v_vale.monto - v_pend, semana = '2026-10-12',
         nota = concat_ws(' · ', nota, 'Va a la semana del 12 al 17 de oct')
   where id = v_vale.id;
  raise notice 'Primera nómina: % · semana 12–17 oct: %', v_pend, v_vale.monto - v_pend;
end $$;

-- Revisión: lo que falta en cada periodo
select semana as periodo,
       case semana when '2026-09-23' then 583800 end as acordado,
       sum(monto) filter (where tipo = 'vale')   as vales,
       sum(monto) filter (where tipo = 'nomina') as pagos
  from pagos_personal
 where persona = 'Andrea' and anulado_en is null and semana in ('2026-09-23', '2026-10-12', '2026-10-19')
 group by semana order by semana;
