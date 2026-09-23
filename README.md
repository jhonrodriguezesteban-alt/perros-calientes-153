# Bendito Perro Caliente — POS y panel de gestión

Punto de venta para la tablet del contenedor y panel en tiempo real para los socios.

- **Stack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS 4, Supabase (Postgres, Auth, Realtime), despliegue en Vercel.
- **Modelo de datos:** [`docs/modelo-de-datos.md`](docs/modelo-de-datos.md) · SQL en [`supabase/migrations/`](supabase/migrations).
- **Caso de negocio original:** [`docs/caso-de-negocio.html`](docs/caso-de-negocio.html).

## Qué hay hoy

| Ruta | Quién | Qué hace |
|---|---|---|
| `/login` | todos | Correo y contraseña (Supabase Auth). |
| `/pos` | empleada y socios | Venta táctil: perros con toppings (clásicos premarcados, premium a mano), bebidas, cobro en efectivo (con vuelto) o datáfono Bold QR, ventas del día, anulación (5 min para la empleada), apertura y cierre de turno con cuadre de caja, alertas de insumos por reordenar. |
| `/panel` | solo socios | Primera versión: ventas del día, efectivo vs. datáfono y punto de equilibrio del mes, en tiempo real. |

### Si se cae el internet
- Cada venta se guarda **primero en la tablet** y después se envía. Sin conexión queda en cola
  ("1 por enviar" en el encabezado) y se reintenta sola cada 15 s y al volver la red.
- La tablet le pone a cada venta un id único antes de enviarla, así que un reintento nunca la duplica.
- El pedido en curso y el menú también quedan guardados en la tablet: si se recarga la página,
  no se pierde nada.
- Para cerrar el turno hay que esperar a que se envíe todo, así el cuadre queda completo.
- Límite actual: si la tablet **abre** la página sin internet (recarga en frío), no carga. Una vez
  abierta, sigue funcionando sin conexión. Hacerla instalable y que abra sin internet (PWA) está
  en la lista de pendientes.

## Puesta en marcha

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com) (región São Paulo, la más cercana a Bogotá).
2. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up*. Los usuarios los crean los socios.
3. Aplica el modelo de datos. Con la [CLI de Supabase](https://supabase.com/docs/guides/cli):
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```
   (O copia el contenido de `supabase/migrations/20260923000000_modelo_inicial.sql` en el SQL Editor y ejecútalo.)
4. Carga el menú de arranque: ejecuta `supabase/seed.sql` en el SQL Editor. **Precios, recetas y costos
   son provisionales**: ajústalos antes de vender.
5. Crea los usuarios en **Authentication → Users → Add user** (correo + contraseña, marcando *Auto Confirm*).
   En *User metadata* puedes poner `{"nombre": "Laura"}`. Todos nacen como `empleado`; para los socios:
   ```sql
   update perfiles set rol = 'socio' where id in (
     select id from auth.users where email in ('socio1@correo.com', 'socio2@correo.com')
   );
   ```
6. Carga el inventario inicial en el SQL Editor (una vez):
   ```sql
   insert into movimientos_inventario (insumo_id, tipo, cantidad, nota)
   select id, 'inicial', 1000, 'Inventario de arranque' from insumos where nombre = 'Queso';
   ```

### 2. Variables de entorno
Copia `.env.example` a `.env.local` y llena los valores de **Project Settings → API**:
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon o publishable key>
```

### 3. Correr en local
```bash
npm install
npm run dev      # http://localhost:3000
```

### 4. Vercel
Importa el repositorio en Vercel, agrega las dos variables de entorno y despliega. No requiere nada más.

## Scripts
| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilación de producción (incluye verificación de tipos) |
| `npm run lint` | ESLint |

## Estructura
```
src/
  app/
    login/          inicio de sesión (server action)
    pos/            pantalla de ventas
    panel/          panel de socios
    salir/          cerrar sesión
  components/
    pos/            POS: catálogo, arma tu perro, pedido, cobro, ventas del día, turno
    panel/          panel en vivo
  lib/
    supabase/       clientes de Supabase (navegador y servidor)
    cola-ventas.ts  cola local de ventas pendientes (sin internet)
    pedido.ts       cálculo del pedido
  proxy.ts          sesión y redirección al login
supabase/
  migrations/       modelo de datos, RLS y funciones (registrar_venta, anular_venta, turnos, punto_equilibrio…)
  seed.sql          menú e insumos de arranque (provisionales)
```

## Seguridad
Toda la lógica sensible vive en la base de datos: los precios los pone el servidor, las ventas solo se
registran con `registrar_venta`, y las políticas RLS impiden que la cuenta de la empleada lea costos,
márgenes, gastos o inventario aunque llame la API directamente.
