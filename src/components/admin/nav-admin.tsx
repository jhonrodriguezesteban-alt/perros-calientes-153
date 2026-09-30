"use client";

import {
  Bell,
  Boxes,
  ClipboardList,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Receipt,
  ShoppingCart,
  Store,
  Users,
  Utensils,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { supabaseNavegador } from "@/lib/supabase/client";

const GRUPOS = [
  {
    titulo: "Día a día",
    enlaces: [
      { href: "/pos", nombre: "Punto de venta", ayuda: "Vender", Icono: Store },
      { href: "/panel", nombre: "Hoy", ayuda: "Ventas del día y del mes", Icono: LayoutDashboard },
      { href: "/panel/ventas", nombre: "Ventas", ayuda: "Por fechas, día por día", Icono: Receipt },
      { href: "/panel/caja", nombre: "Caja", ayuda: "Cierres y retiros", Icono: Landmark },
      { href: "/panel/solicitudes", nombre: "Solicitudes", ayuda: "Lo que pide Andrea", Icono: ClipboardList },
    ],
  },
  {
    titulo: "Mercancía",
    enlaces: [
      { href: "/panel/inventario", nombre: "Inventario", ayuda: "Stock y conteos", Icono: Boxes },
      { href: "/panel/compras", nombre: "Compras", ayuda: "Registrar facturas", Icono: ShoppingCart },
      { href: "/panel/catalogo", nombre: "Menú", ayuda: "Productos y precios", Icono: Utensils },
    ],
  },
  {
    titulo: "Dinero",
    enlaces: [
      { href: "/panel/flujo", nombre: "Flujo de caja", ayuda: "Plata disponible y dónde está", Icono: Wallet },
      { href: "/panel/nomina", nombre: "Nómina y préstamos", ayuda: "Pagos, vales y plata prestada", Icono: Users },
      { href: "/panel/deudores", nombre: "Deudores", ayuda: "Fiados por cobrar", Icono: HandCoins },
      { href: "/panel/finanzas", nombre: "Finanzas", ayuda: "Gastos y punto de equilibrio", Icono: PiggyBank },
    ],
  },
  {
    titulo: "Cuenta",
    enlaces: [{ href: "/panel/notificaciones", nombre: "Notificaciones", ayuda: "Avisos al celular", Icono: Bell }],
  },
];

const TODOS = GRUPOS.flatMap((g) => g.enlaces);

async function contarPendientes() {
  const { count } = await supabaseNavegador()
    .from("solicitudes_pedido")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  return count ?? 0;
}

const esActivo = (href: string, ruta: string) => (href === "/panel" ? ruta === "/panel" : ruta.startsWith(href));

/**
 * Menú de módulos a la izquierda. En pantallas grandes queda fijo (el botón
 * de hamburguesa lo oculta o lo muestra); en tablet y celular se abre encima.
 */
export function NavAdmin({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  const ruta = usePathname();
  const [pendientes, setPendientes] = useState(0);
  const [abierto, setAbierto] = useState(false); // celular / tablet
  const [fijo, setFijo] = useState(true); // pantallas grandes
  const actual = TODOS.find((e) => esActivo(e.href, ruta));

  // Contador de solicitudes pendientes, en vivo.
  useEffect(() => {
    let activo = true;
    const actualizar = () => void contarPendientes().then((n) => activo && setPendientes(n));
    actualizar();
    const supabase = supabaseNavegador();
    const canal = supabase
      .channel("nav-solicitudes")
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_pedido" }, actualizar)
      .subscribe();
    return () => {
      activo = false;
      void supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const alTecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTecla);
    return () => window.removeEventListener("keydown", alTecla);
  }, [abierto]);

  const alternar = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) setFijo((f) => !f);
    else setAbierto((a) => !a);
  };

  return (
    <div className="min-h-dvh">
      {/* Barra superior */}
      <header className="relative sticky top-0 z-30 flex h-16 items-center gap-2 bg-cafe px-2 text-crema shadow-md sm:px-4">
        <button
          onClick={alternar}
          aria-label="Abrir o cerrar el menú"
          aria-expanded={abierto}
          className="grid size-12 place-items-center rounded-full active:bg-cafe-700"
        >
          <Menu className="size-7" />
        </button>
        <Link href="/panel" aria-label="Inicio del panel" className="absolute left-1/2 -translate-x-1/2 sm:static sm:translate-x-0">
          <Logo alto={36} placa />
        </Link>
        {actual && (
          <span className="ml-2 hidden items-center gap-2 rounded-full bg-cafe-700 px-3 py-1 font-etiqueta text-sm font-semibold sm:flex">
            <actual.Icono className="size-4" /> {actual.nombre}
          </span>
        )}
        <Link
          href="/pos"
          className="ml-auto flex h-11 items-center gap-2 rounded-full bg-mostaza px-4 font-etiqueta text-sm font-extrabold text-cafe active:bg-mostaza-100"
        >
          <Store className="size-5" /> <span className="hidden sm:inline">Ir al POS</span>
        </Link>
      </header>

      {/* Fondo oscuro en celular/tablet */}
      {abierto && <div onClick={() => setAbierto(false)} className="fixed inset-0 z-40 bg-cafe/50 lg:hidden" aria-hidden />}

      {/* Menú lateral */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-cafe text-crema shadow-2xl transition-transform duration-200 lg:top-16 lg:z-20 lg:shadow-none ${
          abierto ? "translate-x-0" : "-translate-x-full"
        } ${fijo ? "lg:translate-x-0" : "lg:-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4 lg:hidden">
          <p className="font-etiqueta text-sm font-semibold text-cafe-300">Hola, {nombre}</p>
          <button onClick={() => setAbierto(false)} aria-label="Cerrar menú" className="grid size-11 place-items-center rounded-full active:bg-cafe-700">
            <X className="size-6" />
          </button>
        </div>
        <p className="hidden px-5 pb-1 pt-5 font-etiqueta text-sm font-semibold text-cafe-300 lg:block">Hola, {nombre}</p>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="mt-4">
              <p className="px-3 pb-1 font-etiqueta text-xs font-semibold uppercase tracking-wider text-cafe-300">{g.titulo}</p>
              <ul className="space-y-1">
                {g.enlaces.map(({ href, nombre: n, ayuda, Icono }) => {
                  const activo = esActivo(href, ruta);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={() => setAbierto(false)}
                        aria-current={activo ? "page" : undefined}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                          activo ? "bg-crema text-cafe" : "text-crema active:bg-cafe-700 lg:hover:bg-cafe-700"
                        }`}
                      >
                        <Icono className="size-6 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-etiqueta text-base font-extrabold leading-tight">{n}</span>
                          <span className={`block truncate text-xs ${activo ? "text-cafe-700" : "text-cafe-300"}`}>{ayuda}</span>
                        </span>
                        {href === "/panel/solicitudes" && pendientes > 0 && (
                          <span className="numeros grid min-w-6 place-items-center rounded-full bg-rojo px-1.5 text-xs font-bold text-white">
                            {pendientes}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <form action="/salir" method="post" className="border-t border-cafe-700 p-3">
          <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 font-etiqueta font-semibold text-cafe-300 active:bg-cafe-700 lg:hover:bg-cafe-700">
            <LogOut className="size-5" /> Cerrar sesión
          </button>
        </form>
      </aside>

      <div className="flex">
        {/* Deja el espacio del menú fijo en pantallas grandes */}
        <div aria-hidden className={`hidden shrink-0 transition-[width] duration-200 lg:block ${fijo ? "lg:w-72" : "lg:w-0"}`} />
        <main className="mx-auto w-full min-w-0 max-w-6xl px-4 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
