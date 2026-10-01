-- Nómina (Andrea) $2.500.000 y arriendo $1.000.000 al mes, desde septiembre.
-- Se puede correr más de una vez.
insert into parametros (clave, vigente_desde, valor, descripcion) values
  ('nomina_mensual',   '2026-09-01', 2500000, 'Nómina mensual (Andrea)'),
  ('arriendo_mensual', '2026-09-01', 1000000, 'Arriendo mensual')
on conflict (clave, vigente_desde) do update set valor = excluded.valor, descripcion = excluded.descripcion;
update parametros set valor = 2500000 where clave = 'nomina_mensual'   and vigente_desde > '2026-09-01';
update parametros set valor = 1000000 where clave = 'arriendo_mensual' and vigente_desde > '2026-09-01';

select clave, vigente_desde, valor from parametros
 where clave in ('nomina_mensual', 'arriendo_mensual', 'intereses_prestamo_mensual')
 order by clave, vigente_desde;
