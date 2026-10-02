-- =====================================================================
-- Punto de equilibrio con los últimos 30 días
--
-- El precio promedio, el costo de materia prima por perro, la mezcla de
-- pagos (Bold) y el % de ventas con bebida salen de los últimos 30 días de
-- ventas (hasta el fin del mes consultado o hasta hoy), no solo del mes:
-- así el 1.º de cada mes no depende de un solo día de ventas.
-- El margen acumulado y los perros vendidos siguen siendo los del mes.
-- Reemplaza _punto_equilibrio_base (punto_equilibrio le suma intereses,
-- luz e internet). Se puede correr más de una vez.
-- =====================================================================

create or replace function _punto_equilibrio_base(p_mes date default hoy_bogota()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde        timestamptz := (date_trunc('month', p_mes)::date)::timestamp at time zone 'America/Bogota';
  v_hasta        timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::date)::timestamp at time zone 'America/Bogota';
  v_fecha        date := least(p_mes, hoy_bogota());
  -- Precio, costo por perro y mezcla de ventas: últimos 30 días hasta el fin
  -- del mes (o hasta hoy), para que no dependan de pocos días de ventas.
  v_fin          timestamptz := least(v_hasta, now());
  v_ini          timestamptz := least(v_hasta, now()) - interval '30 days';
  v_perros_mes   bigint;
  v_merma        numeric := coalesce(parametro('merma_pct', v_fecha), 0) / 100;
  v_comision     numeric := coalesce(parametro('comision_datafono_pct', v_fecha), 0) / 100;
  v_dias         numeric := coalesce(parametro('dias_operacion_mes', v_fecha), 30);
  v_nomina       bigint  := coalesce(parametro('nomina_mensual', v_fecha), 0);
  v_arriendo     bigint  := coalesce(parametro('arriendo_mensual', v_fecha), 0);
  v_cuota        bigint  := cuota_recuperacion(p_mes);
  v_fijos        bigint;
  v_precio       numeric; v_insumos numeric; v_perros bigint;
  v_precio_beb   numeric; v_costo_beb numeric;
  v_pct_datafono numeric; v_pct_bebida numeric;
  v_ventas_mes   bigint;
  v_costo_perro  numeric; v_margen_perro numeric; v_margen_beb numeric; v_margen numeric;
  v_pe_mes       numeric;
  v_margen_real  numeric;
  v_fuente       text := 'ventas_reales';
begin
  if not es_socio() then
    raise exception 'Solo socios' using errcode = '42501';
  end if;

  -- Perros vendidos en el mes
  select sum(vi.cantidad), sum((vi.precio_unitario + vi.extras_unitario) * vi.cantidad)::numeric / nullif(sum(vi.cantidad), 0),
         sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)
    into v_perros, v_precio, v_insumos
    from venta_items vi join ventas v on v.id = vi.venta_id
   where v.estado = 'completada' and v.vendida_en >= v_ini and v.vendida_en < v_fin
     and vi.tipo_producto = 'perro';

  select coalesce(sum(vi.cantidad), 0) into v_perros_mes
    from venta_items vi join ventas v on v.id = vi.venta_id
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta
     and vi.tipo_producto = 'perro';

  if coalesce(v_perros, 0) = 0 then
    v_fuente := 'catalogo_y_parametros';
    select avg(p.precio), avg(costo_catalogo(p.id)) into v_precio, v_insumos
      from productos p where p.activo and p.tipo = 'perro';
  end if;

  -- Bebidas
  select sum(vi.subtotal)::numeric / nullif(sum(vi.cantidad), 0),
         sum(vi.costo_unitario * vi.cantidad) / nullif(sum(vi.cantidad), 0)
    into v_precio_beb, v_costo_beb
    from venta_items vi join ventas v on v.id = vi.venta_id
   where v.estado = 'completada' and v.vendida_en >= v_ini and v.vendida_en < v_fin
     and vi.tipo_producto = 'bebida';
  if v_precio_beb is null then
    select avg(p.precio), avg(costo_catalogo(p.id)) into v_precio_beb, v_costo_beb
      from productos p where p.activo and p.tipo = 'bebida';
  end if;

  -- Mezcla de pagos y tasa de adjunción del mes
  select count(*),
         sum((select coalesce(sum(p.monto), 0) from venta_pagos p where p.venta_id = v.id and p.metodo::text = 'datafono'))::numeric
           / nullif(sum(total), 0),
         count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'bebida'))::numeric
           / nullif(count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'perro')), 0)
    into v_ventas_mes, v_pct_datafono, v_pct_bebida
    from ventas v
   where v.estado = 'completada' and v.vendida_en >= v_ini and v.vendida_en < v_fin;

  if coalesce(v_ventas_mes, 0) = 0 then
    v_pct_datafono := coalesce(parametro('pct_ventas_datafono_estimado', v_fecha), 0) / 100;
    v_pct_bebida   := coalesce(parametro('tasa_adjuncion_estimada', v_fecha), 0) / 100;
  end if;
  v_pct_datafono := coalesce(v_pct_datafono, 0);
  v_pct_bebida   := least(coalesce(v_pct_bebida, 0), 1);

  v_costo_perro  := coalesce(v_insumos, 0) * (1 + v_merma) + coalesce(v_precio, 0) * v_comision * v_pct_datafono;
  v_margen_perro := coalesce(v_precio, 0) - v_costo_perro;
  v_margen_beb   := (coalesce(v_precio_beb, 0) - coalesce(v_costo_beb, 0)) * v_pct_bebida;
  v_margen       := v_margen_perro + v_margen_beb;
  v_fijos        := v_nomina + v_arriendo + v_cuota;
  v_pe_mes       := case when v_margen > 0 then v_fijos / v_margen end;

  -- Margen de contribución real acumulado en el mes (para comparar con los fijos)
  select coalesce(sum(v.total - v.costo_insumos * (1 + v_merma) - v.comision_datafono), 0)
    into v_margen_real
    from ventas v
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta;

  return jsonb_build_object(
    'mes',                        to_char(p_mes, 'YYYY-MM'),
    'fuente',                     v_fuente,
    'precio_perro',               round(coalesce(v_precio, 0)),
    'insumos_por_perro',          round(coalesce(v_insumos, 0)),
    'costo_por_perro',            round(v_costo_perro),
    'margen_por_perro',           round(v_margen_perro),
    'margen_bebida_por_perro',    round(v_margen_beb),
    'margen_combinado_por_perro', round(v_margen),
    'pct_datafono',               round(v_pct_datafono * 100, 1),
    'tasa_adjuncion',             round(v_pct_bebida * 100, 1),
    'merma_pct',                  round(v_merma * 100, 2),
    'comision_datafono_pct',      round(v_comision * 100, 2),
    'nomina',                     v_nomina,
    'arriendo',                   v_arriendo,
    'cuota_recuperacion',         v_cuota,
    'costos_fijos',               v_fijos,
    'pe_unidades_mes',            ceil(v_pe_mes),
    'pe_unidades_dia',            ceil(v_pe_mes / nullif(v_dias, 0)),
    'pe_pesos_mes',               round(ceil(v_pe_mes) * coalesce(v_precio, 0)),
    'perros_vendidos_mes',        v_perros_mes,
    'perros_ventana',             coalesce(v_perros, 0),
    'ventana_desde',              (v_ini at time zone 'America/Bogota')::date,
    'margen_contribucion_mes',    round(v_margen_real),
    'avance_pct',                 round(100 * v_margen_real / nullif(v_fijos, 0), 1)
  );
end $$;


revoke execute on function _punto_equilibrio_base(date) from public, anon, authenticated;
