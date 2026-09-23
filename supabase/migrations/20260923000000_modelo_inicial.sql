-- =====================================================================
-- Bendito Perro Caliente — modelo de datos inicial
-- POS + inventario + gastos + dashboard de socios
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
create type tipo_producto    as enum ('perro', 'bebida', 'acompanamiento', 'combo');
create type metodo_pago      as enum ('efectivo', 'datafono');
create type estado_venta     as enum ('completada', 'anulada');
create type tipo_movimiento  as enum ('inicial', 'compra', 'consumo_venta', 'reverso_venta', 'ajuste', 'merma');
create type tipo_gasto       as enum ('fijo', 'variable', 'inversion');

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function set_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

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

-- Un combo se compone de "cupos": ej. Combo Sencillo = 1 cupo "Perro"
-- (producto fijo: Perro básico) + 1 cupo "Bebida" (cualquier producto de
-- la categoría Bebidas). Combo Amigos = cupo Perro x2 + cupo Bebida x2.
create table combo_cupos (
  id            bigint generated always as identity primary key,
  combo_id      bigint not null references productos (id) on delete cascade,
  nombre        text not null,
  producto_id   bigint references productos (id),
  categoria_id  bigint references categorias (id),
  cantidad      int not null default 1 check (cantidad > 0),
  check ((producto_id is null) <> (categoria_id is null))
);
create index on combo_cupos (combo_id);

create table toppings (
  id      bigint generated always as identity primary key,
  nombre  text not null unique,
  es_premium boolean not null default false,
  orden   int not null default 0,
  activo  boolean not null default true
);

-- Qué toppings ofrece cada producto, si vienen marcados por defecto
-- y cuánto cuestan de más en ESE producto (0 = incluido).
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

-- Receta base de un producto (pan, salchicha, servilleta, vaso...)
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
  fecha              date not null default (now() at time zone 'America/Bogota')::date,
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

