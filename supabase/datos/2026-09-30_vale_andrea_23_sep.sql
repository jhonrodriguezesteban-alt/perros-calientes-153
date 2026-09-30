-- =====================================================================
-- Vale de Andrea del 23-sep ($50.000) en el módulo de Nómina
--
-- Ese vale ya está como gasto (Finanzas · Nómina · "Vale Andrea (anticipo
-- de sueldo)"). Aquí solo se liga ese mismo gasto al módulo de Nómina, sin
-- crear otro egreso, para que aparezca en "Vales por descontar" y se
-- descuente en la próxima nómina de Andrea.
-- Se puede correr más de una vez: no lo duplica.
-- =====================================================================
with g as (
  select ga.id, ga.fecha, ga.monto
    from gastos ga join categorias_gasto cg on cg.id = ga.categoria_id
   where cg.nombre = 'Nómina' and ga.descripcion ilike 'Vale Andrea%' and ga.fecha = '2026-09-23'
   order by ga.creado_en limit 1
)
insert into pagos_personal (fecha, persona, tipo, monto, pagado_con, nota, gasto_id, registrado_por)
select g.fecha, 'Andrea', 'vale', g.monto, 'efectivo', 'Vale del primer día (ya estaba como gasto)', g.id,
       (select id from perfiles where rol = 'socio' and activo order by (nombre ilike 'Jhon%') desc limit 1)
  from g
 where not exists (select 1 from pagos_personal p where p.gasto_id = g.id);

-- El gasto queda con la misma forma de pago
update gastos set pagado_con = 'efectivo'
 where pagado_con is null
   and id in (select gasto_id from pagos_personal where persona = 'Andrea' and tipo = 'vale' and fecha = '2026-09-23');

-- Revisión: debe salir 1 vale de $50.000 por descontar
select fecha, persona, tipo, monto, descontado_en is null as por_descontar
  from pagos_personal where persona = 'Andrea' and tipo = 'vale' and anulado_en is null;
