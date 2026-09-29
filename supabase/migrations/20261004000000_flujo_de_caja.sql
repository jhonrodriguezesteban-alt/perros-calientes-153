-- =====================================================================
-- Flujo de caja
--
-- * Apertura: se guarda con cuánto quedó la caja en el último cierre
--   (base_esperada) para comparar con la base que se cuenta al abrir.
-- * corregir_cierre: un socio corrige un día ya cerrado (base, efectivo
--   contado, Bold, Nequi) y el cuadre se recalcula.
-- * Gastos con forma de pago (igual que las compras). Si se pagan con el
--   efectivo de la caja hoy, salen como retiro de la caja.
-- * ajustes_cuenta: saldo real de Bold / Nequi cuando no cuadra con lo
--   que calcula la app.
-- * flujo_caja(desde, hasta): entradas y salidas del periodo y dónde está
--   la plata hoy (caja del local, Bold, Nequi, socios).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Apertura con la base que dejó el último cierre
-- ---------------------------------------------------------------------
alter table turnos add column base_esperada bigint;

create or replace function abrir_turno(p_base_inicial bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if exists (select 1 from turnos where cerrado_en is null) then
    raise exception 'Ya hay un turno abierto' using errcode = '22023';
  end if;
  insert into turnos (base_inicial, base_esperada)
  values (coalesce(p_base_inicial, 0),
          (select efectivo_contado from turnos where cerrado_en is not null and efectivo_contado is not null
            order by cerrado_en desc limit 1))
  returning id into v_id;
  return v_id;
end $$;

-- Lo que quedó en la caja al cerrar el último día (lo ve cualquier usuario:
-- es lo que la empleada contó).
create or replace function ultimo_cierre_caja()
returns table (cerrado_en timestamptz, efectivo_contado bigint, cerrado_por text)
language sql stable security definer set search_path = public as $$
  select t.cerrado_en, t.efectivo_contado, p.nombre
    from turnos t left join perfiles p on p.id = t.cerrado_por
   where rol_actual() is not null and t.cerrado_en is not null and t.efectivo_contado is not null
   order by t.cerrado_en desc
   limit 1
$$;

-- ---------------------------------------------------------------------
-- Corregir un día ya cerrado (socios)
-- ---------------------------------------------------------------------
create or replace function corregir_cierre(p_turno_id uuid, p_base bigint, p_efectivo_contado bigint,
                                           p_bold bigint, p_nequi bigint, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  t turnos%rowtype;
  v_esperado bigint;
  v_bancos bigint;
  v_quien text;
begin
  if not es_socio() then
    raise exception 'Solo un socio puede corregir un cierre' using errcode = '42501';
  end if;
  if coalesce(trim(p_nota), '') = '' then
    raise exception 'Escribe por qué se corrige el cierre' using errcode = '22023';
  end if;
  if p_base < 0 or p_efectivo_contado < 0 or p_bold < 0 or p_nequi < 0 then
    raise exception 'Los valores no pueden ser negativos' using errcode = '22023';
  end if;
  select * into t from turnos where id = p_turno_id for update;
  if not found or t.cerrado_en is null then
    raise exception 'Ese día no está cerrado' using errcode = '22023';
  end if;

  v_esperado := p_base + coalesce(t.ventas_efectivo, 0) - coalesce(t.retiros, 0);
  v_bancos := p_bold + p_nequi;
  select nombre into v_quien from perfiles where id = auth.uid();

  update turnos
     set base_inicial = p_base,
         efectivo_esperado = v_esperado,
         efectivo_contado = p_efectivo_contado,
         bancos_declarado = v_bancos,
         notas_cierre = concat_ws(' · ', nullif(notas_cierre, ''), 'Corregido por ' || v_quien || ': ' || trim(p_nota)),
         resumen = case when resumen is null then null else resumen || jsonb_build_object(
           'base_inicial', p_base,
           'efectivo_esperado', v_esperado,
           'efectivo_contado', p_efectivo_contado,
           'diferencia_efectivo', p_efectivo_contado - v_esperado,
           'bold_declarado', p_bold,
           'nequi_declarado', p_nequi,
           'bancos_declarado', v_bancos,
           'diferencia_bancos', v_bancos - coalesce((resumen ->> 'bancos_esperado')::bigint, 0),
           'notas', concat_ws(' · ', nullif(resumen ->> 'notas', ''), 'Corregido por ' || v_quien || ': ' || trim(p_nota)))
         end
   where id = p_turno_id;
end $$;

-- ---------------------------------------------------------------------
-- Gastos con forma de pago
-- ---------------------------------------------------------------------
alter table gastos
  add column pagado_con text check (pagado_con in ('caja', 'efectivo', 'tarjeta', 'transferencia', 'socio')),
  add column pagado_por_socio uuid references perfiles (id),
  add column retiro_id uuid references retiros_caja (id),
  add constraint gastos_socio_si_presto check (pagado_con is distinct from 'socio' or pagado_por_socio is not null);

grant insert (pagado_con, pagado_por_socio), update (pagado_con, pagado_por_socio) on gastos to authenticated;

-- Gasto pagado con el efectivo de la caja hoy → sale de la caja como retiro
create or replace function gasto_desde_caja() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
  v_retiro uuid;
begin
  if new.pagado_con = 'caja' and new.fecha = hoy_bogota() and new.retiro_id is null then
    v_turno := _turno_abierto_o_nuevo();
    insert into retiros_caja (turno_id, monto, tercero, motivo, registrado_por)
    values (v_turno.id, new.monto, coalesce(nullif(trim(new.descripcion), ''), 'Gasto'),
            'Gasto: ' || (select nombre from categorias_gasto where id = new.categoria_id), new.registrado_por)
    returning id into v_retiro;
    new.retiro_id := v_retiro;
  end if;
  return new;
end $$;

create trigger gastos_desde_caja before insert on gastos
  for each row execute function gasto_desde_caja();

-- ---------------------------------------------------------------------
-- Saldo real de las cuentas (Bold, Nequi)
-- ---------------------------------------------------------------------
create table ajustes_cuenta (
  id              uuid primary key default gen_random_uuid(),
  cuenta          text not null check (cuenta in ('bold', 'nequi')),
  monto           bigint not null,
  nota            text,
  registrado_por  uuid not null default auth.uid() references perfiles (id),
  creado_en       timestamptz not null default now()
);
alter table ajustes_cuenta enable row level security;
create policy ajustes_cuenta_socios on ajustes_cuenta for select to authenticated using (es_socio());
grant select on ajustes_cuenta to authenticated;
revoke insert, update, delete on ajustes_cuenta from authenticated;
revoke all on ajustes_cuenta from anon;

-- ---------------------------------------------------------------------
-- Cálculos de flujo
-- ---------------------------------------------------------------------
-- Cuánto entró por cada medio (ventas pagadas + fiado cobrado) en un rango
create or replace function _entradas(p_desde timestamptz, p_hasta timestamptz)
returns table (medio text, ventas bigint, cobros bigint, comisiones bigint)
language sql stable security definer set search_path = public as $$
  with m(medio) as (values ('efectivo'), ('datafono'), ('nequi'))
  select m.medio,
         coalesce((select sum(p.monto) from venta_pagos p join ventas v on v.id = p.venta_id
                    where v.estado = 'completada' and p.metodo::text = m.medio
                      and v.vendida_en >= p_desde and v.vendida_en < p_hasta), 0)::bigint,
         coalesce((select sum(v.total) from ventas v
                    where v.estado = 'completada' and v.cobrada_metodo::text = m.medio
                      and v.cobrada_en >= p_desde and v.cobrada_en < p_hasta), 0)::bigint,
         case when m.medio = 'datafono' then
           coalesce((select sum(v.comision_datafono) from ventas v
                      where v.estado = 'completada'
                        and ((v.metodo_pago::text <> 'credito' and v.vendida_en >= p_desde and v.vendida_en < p_hasta)
                          or (v.cobrada_metodo::text = 'datafono' and v.cobrada_en >= p_desde and v.cobrada_en < p_hasta))), 0)
         else 0 end::bigint
    from m
$$;

-- Salidas (compras + gastos que no son de compras) por forma de pago
create or replace function _salidas(p_desde date, p_hasta date)
returns table (pagado_con text, compras bigint, gastos bigint)
language sql stable security definer set search_path = public as $$
  with f(pagado_con) as (values ('caja'), ('efectivo'), ('tarjeta'), ('transferencia'), ('socio'), ('sin_registrar'))
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
  v_bold bigint; v_nequi bigint;
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

  return jsonb_build_object(
    'caja_local', coalesce(v_caja, jsonb_build_object('abierta', false, 'monto', 0)),
    'bold', v_bold,
    'nequi', v_nequi,
    'disponible', coalesce((v_caja ->> 'monto')::bigint, 0) + v_bold + v_nequi,
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

-- Ajustar el saldo real de Bold o Nequi: guarda la diferencia con lo calculado
create or replace function ajustar_saldo_cuenta(p_cuenta text, p_saldo_real bigint, p_nota text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_actual bigint;
  v_dif bigint;
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;
  if p_cuenta not in ('bold', 'nequi') then
    raise exception 'Cuenta inválida' using errcode = '22023';
  end if;
  v_actual := (flujo_caja(hoy_bogota(), hoy_bogota()) ->> p_cuenta)::bigint;
  v_dif := p_saldo_real - v_actual;
  if v_dif <> 0 then
    insert into ajustes_cuenta (cuenta, monto, nota) values (p_cuenta, v_dif, nullif(trim(p_nota), ''));
  end if;
  return v_dif;
end $$;

revoke execute on function _entradas(timestamptz, timestamptz), _salidas(date, date), gasto_desde_caja()
  from public, anon, authenticated;
revoke execute on function ultimo_cierre_caja(), corregir_cierre(uuid, bigint, bigint, bigint, bigint, text),
                           flujo_caja(date, date), ajustar_saldo_cuenta(text, bigint, text)
  from public, anon;
grant execute on function abrir_turno(bigint), ultimo_cierre_caja(), corregir_cierre(uuid, bigint, bigint, bigint, bigint, text),
                          flujo_caja(date, date), ajustar_saldo_cuenta(text, bigint, text)
  to authenticated;
