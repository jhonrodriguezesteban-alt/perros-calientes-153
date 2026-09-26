"use client";

import { Boxes, ClipboardList, HandCoins, LayoutDashboard, LogOut, PiggyBank, ShoppingCart, Store, Utensils } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

const ENLACES = [
  { href: "/panel", nombre: "Hoy", Icono: LayoutDashboard },
  { href: "/panel/solicitudes", nombre: "Solicitudes", Icono: ClipboardList },
  { href: "/panel/inventario", nombre: "Inventario", Icono: Boxes },
  { href: "/panel/compras", nombre: "Compras", Icono: ShoppingCart },
  { href: "/panel/deudores", nombre: "Deudores", Icono: HandCoins },
  { href: "/panel/finanzas", nombre: "Finanzas", Icono: PiggyBank },
  { href: "/panel/catalogo", nombre: "Menú", Icono: Utensils },
];

async function contarPendientes() {
  const { count } = await supabaseNavegador()
    .from("solicitudes_pedido")
    .select("id", { count: "exact", head: true })
    .eq("estado", "pendiente");
  return count ?? 0;
}

export function NavAdmin({ nombre }: { nombre: string }) {
  const ruta = usePathname();
  const [pendientes, setPendientes] = useState(0);

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

  return (
    <header className="sticky top-0 z-30 bg-cafe text-crema shadow-md">
      <div className="flex items-center gap-3 px-4 pt-3 sm:px-8">
        <p className="whitespace-nowrap font-titulo text-xl font-extrabold leading-none sm:text-2xl">
          Bendito <span className="text-mostaza">Perro</span> Caliente
        </p>
        <span className="hidden font-etiqueta text-sm font-semibold text-cafe-300 sm:inline">Hola, {nombre}</span>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/pos" className="flex h-11 items-center gap-2 rounded-full px-4 font-etiqueta text-sm font-semibold active:bg-cafe-700">
            <Store className="size-5" /> <span className="hidden sm:inline">Ir al POS</span>
          </Link>
          <form action="/salir" method="post">
            <button aria-label="Cerrar sesión" className="grid size-11 place-items-center rounded-full active:bg-cafe-700">
              <LogOut className="size-5" />
            </button>
          </form>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2 pt-2 sm:px-7">
        {ENLACES.map(({ href, nombre, Icono }) => {
          const activo = href === "/panel" ? ruta === "/panel" : ruta.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 font-etiqueta text-sm font-semibold ${
                activo ? "bg-crema text-cafe" : "text-crema active:bg-cafe-700"
              }`}
            >
              <Icono className="size-4" />
              {nombre}
              {href === "/panel/solicitudes" && pendientes > 0 && (
                <span className="numeros grid min-w-6 place-items-center rounded-full bg-rojo px-1.5 text-xs text-white">{pendientes}</span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
