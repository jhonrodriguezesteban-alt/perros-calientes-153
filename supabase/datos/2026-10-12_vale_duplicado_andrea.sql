-- Vale de $400.000 del 10-oct que Andrea registró al sacar la plata y que duplicaba los
-- pagos de nómina que registraron los socios ese día. Se puede correr más de una vez.
do $$
declare
  v_vale     pagos_personal%rowtype;
  v_cubierto bigint;
  v_turno    uuid;
begin
  -- El vale de $400.000 que Andrea registró al sacar la plata (10 de oct)
  select * into v_vale from pagos_personal
   where persona = 'Andrea' and tipo = 'vale' and monto = 400000 and fecha = '2026-10-10' and anulado_en is null
   order by creado_en desc limit 1;
  if not found then
    raise notice 'No hay vale de $400.000 del 10 de oct sin anular: ya estaba corregido';
    return;
  end if;

  -- ¿Los pagos que registraron los socios ese día con "efectivo de la caja" ya sacaron su plata de la caja?
  select coalesce(sum(rc.monto), 0) into v_cubierto
    from pagos_personal pp
    left join gastos g on g.id = pp.gasto_id
    join retiros_caja rc on rc.id = coalesce(pp.retiro_id, g.retiro_id) and rc.anulado_en is null
   where pp.persona = 'Andrea' and pp.tipo = 'nomina' and pp.pagado_con = 'caja'
     and pp.fecha = '2026-10-10' and pp.anulado_en is null and pp.id <> v_vale.id;

  -- El vale sobra en la nómina: se anula y su gasto se borra
  update pagos_personal set anulado_en = now(), gasto_id = null,
         nota = concat_ws(' · ', nota, 'Anulado: duplicaba los pagos de nómina del 10 de oct')
   where id = v_vale.id;
  delete from gastos where id = v_vale.gasto_id;

  if v_vale.retiro_id is not null then
    select turno_id into v_turno from retiros_caja where id = v_vale.retiro_id;
    if v_cubierto >= v_vale.monto then
      -- Los pagos ya descontaron la plata de la caja: el retiro de Andrea era repetido
      update retiros_caja set anulado_en = now() where id = v_vale.retiro_id and anulado_en is null;
      raise notice 'Retiro repetido de $400.000 anulado; la caja del 10 de oct se recalcula';
    else
      -- Los pagos no sacaron plata de la caja: el retiro de Andrea es la salida real; queda como pago de nómina
      update retiros_caja set sin_gasto_motivo = 'Pago de nómina a Andrea del 10 de oct (registrado en Nómina)'
       where id = v_vale.retiro_id;
      raise notice 'El retiro de Andrea queda como la salida real de los pagos de nómina (la caja no cambia)';
    end if;
    perform _recalcular_cierre(v_turno);
  end if;
end $$;

-- Revisión: pagos de Andrea desde octubre y retiros del 10 de oct
select fecha, tipo, monto, pagado_con, case when anulado_en is null then '' else 'ANULADO' end as estado, semana
  from pagos_personal where persona = 'Andrea' and fecha >= '2026-09-23' order by fecha, creado_en;
select to_char(creado_en at time zone 'America/Bogota', 'DD Mon HH24:MI') as hora, tercero, motivo, monto,
       case when anulado_en is null then '' else 'ANULADO' end as estado
  from retiros_caja where (creado_en at time zone 'America/Bogota')::date = '2026-10-10' order by creado_en;
