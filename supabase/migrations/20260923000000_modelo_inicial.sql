-- =====================================================================
-- Bendito Perro Caliente — modelo de datos inicial
-- POS + inventario + gastos + caja + dashboard de socios
--
-- Convenciones:
--   * Dinero en pesos colombianos enteros (bigint). Nada de decimales en COP.
--   * Cantidades de insumo en la unidad base del insumo (g, ml, und), numeric.
--   * Costos unitarios de insumo en COP por unidad base, numeric (ej. 18.5 COP/g).
--   * Fechas como timestamptz; los reportes agrupan en 'America/Bogota'.
--   * Los precios y costos de cada venta se guardan como "foto" (snapshot):
--     si mañana cambia el precio o el costo del queso, las ventas viejas
--     conservan su margen real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type rol_usuario      as enum ('empleado', 'socio');
create type unidad_medida    as enum ('g', 'ml', 'und');
create type tipo_producto    as enum ('perro', 'bebida', 'acompanamiento');
create type metodo_pago      as enum ('efectivo', 'datafono');
create type estado_venta     as enum ('completada', 'anulada');
create type tipo_movimiento  as enum ('inicial', 'compra', 'consumo_venta', 'reverso_venta', 'ajuste', 'merma');
create type tipo_gasto       as enum ('fijo', 'variable', 'inversion');
create type origen_costo     as enum ('compra', 'manual');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function set_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

create or replace function hoy_bogota() returns date
language sql stable as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- ---------------------------------------------------------------------
-- Usuarios y roles
-- Un perfil por usuario de Supabase Auth, con el rol en la misma tabla.
-- ---------------------------------------------------------------------
create table perfiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  nombre          text not null,
  rol             rol_usuario not null default 'empleado',
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create trigger perfiles_actualizado before update on perfiles
  for each row execute function set_actualizado_en();

-- Crea el perfil automáticamente cuando se crea un usuario en Auth.
-- Siempre nace como 'empleado'; un socio lo promueve si hace falta.
create or replace function crear_perfil_nuevo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function crear_perfil_nuevo_usuario();

create or replace function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

create or replace function es_socio() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() = 'socio', false)
$$;

-- ---------------------------------------------------------------------
-- Catálogo de venta (lo ve el POS)
-- La bebida se vende como línea adicional de la misma venta; no hay combos.
-- ---------------------------------------------------------------------
create table categorias (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  orden   int  not null default 0,
  activo  boolean not null default true
);

