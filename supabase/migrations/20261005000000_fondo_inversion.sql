-- =====================================================================
-- Fondo de inversión de los socios
--
-- * aportes_socios: aportes (entra plata al fondo) y devoluciones a socios.
--   El socio es opcional (ej. un préstamo de un tercero).
-- * Compras y gastos pueden pagarse "con el fondo" (pagado_con = 'fondo').
-- * Los intereses y costos financieros se registran como gasto pagado con
--   el fondo, en la categoría "Intereses y costos financieros".
-- * flujo_caja devuelve el saldo del fondo y sus movimientos.
-- =====================================================================

alter table aportes_socios
  alter column socio_id drop not null,
  add column tipo text not null default 'aporte' check (tipo in ('aporte', 'devolucion')),
  add column registrado_por uuid default auth.uid() references perfiles (id);

insert into categorias_gasto (nombre, tipo) values ('Intereses y costos financieros', 'inversion')
on conflict (nombre) do nothing;

-- 'fondo' como forma de pago de compras y gastos
alter table compras drop constraint if exists compras_pagado_con_check;
alter table compras add constraint compras_pagado_con_check
  check (pagado_con in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo'));
alter table gastos drop constraint if exists gastos_pagado_con_check;
alter table gastos add constraint gastos_pagado_con_check
  check (pagado_con in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo'));

-- registrar_compra valida la forma de pago: se permite 'fondo'
do $$
declare v_def text;
begin
  select pg_get_functiondef('registrar_compra(jsonb)'::regprocedure) into v_def;
  v_def := replace(v_def, $a$('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio')$a$,
                          $a$('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio', 'fondo')$a$);
  execute v_def;
end $$;

create or replace function _salidas(p_desde date, p_hasta date)
returns table (pagado_con text, compras bigint, gastos bigint)
language sql stable security definer set search_path = public as $$
  with f(pagado_con) as (values ('caja'), ('efectivo'), ('tarjeta'), ('transferencia'), ('socio'), ('fondo'), ('sin_registrar'))
  select f.pagado_con,
         coalesce((select sum(ci.costo_total) from compras c join compra_items ci on ci.compra_id = c.id
                    where coalesce(c.pagado_con, 'sin_registrar') = f.pagado_con
                      and c.fecha between p_desde and p_hasta), 0)::bigint,
         coalesce((select sum(g.monto) from gastos g
                    where coalesce(g.pagado_con, 'sin_registrar') = f.pagado_con
                      and not exists (select 1 from compras c where c.gasto_id = g.id)
                      and g.fecha between p_desde and p_hasta), 0)::bigint
    from f
$$;

create or replace function flujo_caja(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_ini timestamptz := p_desde::timestamp at time zone 'America/Bogota';
  v_fin timestamptz := (p_hasta + 1)::timestamp at time zone 'America/Bogota';
  v_turno turnos%rowtype;
  v_caja jsonb;
  v_ent jsonb; v_sal jsonb;
  v_ent_total jsonb; v_sal_total jsonb;
  v_bold bigint; v_nequi bigint; v_fondo bigint;
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;

  -- Caja del local ahora
  select * into v_turno from turnos where cerrado_en is null;
  if found then
    v_caja := _resumen_turno(v_turno, now());
    v_caja := jsonb_build_object('abierta', true, 'desde', v_turno.abierto_en, 'base', v_turno.base_inicial,
                                 'efectivo_ventas', v_caja -> 'efectivo', 'cobros', v_caja #> '{cobros_fiado,efectivo}',
                                 'retiros', v_caja -> 'retiros', 'monto', v_caja -> 'efectivo_esperado');
  else
    select jsonb_build_object('abierta', false, 'desde', t.cerrado_en, 'monto', t.efectivo_contado,
                              'cerrado_por', (select nombre from perfiles where id = t.cerrado_por))
      into v_caja
      from turnos t where t.cerrado_en is not null and t.efectivo_contado is not null
     order by t.cerrado_en desc limit 1;
  end if;

  -- Periodo
  select jsonb_object_agg(medio, jsonb_build_object('ventas', ventas, 'cobros', cobros, 'comisiones', comisiones))
    into v_ent from _entradas(v_ini, v_fin);
  select jsonb_object_agg(pagado_con, jsonb_build_object('compras', compras, 'gastos', gastos))
    into v_sal from _salidas(p_desde, p_hasta);

  -- Acumulado de siempre (para saldos)
  select jsonb_object_agg(medio, jsonb_build_object('ventas', ventas, 'cobros', cobros, 'comisiones', comisiones))
    into v_ent_total from _entradas('-infinity', 'infinity');
  select jsonb_object_agg(pagado_con, jsonb_build_object('compras', compras, 'gastos', gastos))
    into v_sal_total from _salidas('-infinity', 'infinity');

  v_bold := (v_ent_total #>> '{datafono,ventas}')::bigint + (v_ent_total #>> '{datafono,cobros}')::bigint
          - (v_ent_total #>> '{datafono,comisiones}')::bigint
          - (v_sal_total #>> '{tarjeta,compras}')::bigint - (v_sal_total #>> '{tarjeta,gastos}')::bigint
          + coalesce((select sum(monto) from ajustes_cuenta where cuenta = 'bold'), 0);
  v_nequi := (v_ent_total #>> '{nequi,ventas}')::bigint + (v_ent_total #>> '{nequi,cobros}')::bigint
           - (v_sal_total #>> '{transferencia,compras}')::bigint - (v_sal_total #>> '{transferencia,gastos}')::bigint
           + coalesce((select sum(monto) from ajustes_cuenta where cuenta = 'nequi'), 0);

  v_fondo := coalesce((select sum(case when tipo = 'devolucion' then -monto else monto end) from aportes_socios), 0)
           - (v_sal_total #>> '{fondo,compras}')::bigint - (v_sal_total #>> '{fondo,gastos}')::bigint;

  return jsonb_build_object(
    'fondo', jsonb_build_object(
      'saldo', v_fondo,
      'aportado', coalesce((select sum(monto) from aportes_socios where tipo = 'aporte'), 0),
      'devuelto', coalesce((select sum(monto) from aportes_socios where tipo = 'devolucion'), 0),
      'pagado', (v_sal_total #>> '{fondo,compras}')::bigint + (v_sal_total #>> '{fondo,gastos}')::bigint,
      'movimientos', coalesce((
        select jsonb_agg(m order by m ->> 'fecha' desc) from (
          select jsonb_build_object('id', a.id, 'fecha', a.fecha, 'tipo', a.tipo, 'monto', a.monto,
                                    'quien', coalesce(p.nombre, 'Sin socio'), 'nota', a.descripcion) as m
            from aportes_socios a left join perfiles p on p.id = a.socio_id
          union all
          select jsonb_build_object('fecha', c.fecha, 'tipo', 'pago', 'monto', sum(ci.costo_total),
                                    'quien', coalesce(c.proveedor, 'Compra'), 'nota', 'Compra de insumos')
            from compras c join compra_items ci on ci.compra_id = c.id
           where c.pagado_con = 'fondo' group by c.id
          union all
          select jsonb_build_object('fecha', g.fecha, 'tipo', 'pago', 'monto', g.monto,
                                    'quien', cg.nombre, 'nota', g.descripcion)
            from gastos g join categorias_gasto cg on cg.id = g.categoria_id
           where g.pagado_con = 'fondo' and not exists (select 1 from compras c where c.gasto_id = g.id)) x), '[]')),
    'caja_local', coalesce(v_caja, jsonb_build_object('abierta', false, 'monto', 0)),
    'bold', v_bold,
    'nequi', v_nequi,
    'disponible', coalesce((v_caja ->> 'monto')::bigint, 0) + v_bold + v_nequi + v_fondo,
    'entregado_socios', coalesce((
      select jsonb_agg(jsonb_build_object('tercero', tercero, 'monto', monto) order by monto desc)
        from (select r.tercero, sum(r.monto) as monto from retiros_caja r
               where r.anulado_en is null and r.motivo ilike '%socio%' group by r.tercero) x), '[]'),
    'puesto_por_socios', coalesce((
      select jsonb_agg(jsonb_build_object('socio', nombre, 'monto', monto) order by monto desc)
        from (select p.nombre, sum(x.monto) as monto
                from (select c.socio_id as socio, ci.costo_total as monto from compras c join compra_items ci on ci.compra_id = c.id
                       where c.pagado_con = 'socio'
                      union all
                      select g.pagado_por_socio, g.monto from gastos g
                       where g.pagado_con = 'socio' and not exists (select 1 from compras c where c.gasto_id = g.id)) x
                join perfiles p on p.id = x.socio group by p.nombre) y), '[]'),
    'fiado_por_cobrar', coalesce((select sum(total) from ventas where estado = 'completada'
                                   and metodo_pago::text = 'credito' and cobrada_en is null), 0),
    'periodo', jsonb_build_object(
      'entradas', v_ent,
      'salidas', v_sal,
      'retiros', coalesce((select jsonb_agg(jsonb_build_object('tercero', tercero, 'motivo', motivo, 'monto', monto, 'fecha', creado_en)
                                            order by creado_en desc)
                             from retiros_caja where anulado_en is null and creado_en >= v_ini and creado_en < v_fin), '[]'),
      'ajustes', coalesce((select jsonb_agg(jsonb_build_object('cuenta', cuenta, 'monto', monto, 'nota', nota, 'fecha', creado_en)
                                            order by creado_en desc)
                             from ajustes_cuenta where creado_en >= v_ini and creado_en < v_fin), '[]')));
end $$;

revoke execute on function _salidas(date, date) from public, anon, authenticated;
revoke execute on function flujo_caja(date, date) from public, anon;
grant execute on function flujo_caja(date, date), registrar_compra(jsonb) to authenticated;