-- Compras de insumos: entran al inventario y (opcionalmente) generan el gasto.
create table compras (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null default (now() at time zone 'America/Bogota')::date,
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

-- Aportes de capital de cada socio (inversión inicial y posteriores).
-- Saldo por recuperar = aportes - gastos tipo 'inversion' pagados a ese socio.
create table aportes_socios (
  id           uuid primary key default gen_random_uuid(),
  socio_id     uuid not null references perfiles (id),
  fecha        date not null,
  monto        bigint not null check (monto > 0),
  descripcion  text,
  creado_en    timestamptz not null default now()
);

-- Parámetros financieros con vigencia (comisión Bold, colchón de imprevistos,
-- cuota de recuperación, etc.). El valor vigente en una fecha es el de mayor
-- vigente_desde <= fecha.
create table parametros (
  clave          text not null,
  vigente_desde  date not null,
  valor          numeric(14,4) not null,
  descripcion    text,
  primary key (clave, vigente_desde)
);

create or replace function parametro(p_clave text, p_fecha date default (now() at time zone 'America/Bogota')::date)
returns numeric
language sql stable security definer set search_path = public as $$
  select valor from parametros
  where clave = p_clave and vigente_desde <= p_fecha
  order by vigente_desde desc
  limit 1
$$;

-- ---------------------------------------------------------------------
-- Ventas
-- ---------------------------------------------------------------------
create table ventas (
  -- El id lo genera la tablet (UUID) ANTES de enviar: si se cae internet y se
  -- reintenta, el mismo id evita registrar la venta dos veces.
  id                 uuid primary key,
  numero             bigint generated always as identity unique,  -- consecutivo legible (#1532)
  vendedor_id        uuid not null references perfiles (id),
  metodo_pago        metodo_pago not null,
  total              bigint not null check (total >= 0),
  comision_datafono  bigint not null default 0,
  costo_insumos      numeric(14,2) not null default 0,
  estado             estado_venta not null default 'completada',
  vendida_en         timestamptz not null,               -- hora en la tablet
  registrada_en      timestamptz not null default now(), -- hora en que llegó al servidor
  anulada_en         timestamptz,
  anulada_por        uuid references perfiles (id),
  motivo_anulacion   text,
  notas              text
);
create index on ventas (vendida_en);

create table venta_items (
  id               bigint generated always as identity primary key,
  venta_id         uuid not null references ventas (id) on delete cascade,
  -- Si la línea es parte de un combo, apunta a la línea del combo.
  combo_item_id    bigint references venta_items (id) on delete cascade,
  combo_cupo_id    bigint references combo_cupos (id),
  producto_id      bigint not null references productos (id),
  nombre_producto  text not null,              -- snapshot
  tipo_producto    tipo_producto not null,     -- snapshot (para tasa de adjunción)
  cantidad         int not null check (cantidad > 0),
  precio_unitario  bigint not null,            -- 0 para líneas dentro de un combo
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
-- promedio ponderado (stock existente + lo comprado).
create or replace function aplicar_compra_item() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_stock numeric;
  v_costo numeric;
begin
  select greatest(stock_actual, 0), costo_unitario into v_stock, v_costo
  from insumos where id = new.insumo_id for update;

  update insumos
     set costo_unitario = round((v_stock * v_costo + new.costo_total) / (v_stock + new.cantidad), 4)
   where id = new.insumo_id;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, compra_id)
  values (new.insumo_id, 'compra', new.cantidad, round(new.costo_total / new.cantidad, 4), new.compra_id);
  return null;
end $$;
create trigger compra_items_aplicar after insert on compra_items
  for each row execute function aplicar_compra_item();

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
--     { "producto_id": 9, "cantidad": 1,            -- un combo
--       "componentes": [
--         { "cupo_id": 1, "producto_id": 1, "toppings": [1, 2] },
--         { "cupo_id": 2, "producto_id": 6 }
--       ] }
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
  v_fecha       date;
  v_existente   ventas%rowtype;
  v_item        jsonb;
  v_comp        jsonb;
  v_prod        productos%rowtype;
  v_cupo        combo_cupos%rowtype;
  v_hijo        productos%rowtype;
  v_hijo_linea  bigint;
  v_cant        int;
  v_linea_id    bigint;
  v_total       bigint := 0;
  v_costo       numeric := 0;
  v_comision    bigint := 0;
begin
  if auth.uid() is null or rol_actual() is null then
    raise exception 'Usuario sin permiso para vender' using errcode = '42501';
  end if;
  if v_id is null or v_metodo is null then
    raise exception 'Venta incompleta: falta id o método de pago' using errcode = '22023';
  end if;
  if jsonb_typeof(p_venta -> 'items') <> 'array' or jsonb_array_length(p_venta -> 'items') = 0 then
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
  v_fecha := (v_vendida_en at time zone 'America/Bogota')::date;

  insert into ventas (id, vendedor_id, metodo_pago, total, vendida_en, notas)
  values (v_id, auth.uid(), v_metodo, 0, v_vendida_en, nullif(p_venta ->> 'notas', ''));

  -- Tabla temporal con las líneas "hoja" (lo que realmente se prepara)
  create temp table if not exists _lineas (item_id bigint, producto_id bigint, cantidad int) on commit drop;
  truncate _lineas;

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
    insert into _lineas values (v_linea_id, v_prod.id, v_cant);

    perform _agregar_toppings(v_linea_id, v_prod.id, v_item -> 'toppings');

    if v_prod.tipo = 'combo' then
      if v_cant <> 1 then
        raise exception 'Los combos se registran de a uno' using errcode = '22023';
      end if;
      for v_comp in select * from jsonb_array_elements(coalesce(v_item -> 'componentes', '[]')) loop
        select * into v_cupo from combo_cupos
         where id = (v_comp ->> 'cupo_id')::bigint and combo_id = v_prod.id;
        if not found then
          raise exception 'Cupo inválido para el combo %', v_prod.nombre using errcode = '22023';
        end if;

        select * into v_hijo from productos
         where id = (v_comp ->> 'producto_id')::bigint and activo
           and (id = v_cupo.producto_id or categoria_id = v_cupo.categoria_id);
        if not found then
          raise exception 'Producto no válido para "%" en %', v_cupo.nombre, v_prod.nombre using errcode = '22023';
        end if;

        insert into venta_items (venta_id, combo_item_id, combo_cupo_id, producto_id, nombre_producto,
                                 tipo_producto, cantidad, precio_unitario, subtotal)
        values (v_id, v_linea_id, v_cupo.id, v_hijo.id, v_hijo.nombre, v_hijo.tipo, 1, 0, 0)
        returning id into v_hijo_linea;
        insert into _lineas values (v_hijo_linea, v_hijo.id, 1);
        perform _agregar_toppings(v_hijo_linea, v_hijo.id, v_comp -> 'toppings');
      end loop;

      -- Cada cupo debe quedar completo
      if exists (
        select 1 from combo_cupos c
        where c.combo_id = v_prod.id
          and c.cantidad <> (select count(*) from venta_items vi
                              where vi.combo_item_id = v_linea_id and vi.combo_cupo_id = c.id)
      ) then
        raise exception 'Faltan o sobran productos en el combo %', v_prod.nombre using errcode = '22023';
      end if;
    end if;
  end loop;

  -- Extras cobrados por toppings premium → subtotal de cada línea
  update venta_items vi
     set extras_unitario = t.extras,
         subtotal = (vi.precio_unitario + t.extras) * vi.cantidad
    from (select venta_item_id, sum(precio_extra) as extras
            from venta_item_toppings vt
            join venta_items x on x.id = vt.venta_item_id and x.venta_id = v_id
           group by venta_item_id) t
   where vi.id = t.venta_item_id;

  -- Consumo de insumos: receta de cada línea + toppings elegidos
  create temp table if not exists _consumo (item_id bigint, insumo_id bigint, cantidad numeric) on commit drop;
  truncate _consumo;
  insert into _consumo
  select l.item_id, r.insumo_id, r.cantidad * l.cantidad
    from _lineas l join receta_items r on r.producto_id = l.producto_id
  union all
  select l.item_id, ti.insumo_id, ti.cantidad * l.cantidad
    from _lineas l
    join venta_item_toppings vt on vt.venta_item_id = l.item_id
    join topping_insumos ti on ti.topping_id = vt.topping_id;

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

  select coalesce(sum(subtotal), 0) into v_total
    from venta_items where venta_id = v_id and combo_item_id is null;
  select coalesce(sum(co.cantidad * i.costo_unitario), 0) into v_costo
    from _consumo co join insumos i on i.id = co.insumo_id;

  if v_metodo = 'datafono' then
    v_comision := round(
      (v_total * coalesce(parametro('comision_datafono_pct', v_fecha), 0) / 100
        + coalesce(parametro('comision_datafono_fija', v_fecha), 0))
      * (1 + coalesce(parametro('iva_comision_pct', v_fecha), 0) / 100));
  end if;

  update ventas
     set total = v_total, costo_insumos = round(v_costo, 2), comision_datafono = v_comision
   where id = v_id;

  return jsonb_build_object('id', v_id,
                            'numero', (select numero from ventas where id = v_id),
                            'total', v_total, 'duplicada', false);
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
-- RPC: anular_venta (solo socios). Devuelve el inventario consumido.
-- ---------------------------------------------------------------------
create or replace function anular_venta(p_venta_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_socio() then
    raise exception 'Solo un socio puede anular ventas' using errcode = '42501';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación' using errcode = '22023';
  end if;

  update ventas
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = p_motivo
   where id = p_venta_id and estado = 'completada';
  if not found then
    raise exception 'La venta no existe o ya estaba anulada' using errcode = '22023';
  end if;

  insert into movimientos_inventario (insumo_id, tipo, cantidad, costo_unitario, venta_id, nota)
  select insumo_id, 'reverso_venta', -cantidad, costo_unitario, venta_id, 'Anulación: ' || p_motivo
    from movimientos_inventario
   where venta_id = p_venta_id and tipo = 'consumo_venta';
end $$;

-- ---------------------------------------------------------------------
-- RPC para el POS (empleada): datos sin costos ni márgenes
-- ---------------------------------------------------------------------

-- Ventas del día (para cuadrar caja al cierre)
create or replace function ventas_de_hoy()
returns table (id uuid, numero bigint, vendida_en timestamptz, metodo_pago metodo_pago,
               total bigint, estado estado_venta, resumen text)
language sql stable security definer set search_path = public as $$
  select v.id, v.numero, v.vendida_en, v.metodo_pago, v.total, v.estado,
         (select string_agg(vi.cantidad || '× ' || vi.nombre_producto, ', ' order by vi.id)
            from venta_items vi where vi.venta_id = v.id and vi.combo_item_id is null)
    from ventas v
   where rol_actual() is not null
     and (v.vendida_en at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date
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
-- Seguridad: RLS
-- Empleada: lee catálogo de venta y vende por RPC. Nada más.
-- Socios: todo.
-- ---------------------------------------------------------------------
alter table perfiles               enable row level security;
alter table categorias             enable row level security;
alter table productos              enable row level security;
alter table combo_cupos            enable row level security;
alter table toppings               enable row level security;
alter table producto_toppings      enable row level security;
alter table insumos                enable row level security;
alter table receta_items           enable row level security;
alter table topping_insumos        enable row level security;
alter table categorias_gasto       enable row level security;
alter table gastos                 enable row level security;
alter table compras                enable row level security;
alter table compra_items           enable row level security;
alter table aportes_socios         enable row level security;
alter table parametros             enable row level security;
alter table ventas                 enable row level security;
alter table venta_items            enable row level security;
alter table venta_item_toppings    enable row level security;
alter table movimientos_inventario enable row level security;

-- Perfiles: cada quien ve el suyo; los socios ven y editan todos.
create policy perfil_propio on perfiles for select to authenticated using (id = auth.uid() or es_socio());
create policy perfil_socio_edita on perfiles for update to authenticated using (es_socio()) with check (es_socio());

-- Catálogo de venta: lectura para cualquier usuario activo, escritura socios.
do $$
declare t text;
begin
  foreach t in array array['categorias', 'productos', 'combo_cupos', 'toppings', 'producto_toppings'] loop
    execute format('create policy %1$s_lectura on %1$s for select to authenticated using (rol_actual() is not null)', t);
    execute format('create policy %1$s_socios on %1$s for all to authenticated using (es_socio()) with check (es_socio())', t);
  end loop;

  -- Todo lo financiero/inventario: solo socios.
  foreach t in array array['insumos', 'receta_items', 'topping_insumos', 'categorias_gasto', 'gastos',
                           'compras', 'compra_items', 'aportes_socios', 'parametros',
                           'ventas', 'venta_items', 'venta_item_toppings', 'movimientos_inventario'] loop
    execute format('create policy %1$s_socios on %1$s for all to authenticated using (es_socio()) with check (es_socio())', t);
  end loop;
end $$;

-- Las ventas y el inventario solo cambian por RPC, nunca por escritura directa.
revoke insert, update, delete on ventas, venta_items, venta_item_toppings, movimientos_inventario from authenticated;
revoke all on all tables in schema public from anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function registrar_venta(jsonb), anular_venta(uuid, text), ventas_de_hoy(),
                          alertas_stock(), rol_actual(), es_socio(), parametro(text, date)
  to authenticated;

-- ---------------------------------------------------------------------
-- Tiempo real: el dashboard de socios escucha estas tablas.
-- (Realtime respeta RLS: solo los socios reciben los eventos.)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table ventas, gastos, insumos;