create table productos (
  id              bigint generated always as identity primary key,
  categoria_id    bigint not null references categorias (id),
  nombre          text not null unique,
  descripcion     text,
  tipo            tipo_producto not null,
  precio          bigint not null check (precio >= 0),
  imagen_url      text,
  orden           int not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create trigger productos_actualizado before update on productos
  for each row execute function set_actualizado_en();

create table toppings (
  id          bigint generated always as identity primary key,
  nombre      text not null unique,
  es_premium  boolean not null default false,
  orden       int not null default 0,
  activo      boolean not null default true
);

-- Qué toppings ofrece cada producto, si vienen premarcados en el POS
-- y cuánto cuestan de más en ESE producto (0 = incluido en el precio).
create table producto_toppings (
  producto_id          bigint not null references productos (id) on delete cascade,
  topping_id           bigint not null references toppings (id) on delete cascade,
  incluido_por_defecto boolean not null default false,
  precio_extra         bigint not null default 0 check (precio_extra >= 0),
  primary key (producto_id, topping_id)
);

-- ---------------------------------------------------------------------
-- Inventario (solo socios)
-- ---------------------------------------------------------------------
create table insumos (
  id              bigint generated always as identity primary key,
  nombre          text not null unique,
  unidad          unidad_medida not null,
  costo_unitario  numeric(14,4) not null default 0 check (costo_unitario >= 0),
  stock_actual    numeric(14,3) not null default 0,   -- lo mantiene un trigger; puede quedar negativo
  stock_minimo    numeric(14,3) not null default 0,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create trigger insumos_actualizado before update on insumos
  for each row execute function set_actualizado_en();

-- Receta base de un producto (pan, salchicha, bandeja...)
create table receta_items (
  producto_id  bigint not null references productos (id) on delete cascade,
  insumo_id    bigint not null references insumos (id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  primary key (producto_id, insumo_id)
);

-- Lo que consume una porción de cada topping (ej. queso = 20 g de queso)
create table topping_insumos (
  topping_id  bigint not null references toppings (id) on delete cascade,
  insumo_id   bigint not null references insumos (id),
  cantidad    numeric(14,3) not null check (cantidad > 0),
  primary key (topping_id, insumo_id)
);

-- Auditoría de cada cambio de costo de un insumo (compra o ajuste manual).
create table historial_costos (
  id              bigint generated always as identity primary key,
  insumo_id       bigint not null references insumos (id),
  costo_anterior  numeric(14,4) not null,
  costo_nuevo     numeric(14,4) not null,
  origen          origen_costo not null,
  motivo          text,
  cambiado_por    uuid default auth.uid() references perfiles (id),
  cambiado_en     timestamptz not null default now()
);
create index on historial_costos (insumo_id, cambiado_en);

-- El costo solo cambia por una compra (promedio ponderado) o por
-- ajustar_costo_insumo() con motivo. Un UPDATE directo se rechaza.
create or replace function auditar_costo_insumo() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_origen text := nullif(current_setting('bpc.origen_costo', true), '');
begin
  if new.costo_unitario is distinct from old.costo_unitario then
    if v_origen is null then
      raise exception 'El costo se cambia registrando una compra o con ajustar_costo_insumo (con motivo)'
        using errcode = '42501';
    end if;
    insert into historial_costos (insumo_id, costo_anterior, costo_nuevo, origen, motivo)
    values (new.id, old.costo_unitario, new.costo_unitario, v_origen::origen_costo,
            nullif(current_setting('bpc.motivo_costo', true), ''));
  end if;
  return new;
end $$;
create trigger insumos_auditar_costo before update of costo_unitario on insumos
  for each row execute function auditar_costo_insumo();

-- ---------------------------------------------------------------------
-- Gastos, compras e inversión (solo socios)
-- ---------------------------------------------------------------------
create table categorias_gasto (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  tipo    tipo_gasto not null,
  activo  boolean not null default true
);

create table gastos (
  id                 uuid primary key default gen_random_uuid(),
  fecha              date not null default hoy_bogota(),
  categoria_id       bigint not null references categorias_gasto (id),
  monto              bigint not null check (monto > 0),
  descripcion        text,
  -- Para cuotas de recuperación de inversión: a qué socio se le pagó
  socio_id           uuid references perfiles (id),
  comprobante_path   text,               -- archivo en Supabase Storage
  registrado_por     uuid not null default auth.uid() references perfiles (id),
  creado_en          timestamptz not null default now()
);
create index on gastos (fecha);

-- Compras de insumos: entran al inventario y (opcionalmente) se ligan al gasto.
create table compras (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default hoy_bogota(),
  proveedor       text,
  gasto_id        uuid references gastos (id) on delete set null,
  registrado_por  uuid not null default auth.uid() references perfiles (id),
  creado_en       timestamptz not null default now()
);

create table compra_items (
  id           bigint generated always as identity primary key,
  compra_id    uuid not null references compras (id) on delete cascade,
  insumo_id    bigint not null references insumos (id),
  cantidad     numeric(14,3) not null check (cantidad > 0),
  costo_total  bigint not null check (costo_total >= 0)
);

-- Aportes de capital de cada socio (para saber a quién se le devuelve cuánto).
create table aportes_socios (
  id           uuid primary key default gen_random_uuid(),
  socio_id     uuid not null references perfiles (id),
  fecha        date not null,
  monto        bigint not null check (monto > 0),
  descripcion  text,
  creado_en    timestamptz not null default now()
);

-- Plan de recuperación de inversión:
--   cuota mensual = monto_total / meses
--   aplica desde el mes de inicia_en y durante `meses` meses; después
--   sale sola de los costos fijos y el punto de equilibrio baja.
create table planes_recuperacion (
  id           bigint generated always as identity primary key,
  descripcion  text not null,
  monto_total  bigint not null check (monto_total > 0),
  meses        int not null check (meses > 0),
  inicia_en    date not null,
  creado_en    timestamptz not null default now()
);

-- Parámetros financieros con vigencia. El valor vigente en una fecha es el
-- de mayor vigente_desde <= fecha (cambiar la tarifa no altera el histórico).
create table parametros (
  clave          text not null,
  vigente_desde  date not null,
  valor          numeric(14,4) not null,
  descripcion    text,
  primary key (clave, vigente_desde)
);

create or replace function parametro(p_clave text, p_fecha date default hoy_bogota())
returns numeric
language sql stable security definer set search_path = public as $$
  select valor from parametros
  where clave = p_clave and vigente_desde <= p_fecha
  order by vigente_desde desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Caja: turnos
-- ---------------------------------------------------------------------
create table turnos (
  id                 uuid primary key default gen_random_uuid(),
  abierto_por        uuid not null default auth.uid() references perfiles (id),
  abierto_en         timestamptz not null default now(),
  base_inicial       bigint not null check (base_inicial >= 0),
  cerrado_por        uuid references perfiles (id),
  cerrado_en         timestamptz,
  ventas_efectivo    bigint,            -- calculado por el sistema al cerrar
  efectivo_esperado  bigint,            -- base + ventas en efectivo
  efectivo_contado   bigint check (efectivo_contado >= 0),
  diferencia         bigint generated always as (efectivo_contado - efectivo_esperado) stored,
  notas_cierre       text
);
-- Solo un turno abierto a la vez.
create unique index turnos_un_abierto on turnos ((true)) where cerrado_en is null;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table ventas (
  -- El id lo genera la tablet (UUID) ANTES de enviar: si se cae internet y se
  -- reintenta, el mismo id evita registrar la venta dos veces.
  id                 uuid primary key,
  numero             bigint generated always as identity unique,  -- consecutivo legible (#1532)
  turno_id           uuid references turnos (id),
  vendedor_id        uuid not null references perfiles (id),
  metodo_pago        metodo_pago not null,
  total              bigint not null check (total >= 0),
  comision_datafono  bigint not null default 0,
  costo_insumos      numeric(14,2) not null default 0,   -- sin merma; la merma se aplica en reportes
  estado             estado_venta not null default 'completada',
  vendida_en         timestamptz not null,               -- hora en la tablet
  registrada_en      timestamptz not null default now(), -- hora en que llegó al servidor
  anulada_en         timestamptz,
  anulada_por        uuid references perfiles (id),
  motivo_anulacion   text,
  notas              text,
  check (estado = 'completada' or coalesce(trim(motivo_anulacion), '') <> '')
);
create index on ventas (vendida_en);
create index on ventas (turno_id);

create table venta_items (
  id               bigint generated always as identity primary key,
  venta_id         uuid not null references ventas (id) on delete cascade,
  producto_id      bigint not null references productos (id),
  nombre_producto  text not null,              -- snapshot
  tipo_producto    tipo_producto not null,     -- snapshot (para tasa de adjunción)
  cantidad         int not null check (cantidad > 0),
  precio_unitario  bigint not null,
  extras_unitario  bigint not null default 0,  -- suma de toppings con precio extra
  subtotal         bigint not null,            -- (precio + extras) * cantidad
  costo_unitario   numeric(14,2) not null default 0  -- receta + toppings, al costo del momento
);
create index on venta_items (venta_id);

create table venta_item_toppings (
  venta_item_id   bigint not null references venta_items (id) on delete cascade,
  topping_id      bigint not null references toppings (id),
  nombre_topping  text not null,     -- snapshot
  precio_extra    bigint not null default 0,
  primary key (venta_item_id, topping_id)
);

-- Libro de movimientos de inventario. stock_actual = suma de movimientos.
create table movimientos_inventario (
  id              bigint generated always as identity primary key,
  insumo_id       bigint not null references insumos (id),
  tipo            tipo_movimiento not null,
  cantidad        numeric(14,3) not null,     -- + entra, - sale
  costo_unitario  numeric(14,4),              -- costo al momento del movimiento
  venta_id        uuid references ventas (id),
  compra_id       uuid references compras (id) on delete cascade,
  nota            text,
  creado_por      uuid default auth.uid() references perfiles (id),
  creado_en       timestamptz not null default now()
);
create index on movimientos_inventario (insumo_id, creado_en);
create index on movimientos_inventario (venta_id);

create or replace function aplicar_movimiento_stock() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update insumos set stock_actual = stock_actual + new.cantidad where id = new.insumo_id;
  elsif tg_op = 'DELETE' then
    update insumos set stock_actual = stock_actual - old.cantidad where id = old.insumo_id;
  end if;
  return null;
end $$;
create trigger movimientos_stock after insert or delete on movimientos_inventario
  for each row execute function aplicar_movimiento_stock();

-- Al registrar una compra: entra stock y el costo del insumo pasa a
-- promedio ponderado (lo que había en inventario + lo comprado).
create or replace function aplicar_compra_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_stock numeric;
  v_costo numeric;
begin
  select greatest(stock_actual, 0), costo_unitario into v_stock, v_costo
  from insumos where id = new.insumo_id for update;

  perform set_config('bpc.origen_costo', 'compra', true);
  perform set_config('bpc.motivo_costo', 'Compra ' || new.compra_id, true);
  update insumos
     set costo_unitario = round((v_stock * v_costo + new.costo_total) / (v_stock + new.cantidad), 4)
   where id = new.insumo_id;
  perform set_config('bpc.origen_costo', '', true);

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, compra_id)
  values (new.insumo_id, 'compra', new.cantidad, round(new.costo_total / new.cantidad, 4), new.compra_id);
  return null;
end $$;
create trigger compra_items_aplicar after insert on compra_items
  for each row execute function aplicar_compra_item();

-- ---------------------------------------------------------------------
-- RPC de inventario (socios)
-- ---------------------------------------------------------------------

-- Excepción: corregir a mano el costo promedio de un insumo (ej. lote dañado).
create or replace function ajustar_costo_insumo(p_insumo_id bigint, p_costo numeric, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede ajustar costos' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo del ajuste de costo' using errcode = '22023';
  end if;
  if p_costo is null or p_costo < 0 then
    raise exception 'Costo inválido' using errcode = '22023';
  end if;

  perform set_config('bpc.origen_costo', 'manual', true);
  perform set_config('bpc.motivo_costo', p_motivo, true);
  update insumos set costo_unitario = p_costo where id = p_insumo_id;
  if not found then
    raise exception 'El insumo no existe' using errcode = '22023';
  end if;
  perform set_config('bpc.origen_costo', '', true);
end $$;

-- Stock inicial, ajuste por conteo físico o merma. p_cantidad: + entra, - sale.
create or replace function ajustar_stock(p_insumo_id bigint, p_tipo tipo_movimiento,
                                         p_cantidad numeric, p_nota text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede ajustar inventario' using errcode = '42501';
  end if;
  if p_tipo not in ('inicial', 'ajuste', 'merma') then
    raise exception 'Tipo de ajuste inválido' using errcode = '22023';
  end if;
  if p_cantidad is null or p_cantidad = 0 then
    raise exception 'La cantidad no puede ser cero' using errcode = '22023';
  end if;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, nota)
  select id, p_tipo, case when p_tipo = 'merma' then -abs(p_cantidad) else p_cantidad end,
         costo_unitario, p_nota
    from insumos where id = p_insumo_id;
  if not found then
    raise exception 'El insumo no existe' using errcode = '22023';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- RPC: registrar_venta
-- Única puerta de entrada de ventas. Atómica e idempotente.
--
-- Payload:
-- {
--   "id": "uuid generado en la tablet",
--   "vendida_en": "2026-09-23T12:31:05-05:00",
--   "metodo_pago": "efectivo" | "datafono",
--   "notas": "opcional",
--   "items": [
--     { "producto_id": 1, "cantidad": 2, "toppings": [1, 3, 5] },
--     { "producto_id": 3, "cantidad": 1 }
--   ]
-- }
-- Los precios los pone el servidor (no se confía en la tablet).
-- El inventario puede quedar negativo: nunca se bloquea una venta por stock.
-- ---------------------------------------------------------------------
create or replace function registrar_venta(p_venta jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id          uuid := (p_venta ->> 'id')::uuid;
  v_metodo      metodo_pago := (p_venta ->> 'metodo_pago')::metodo_pago;
  v_vendida_en  timestamptz := coalesce((p_venta ->> 'vendida_en')::timestamptz, now());
  v_existente   ventas%rowtype;
  v_item        jsonb;
  v_prod        productos%rowtype;
  v_cant        int;
  v_linea_id    bigint;
  v_turno       uuid;
  v_total       bigint;
  v_costo       numeric;
  v_numero      bigint;
begin
  if auth.uid() is null or rol_actual() is null then
    raise exception 'Usuario sin permiso para vender' using errcode = '42501';
  end if;
  if v_id is null or v_metodo is null then
    raise exception 'Venta incompleta: falta id o método de pago' using errcode = '22023';
  end if;
  if jsonb_typeof(p_venta -> 'items') is distinct from 'array' or jsonb_array_length(p_venta -> 'items') = 0 then
    raise exception 'La venta no tiene productos' using errcode = '22023';
  end if;

  -- Idempotencia: si ya llegó (reintento offline), devolver la misma.
  select * into v_existente from ventas where id = v_id;
  if found then
    return jsonb_build_object('id', v_existente.id, 'numero', v_existente.numero,
                              'total', v_existente.total, 'duplicada', true);
  end if;

  -- No aceptar horas absurdas del reloj de la tablet.
  if v_vendida_en > now() + interval '5 minutes' or v_vendida_en < now() - interval '7 days' then
    v_vendida_en := now();
  end if;

  -- Turno de caja en el que cayó la venta (si no hay, igual se vende).
  select id into v_turno from turnos
   where abierto_en <= v_vendida_en and (cerrado_en is null or cerrado_en >= v_vendida_en)
   order by abierto_en desc limit 1;

  insert into ventas (id, turno_id, vendedor_id, metodo_pago, total, vendida_en, notas)
  values (v_id, v_turno, auth.uid(), v_metodo, 0, v_vendida_en, nullif(p_venta ->> 'notas', ''))
  returning numero into v_numero;

  for v_item in select * from jsonb_array_elements(p_venta -> 'items') loop
    v_cant := coalesce((v_item ->> 'cantidad')::int, 1);
    if v_cant <= 0 then
      raise exception 'Cantidad inválida' using errcode = '22023';
    end if;

    select * into v_prod from productos where id = (v_item ->> 'producto_id')::bigint and activo;
    if not found then
      raise exception 'Producto % no existe o está inactivo', v_item ->> 'producto_id' using errcode = '22023';
    end if;

    insert into venta_items (venta_id, producto_id, nombre_producto, tipo_producto,
                             cantidad, precio_unitario, subtotal)
    values (v_id, v_prod.id, v_prod.nombre, v_prod.tipo, v_cant, v_prod.precio, v_prod.precio * v_cant)
    returning id into v_linea_id;

    perform _agregar_toppings(v_linea_id, v_prod.id, v_item -> 'toppings');
  end loop;

  -- Extras cobrados por toppings → subtotal de cada línea
  update venta_items vi
     set extras_unitario = t.extras,
         subtotal = (vi.precio_unitario + t.extras) * vi.cantidad
    from (select vt.venta_item_id, sum(vt.precio_extra) as extras
            from venta_item_toppings vt
            join venta_items x on x.id = vt.venta_item_id and x.venta_id = v_id
           group by vt.venta_item_id) t
   where vi.id = t.venta_item_id;

  -- Consumo de insumos: receta de cada línea + toppings elegidos
  create temp table if not exists _consumo (item_id bigint, insumo_id bigint, cantidad numeric) on commit drop;
  truncate _consumo;
  insert into _consumo
  select vi.id, r.insumo_id, r.cantidad * vi.cantidad
    from venta_items vi join receta_items r on r.producto_id = vi.producto_id
   where vi.venta_id = v_id
  union all
  select vi.id, ti.insumo_id, ti.cantidad * vi.cantidad
    from venta_items vi
    join venta_item_toppings vt on vt.venta_item_id = vi.id
    join topping_insumos ti on ti.topping_id = vt.topping_id
   where vi.venta_id = v_id;

  -- Costo unitario por línea (para margen por producto)
  update venta_items vi
     set costo_unitario = round(c.costo / vi.cantidad, 2)
    from (select co.item_id, sum(co.cantidad * i.costo_unitario) as costo
            from _consumo co join insumos i on i.id = co.insumo_id
           group by co.item_id) c
   where vi.id = c.item_id;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, venta_id)
  select co.insumo_id, 'consumo_venta', -sum(co.cantidad), i.costo_unitario, v_id
    from _consumo co join insumos i on i.id = co.insumo_id
   group by co.insumo_id, i.costo_unitario;

  select coalesce(sum(subtotal), 0) into v_total from venta_items where venta_id = v_id;
  select coalesce(sum(co.cantidad * i.costo_unitario), 0) into v_costo
    from _consumo co join insumos i on i.id = co.insumo_id;

  update ventas
     set total = v_total,
         costo_insumos = round(v_costo, 2),
         comision_datafono = case when v_metodo = 'datafono'
           then round(v_total * coalesce(parametro('comision_datafono_pct',
                                                   (v_vendida_en at time zone 'America/Bogota')::date), 0) / 100)
           else 0 end
   where id = v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'duplicada', false);
end $$;

-- Helper interno: valida y guarda los toppings de una línea.
create or replace function _agregar_toppings(p_item_id bigint, p_producto_id bigint, p_toppings jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_invalidos int;
begin
  if p_toppings is null or jsonb_typeof(p_toppings) <> 'array' or jsonb_array_length(p_toppings) = 0 then
    return;
  end if;

  select count(*) into v_invalidos
    from (select distinct value::bigint as tid from jsonb_array_elements_text(p_toppings)) s
   where not exists (select 1 from producto_toppings pt
                       join toppings t on t.id = pt.topping_id and t.activo
                      where pt.producto_id = p_producto_id and pt.topping_id = s.tid);
  if v_invalidos > 0 then
    raise exception 'Hay toppings que no aplican a este producto' using errcode = '22023';
  end if;

  insert into venta_item_toppings (venta_item_id, topping_id, nombre_topping, precio_extra)
  select p_item_id, t.id, t.nombre, pt.precio_extra
    from (select distinct value::bigint as tid from jsonb_array_elements_text(p_toppings)) s
    join toppings t on t.id = s.tid
    join producto_toppings pt on pt.topping_id = t.id and pt.producto_id = p_producto_id;
end $$;

-- ---------------------------------------------------------------------
-- RPC: anular_venta
--   * Empleada: solo sus ventas y dentro de los 5 minutos siguientes.
--   * Socio: cualquier venta, en cualquier momento.
--   * Siempre con motivo. Devuelve el inventario consumido.
-- ---------------------------------------------------------------------
create or replace function anular_venta(p_venta_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_venta ventas%rowtype;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación' using errcode = '22023';
  end if;

  select * into v_venta from ventas where id = p_venta_id for update;
  if not found or v_venta.estado <> 'completada' then
    raise exception 'La venta no existe o ya estaba anulada' using errcode = '22023';
  end if;

  if not es_socio() and (v_venta.vendedor_id <> auth.uid()
                         or v_venta.vendida_en < now() - interval '5 minutes') then
    raise exception 'Pasaron más de 5 minutos: pídele a un socio que la anule' using errcode = '42501';
  end if;

  update ventas
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = trim(p_motivo)
   where id = p_venta_id;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, venta_id, nota)
  select insumo_id, 'reverso_venta', -cantidad, costo_unitario, venta_id, 'Anulación: ' || trim(p_motivo)
    from movimientos_inventario
   where venta_id = p_venta_id and tipo = 'consumo_venta';
end $$;

-- ---------------------------------------------------------------------
-- RPC de caja (empleada y socios)
-- ---------------------------------------------------------------------
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
  insert into turnos (base_inicial) values (coalesce(p_base_inicial, 0)) returning id into v_id;
  return v_id;
end $$;

-- Turno abierto. No muestra cuánto "debería" haber: el conteo es a ciegas.
create or replace function turno_actual()
returns table (id uuid, abierto_en timestamptz, abierto_por text, base_inicial bigint)
language sql stable security definer set search_path = public as $$
  select t.id, t.abierto_en, p.nombre, t.base_inicial
    from turnos t join perfiles p on p.id = t.abierto_por
   where rol_actual() is not null and t.cerrado_en is null
$$;

-- Cierra el turno con el efectivo contado y devuelve el cuadre.
create or replace function cerrar_turno(p_efectivo_contado bigint, p_notas text default null)
returns table (base_inicial bigint, ventas_efectivo bigint, efectivo_esperado bigint,
               efectivo_contado bigint, diferencia bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_turno turnos%rowtype;
  v_ventas bigint;
begin
  if rol_actual() is null then
    raise exception 'Usuario sin permiso' using errcode = '42501';
  end if;
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Escribe el efectivo contado' using errcode = '22023';
  end if;

  select * into v_turno from turnos where cerrado_en is null for update;
  if not found then
    raise exception 'No hay un turno abierto' using errcode = '22023';
  end if;

  select coalesce(sum(v.total), 0) into v_ventas
    from ventas v
   where v.turno_id = v_turno.id and v.metodo_pago = 'efectivo' and v.estado = 'completada';

  update turnos t
     set cerrado_por = auth.uid(), cerrado_en = now(),
         ventas_efectivo = v_ventas,
         efectivo_esperado = t.base_inicial + v_ventas,
         efectivo_contado = p_efectivo_contado,
         notas_cierre = nullif(trim(p_notas), '')
   where t.id = v_turno.id;

  return query
    select t.base_inicial, t.ventas_efectivo, t.efectivo_esperado, t.efectivo_contado, t.diferencia
      from turnos t where t.id = v_turno.id;
end $$;

-- ---------------------------------------------------------------------
-- RPC para el POS (empleada): datos sin costos ni márgenes
-- ---------------------------------------------------------------------

-- Ventas del día, con la marca de si quien consulta todavía puede anularla.
create or replace function ventas_de_hoy()
returns table (id uuid, numero bigint, vendida_en timestamptz, metodo_pago metodo_pago,
               total bigint, estado estado_venta, resumen text, puede_anular boolean)
language sql stable security definer set search_path = public as $$
  select v.id, v.numero, v.vendida_en, v.metodo_pago, v.total, v.estado,
         (select string_agg(vi.cantidad || '× ' || vi.nombre_producto, ', ' order by vi.id)
            from venta_items vi where vi.venta_id = v.id),
         v.estado = 'completada'
           and (es_socio() or (v.vendedor_id = auth.uid() and v.vendida_en >= now() - interval '5 minutes'))
    from ventas v
   where rol_actual() is not null
     and (v.vendida_en at time zone 'America/Bogota')::date = hoy_bogota()
   order by v.vendida_en desc
$$;

-- Insumos por debajo del mínimo (la empleada es quien ve la nevera)
create or replace function alertas_stock()
returns table (insumo_id bigint, nombre text, unidad unidad_medida, stock_actual numeric, stock_minimo numeric)
language sql stable security definer set search_path = public as $$
  select id, nombre, unidad, stock_actual, stock_minimo
    from insumos
   where rol_actual() is not null and activo and stock_actual <= stock_minimo
   order by stock_actual / nullif(stock_minimo, 0) nulls first, nombre
$$;

-- ---------------------------------------------------------------------
-- Punto de equilibrio (socios)
--
--   costo por perro   = insumos_receta × (1 + %merma)
--                       + precio × %comisión datáfono × %ventas por datáfono
--   margen por perro  = precio − costo por perro
--   margen bebida     = (precio bebida − costo bebida) × %ventas con bebida
--   margen combinado  = margen por perro + margen bebida
--   cuota recuperación= Σ planes vigentes (monto_total / meses)
--   costos fijos      = nómina + arriendo + cuota recuperación
--   PE unidades/mes   = costos fijos / margen combinado
--   PE unidades/día   = PE mes / días de operación
--   PE pesos/mes      = PE unidades × precio
--
-- Precios, costos, % datáfono y % con bebida salen de las ventas reales del
-- mes; si el mes aún no tiene ventas, se usan catálogo y parámetros estimados.
-- La cuota solo cuenta en los meses del plan: al terminar, el PE baja solo.
-- ---------------------------------------------------------------------
create or replace function costo_catalogo(p_producto_id bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(r.cantidad * i.costo_unitario)
                     from receta_items r join insumos i on i.id = r.insumo_id
                    where r.producto_id = p_producto_id), 0)
       + coalesce((select sum(ti.cantidad * i.costo_unitario)
                     from producto_toppings pt
                     join topping_insumos ti on ti.topping_id = pt.topping_id
                     join insumos i on i.id = ti.insumo_id
                    where pt.producto_id = p_producto_id and pt.incluido_por_defecto), 0)
$$;

create or replace function cuota_recuperacion(p_mes date default hoy_bogota()) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(round(sum(monto_total::numeric / meses)), 0)::bigint
    from planes_recuperacion
   where date_trunc('month', p_mes) >= date_trunc('month', inicia_en)
     and date_trunc('month', p_mes) <  date_trunc('month', inicia_en) + make_interval(months => meses)
$$;

create or replace function punto_equilibrio(p_mes date default hoy_bogota()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde        timestamptz := (date_trunc('month', p_mes)::date)::timestamp at time zone 'America/Bogota';
  v_hasta        timestamptz := ((date_trunc('month', p_mes) + interval '1 month')::date)::timestamp at time zone 'America/Bogota';
  v_fecha        date := least(p_mes, hoy_bogota());
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
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta
     and vi.tipo_producto = 'bebida';
  if v_precio_beb is null then
    select avg(p.precio), avg(costo_catalogo(p.id)) into v_precio_beb, v_costo_beb
      from productos p where p.activo and p.tipo = 'bebida';
  end if;

  -- Mezcla de pagos y tasa de adjunción del mes
  select count(*),
         sum(total) filter (where metodo_pago = 'datafono')::numeric / nullif(sum(total), 0),
         count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'bebida'))::numeric
           / nullif(count(*) filter (where exists (select 1 from venta_items vi where vi.venta_id = v.id and vi.tipo_producto = 'perro')), 0)
    into v_ventas_mes, v_pct_datafono, v_pct_bebida
    from ventas v
   where v.estado = 'completada' and v.vendida_en >= v_desde and v.vendida_en < v_hasta;

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
    'perros_vendidos_mes',        coalesce(v_perros, 0),
    'margen_contribucion_mes',    round(v_margen_real),
    'avance_pct',                 round(100 * v_margen_real / nullif(v_fijos, 0), 1)
  );
end $$;

-- ---------------------------------------------------------------------
-- Seguridad: RLS
-- Empleada: lee catálogo de venta y opera por RPC (vender, anular <5 min, caja).
-- Socios: todo.
-- ---------------------------------------------------------------------
alter table perfiles               enable row level security;
alter table categorias             enable row level security;
alter table productos              enable row level security;
alter table toppings               enable row level security;
alter table producto_toppings      enable row level security;
alter table insumos                enable row level security;
alter table receta_items           enable row level security;
alter table topping_insumos        enable row level security;
alter table historial_costos       enable row level security;
alter table categorias_gasto       enable row level security;
alter table gastos                 enable row level security;
alter table compras                enable row level security;
alter table compra_items           enable row level security;
alter table aportes_socios         enable row level security;
alter table planes_recuperacion    enable row level security;
alter table parametros             enable row level security;
alter table turnos                 enable row level security;
alter table ventas                 enable row level security;
alter table venta_items            enable row level security;
alter table venta_item_toppings    enable row level security;
alter table movimientos_inventario enable row level security;

-- Perfiles: cada quien ve el suyo; los socios ven y editan todos.
create policy perfil_propio on perfiles for select to authenticated using (id = auth.uid() or es_socio());
create policy perfil_socio_edita on perfiles for update to authenticated using (es_socio()) with check (es_socio());

do $$
declare t text;
begin
  -- Catálogo de venta: lectura para cualquier usuario activo, escritura socios.
  foreach t in array array['categorias', 'productos', 'toppings', 'producto_toppings'] loop
    execute format('create policy %1$s_lectura on %1$s for select to authenticated using (rol_actual() is not null)', t);
    execute format('create policy %1$s_socios on %1$s for all to authenticated using (es_socio()) with check (es_socio())', t);
  end loop;

  -- Todo lo financiero/inventario/caja: solo socios.
  foreach t in array array['insumos', 'receta_items', 'topping_insumos', 'historial_costos',
                           'categorias_gasto', 'gastos', 'compras', 'compra_items', 'aportes_socios',
                           'planes_recuperacion', 'parametros', 'turnos',
                           'ventas', 'venta_items', 'venta_item_toppings', 'movimientos_inventario'] loop
    execute format('create policy %1$s_socios on %1$s for all to authenticated using (es_socio()) with check (es_socio())', t);
  end loop;
end $$;

-- Ventas, caja, inventario y auditoría solo cambian por RPC/trigger.
revoke insert, update, delete on ventas, venta_items, venta_item_toppings, movimientos_inventario,
                                 historial_costos, turnos from authenticated;
-- El stock solo se mueve con movimientos (no se edita a mano).
revoke insert, update on insumos from authenticated;
grant insert (nombre, unidad, costo_unitario, stock_minimo, activo) on insumos to authenticated;
grant update (nombre, unidad, costo_unitario, stock_minimo, activo) on insumos to authenticated;
revoke all on all tables in schema public from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  registrar_venta(jsonb), anular_venta(uuid, text), ventas_de_hoy(), alertas_stock(),
  abrir_turno(bigint), turno_actual(), cerrar_turno(bigint, text),
  ajustar_costo_insumo(bigint, numeric, text), ajustar_stock(bigint, tipo_movimiento, numeric, text),
  punto_equilibrio(date), cuota_recuperacion(date), costo_catalogo(bigint),
  rol_actual(), es_socio(), parametro(text, date), hoy_bogota()
  to authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: el dashboard de socios escucha estas tablas.
-- (Realtime respeta RLS: solo los socios reciben los eventos.)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table ventas, gastos, insumos, turnos;
