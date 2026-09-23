# Guía de puesta en marcha (Supabase + Vercel)

Tiempo aproximado: 30 minutos. No hay que instalar nada en el computador: todo se hace en el
navegador. Supabase guarda los datos y los usuarios; Vercel publica la app en internet.

---

## Parte A — Supabase (base de datos y usuarios)

### A1. Crear el proyecto
1. Entra a <https://supabase.com> → **Start your project** → regístrate (con tu cuenta de GitHub es lo más fácil).
2. **New project**:
   - **Name:** `bendito-perro-caliente`
   - **Database password:** genera una y **guárdala** en un lugar seguro (no la vas a usar a diario, pero no se puede recuperar).
   - **Region:** *South America (São Paulo)*, la más cercana a Bogotá.
3. Espera 1–2 minutos a que el proyecto quede listo.

### A2. Cerrar el registro público
Así nadie de afuera puede crearse una cuenta; los usuarios los crean ustedes.

**Authentication → Sign In / Providers** → apaga **Allow new users to sign up** → **Save**.
Deja encendido el proveedor **Email**.

### A3. Cargar el modelo de datos
En el menú izquierdo: **SQL Editor** → **New query**. Vas a pegar y ejecutar **3 archivos, en este orden**.
Para cada uno: ábrelo en GitHub, botón **Copy raw file** (ícono de copiar), pégalo en el editor y
presiona **Run**. Debe decir *Success*.

1. `supabase/migrations/20260923000000_modelo_inicial.sql`
2. `supabase/migrations/20260924000000_variantes_y_plan_recuperacion.sql`
3. `supabase/seed.sql` (menú, insumos, costos y plan de recuperación)

> Si Supabase muestra un aviso de "operación destructiva" o de RLS, confirma: es normal para estos archivos.
> Ejecuta cada archivo **una sola vez**. Si alguno falla, copia el error y me lo pasas.

### A4. Crear los usuarios
**Authentication → Users → Add user → Create new user**, uno por persona:
- **Email** y **Password** (mínimo 8 caracteres; a la empleada dale una fácil de digitar en la tablet).
- Marca **Auto Confirm User**.

Luego, en **SQL Editor**, pon los nombres y marca a los socios (cambia los correos):
```sql
update perfiles p set nombre = x.nombre
  from (values ('empleada@correo.com', 'Laura'),
               ('socio1@correo.com',   'Jhon'),
               ('socio2@correo.com',   'Socio 2')) as x(email, nombre)
  join auth.users u on u.email = x.email
 where p.id = u.id;

update perfiles set rol = 'socio'
 where id in (select id from auth.users where email in ('socio1@correo.com', 'socio2@correo.com'));
```

### A5. Inventario inicial
Cuenta lo que hay físicamente en el contenedor y carga las cantidades (en la unidad de cada insumo:
salchichas, panes, huevos, bandejas y servilletas en **unidades**; lo demás en **gramos**).
Cambia los números y ejecuta:
```sql
insert into movimientos_inventario (insumo_id, tipo, cantidad, nota)
select i.id, 'inicial', x.cantidad, 'Inventario de arranque'
  from (values
    ('Salchicha americana', 32),     -- unidades
    ('Pan brioche',         32),     -- unidades
    ('Papa ripio',          1000),   -- gramos
    ('Papa hojuela',        1000),
    ('Queso doble crema',   1000),
    ('Queso Saravena',      500),
    ('Salsa rosada',        4000),
    ('Mostaza',             4000),
    ('Pepinillo',           600),
    ('Cebolla cabezona',    1000),
    ('Huevo',               30),     -- unidades
    ('Bandeja porta perro', 100),    -- unidades
    ('Servilleta',          300)     -- unidades
  ) as x(nombre, cantidad)
  join insumos i on i.nombre = x.nombre
 where x.cantidad > 0;
```

### A6. Copiar las claves para la app
Arriba en el proyecto, botón **Connect** → pestaña **App Frameworks** → **Next.js**. Copia dos valores:
- **URL del proyecto** (`https://xxxx.supabase.co`)
- **Clave pública**: se llama *publishable key* (`sb_publishable_…`) o *anon key* (`eyJ…`), según el proyecto.

⚠️ Nunca copies la *secret key* ni la *service_role key* en la app.

---

## Parte B — Vercel (publicar la app)

### B1. Pasar el código a `main`
Vercel publica la rama `main` del repositorio. Hoy el trabajo está en la rama
`claude/eloquent-pasteur-4saiq9`: hay que abrir un Pull Request y fusionarlo a `main`
(pídeme que lo abra y tú lo fusionas en GitHub con **Merge pull request**).

### B2. Crear el proyecto en Vercel
1. Entra a <https://vercel.com> → **Sign Up** → **Continue with GitHub**.
2. **Add New… → Project** → busca `perros-calientes-153` → **Import**.
   Si no aparece: **Adjust GitHub App Permissions** y dale acceso a ese repositorio.
3. Vercel detecta **Next.js** solo. No cambies nada de *Build settings*.
4. Abre **Environment Variables** y agrega:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | la URL del paso A6 |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clave pública del paso A6 |

5. **Deploy**. En 1–2 minutos te da una dirección como `perros-calientes-153.vercel.app`.

### B3. Avisarle a Supabase cuál es la dirección
En Supabase: **Authentication → URL Configuration** → **Site URL** = la dirección de Vercel → **Save**.

---

## Parte C — Probar antes de abrir al público

1. **Tablet**: abre la dirección en Chrome, entra con el usuario de la empleada. En el menú de Chrome
   (⋮) → **Agregar a la pantalla principal**, para abrirla como app.
2. Abre el turno con la base de caja, haz una venta de prueba en efectivo y otra con datáfono.
3. **Celular de un socio**: entra con su usuario → se abre el **Panel**. Haz otra venta en la tablet
   y verifica que el panel se actualiza solo, sin recargar.
4. **Sin internet**: en la tablet activa el modo avión, haz una venta (debe decir "Sin internet: venta
   guardada"), quita el modo avión y verifica que "por enviar" vuelve a cero.
5. Anula las ventas de prueba (desde "Ventas", como socio) y cierra el turno.

Si algo no funciona, mándame una captura de pantalla y lo que estabas haciendo.

---

## Cambiar datos más adelante (mientras no exista la pantalla de administración)

Todo se edita en **Supabase → Table Editor** (o con SQL):
- **Precios:** tabla `productos`, columna `precio`.
- **Gramajes estimados:** tablas `topping_insumos` y `receta_items`, columna `cantidad`
  (cuando lo validen con gramera, pongan `es_estimado` en `false`).
- **Merma, nómina, arriendo, comisión:** tabla `parametros`. Para cambiar un valor, **agrega una fila nueva**
  con la misma `clave`, el valor nuevo y `vigente_desde` = fecha desde la que aplica.
- **Inversión a recuperar:** tabla `plan_recuperacion_items`: agrega una fila por concepto
  (ej. utensilios, uniformes) y el total del plan se actualiza solo.
- **Fecha de inicio del plan:** tabla `planes_recuperacion`, columna `inicia_en`.
- **Costo de un insumo:** se actualiza solo al registrar compras (promedio ponderado). Una corrección
  puntual se hace así en el SQL Editor, y queda registrada con su motivo en `historial_costos`:
  ```sql
  begin;
  select set_config('bpc.origen_costo', 'manual', true),
         set_config('bpc.motivo_costo', 'Lote de queso dañado', true);
  update insumos set costo_unitario = 30 where nombre = 'Queso Saravena';
  commit;
  ```
