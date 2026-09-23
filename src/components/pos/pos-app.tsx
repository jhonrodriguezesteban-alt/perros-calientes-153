"use client";

import { ClipboardList, LayoutDashboard, LogOut, PackageOpen, ShoppingBag, Store, Wifi, WifiOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Avisos, useAvisos } from "@/components/aviso";
import { Modal } from "@/components/modal";
import { nuevoIdVenta } from "@/lib/cola-ventas";
import { cantidadInsumo, cop, horaBogota } from "@/lib/formato";
import { agregarLinea, resumenPedido, totalPedido } from "@/lib/pedido";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { AlertaStock, Catalogo, LineaPedido, MetodoPago, Perfil, Producto, Turno } from "@/lib/tipos";
import { ModalCobro } from "./modal-cobro";
import { ModalPerro } from "./modal-perro";
import { ModalTurno } from "./modal-turno";
import { ModalVentasHoy } from "./modal-ventas-hoy";
import { PanelPedido } from "./panel-pedido";
import { useColaVentas } from "./use-cola-ventas";

const CLAVE_PEDIDO = "bpc:pedido-en-curso:v1";
const CLAVE_CATALOGO = "bpc:catalogo:v1";

const FRASES_EXITO = ["¡Listo, salió con cariño!", "¡Antojo despachado!", "¡Venta registrada!"];

function leerLocal<T>(clave: string): T | null {
  try {
    const crudo = localStorage.getItem(clave);
    return crudo ? (JSON.parse(crudo) as T) : null;
  } catch {
    return null;
  }
}

async function obtenerEstado() {
  const supabase = supabaseNavegador();
  const [t, a] = await Promise.all([supabase.rpc("turno_actual"), supabase.rpc("alertas_stock")]);
  return {
    turno: t.error ? undefined : (((t.data as Turno[])[0] ?? null) as Turno | null),
    alertas: a.error ? undefined : (a.data as AlertaStock[]),
  };
}

/** POS de la tablet. Se renderiza solo en el navegador (usa localStorage para trabajar sin internet). */
export function PosApp({ perfil, catalogoInicial }: { perfil: Perfil; catalogoInicial: Catalogo | null }) {
  // Catálogo: el del servidor si llegó; si no (sin internet), el último guardado.
  const [catalogo] = useState<Catalogo | null>(() => catalogoInicial ?? leerLocal<Catalogo>(CLAVE_CATALOGO));
  const [categoriaId, setCategoriaId] = useState<number | null>(() => catalogo?.categorias[0]?.id ?? null);
  // El pedido en curso sobrevive a una recarga o a que se apague la pantalla.
  const [lineas, setLineas] = useState<LineaPedido[]>(() => leerLocal<LineaPedido[]>(CLAVE_PEDIDO) ?? []);
  const [armando, setArmando] = useState<{ producto: Producto; linea?: LineaPedido } | null>(null);
  const [cobrando, setCobrando] = useState<MetodoPago | null>(null);
  const [verVentas, setVerVentas] = useState(false);
  const [verTurno, setVerTurno] = useState(false);
  const [verAlertas, setVerAlertas] = useState(false);
  const [verPedidoMovil, setVerPedidoMovil] = useState(false);
  const [turno, setTurno] = useState<Turno | null | undefined>(undefined);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const { avisos, avisar } = useAvisos();

  const refrescarEstado = useCallback(async () => {
    const e = await obtenerEstado();
    if (e.turno !== undefined) setTurno(e.turno);
    if (e.alertas) setAlertas(e.alertas);
  }, []);

  const { cola, pendientes, enLinea, registrar, sincronizar, descartar } = useColaVentas(refrescarEstado);

  useEffect(() => {
    try {
      if (catalogoInicial) localStorage.setItem(CLAVE_CATALOGO, JSON.stringify(catalogoInicial));
    } catch {}
  }, [catalogoInicial]);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE_PEDIDO, JSON.stringify(lineas));
    } catch {}
  }, [lineas]);

  useEffect(() => {
    let activo = true;
    void obtenerEstado().then((e) => {
      if (!activo) return;
      if (e.turno !== undefined) setTurno(e.turno);
      if (e.alertas) setAlertas(e.alertas);
    });
    return () => {
      activo = false;
    };
  }, []);

  const productosPorCategoria = useMemo(
    () => (catalogo?.productos ?? []).filter((p) => p.categoria_id === categoriaId),
    [catalogo, categoriaId],
  );
  const bebidas = useMemo(() => (catalogo?.productos ?? []).filter((p) => p.tipo === "bebida"), [catalogo]);
  const total = totalPedido(lineas);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  const tocarProducto = (p: Producto) => {
    if (p.toppings.length > 0) setArmando({ producto: p });
    else setLineas((ls) => agregarLinea(ls, p, []));
  };

  const cambiarCantidad = (clave: string, delta: number) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + delta } : l)).filter((l) => l.cantidad > 0));

  const confirmarVenta = async (metodo: MetodoPago) => {
    const venta = {
      id: nuevoIdVenta(),
      vendida_en: new Date().toISOString(),
      metodo_pago: metodo,
      items: lineas.map((l) => ({
        producto_id: l.producto.id,
        cantidad: l.cantidad,
        toppings: l.toppings.map((t) => t.topping_id),
      })),
      total_estimado: total,
      resumen: resumenPedido(lineas),
    };

    const resultado = await registrar(venta);
    // Pase lo que pase, la venta ya está a salvo (enviada o en la cola): se limpia el pedido.
    setLineas([]);
    setCobrando(null);
    setVerPedidoMovil(false);

    if (resultado.tipo === "ok") {
      const frase = FRASES_EXITO[resultado.numero % FRASES_EXITO.length];
      avisar("exito", frase, `Venta #${resultado.numero} · ${cop(resultado.total)}`);
      void refrescarEstado();
    } else if (resultado.tipo === "rechazo") {
      avisar("error", "La venta no se pudo registrar", `${resultado.mensaje}. Quedó en "Ventas de hoy" para revisarla.`);
    } else if (resultado.tipo === "sesion") {
      avisar("pendiente", "Venta guardada en la tablet", "La sesión venció: vuelve a iniciar sesión para enviarla.");
    } else {
      avisar("pendiente", "Sin internet: venta guardada", "Se envía sola apenas vuelva la conexión.");
    }
  };

  return (
    <div className="tactil flex h-dvh flex-col overflow-hidden">
      {/* Encabezado */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 bg-cafe px-4 py-3 text-crema sm:px-6">
        <p className="whitespace-nowrap font-titulo text-2xl font-extrabold leading-none sm:text-3xl">
          Bendito <span className="text-mostaza">Perro</span> Caliente
        </p>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Chip onClick={() => void sincronizar()} tono={enLinea ? "normal" : "alerta"} etiqueta="Conexión">
            {enLinea ? <Wifi className="size-5" /> : <WifiOff className="size-5" />}
            <span className="hidden md:inline">{enLinea ? "En línea" : "Sin internet"}</span>
            {pendientes > 0 && <span className="rounded-full bg-mostaza px-2 text-sm text-cafe">{pendientes} por enviar</span>}
          </Chip>
          {alertas.length > 0 && (
            <Chip onClick={() => setVerAlertas(true)} tono="alerta" etiqueta="Insumos por reordenar">
              <PackageOpen className="size-5" />
              <span>{alertas.length}</span>
              <span className="hidden lg:inline">por reordenar</span>
            </Chip>
          )}
          <Chip onClick={() => setVerTurno(true)} tono={turno === null ? "alerta" : "normal"} etiqueta="Turno">
            <Store className="size-5" />
            <span className="hidden md:inline">
              {turno === undefined ? "Turno…" : turno ? `Turno ${horaBogota(turno.abierto_en)}` : "Abrir turno"}
            </span>
          </Chip>
          <Chip onClick={() => setVerVentas(true)} etiqueta="Ventas de hoy">
            <ClipboardList className="size-5" />
            <span className="hidden md:inline">Ventas</span>
          </Chip>
          {perfil.rol === "socio" && (
            <Link href="/panel" aria-label="Panel de socios" className="grid size-12 place-items-center rounded-full active:bg-cafe-700">
              <LayoutDashboard className="size-6" />
            </Link>
          )}
          <form action="/salir" method="post">
            <button aria-label="Cerrar sesión" className="grid size-12 place-items-center rounded-full active:bg-cafe-700">
              <LogOut className="size-6" />
            </button>
          </form>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Catálogo */}
        <main className="flex min-w-0 flex-1 flex-col">
          <nav className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 pt-4 sm:px-6">
            {catalogo?.categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoriaId(c.id)}
                className={`h-14 shrink-0 rounded-full px-7 font-etiqueta text-lg font-extrabold uppercase tracking-wide ${
                  c.id === categoriaId ? "bg-cafe text-crema" : "text-cafe ring-2 ring-cafe-100 active:bg-cafe-100"
                }`}
              >
                {c.nombre}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-4 pb-28 pt-3 sm:px-6 lg:pb-6">
            {!catalogo ? (
              <p className="py-20 text-center text-lg text-cafe-300">
                No pudimos cargar el menú. Revisa la conexión y recarga la página.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {productosPorCategoria.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => tocarProducto(p)}
                    className="flex min-h-36 flex-col justify-between rounded-3xl bg-crema p-5 text-left shadow-sm ring-2 ring-cafe-100 transition-transform active:scale-[0.97] active:bg-crema-200"
                  >
                    <span className="font-titulo text-2xl font-extrabold leading-tight sm:text-[1.7rem]">{p.nombre}</span>
                    <span className="mt-3 flex flex-wrap items-end justify-between gap-2">
                      <span className="numeros font-titulo text-3xl font-extrabold text-rojo">{cop(p.precio)}</span>
                      {p.toppings.length > 0 && (
                        <span className="rounded-full bg-mostaza-100 px-3 py-1 font-etiqueta text-xs font-semibold uppercase">Toppings</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </main>

        {/* Pedido: columna fija en tablet, hoja deslizable en celular */}
        <aside className="hidden w-[400px] shrink-0 border-l-2 border-cafe-100 bg-crema-200/40 lg:block">
          <PanelPedido
            lineas={lineas}
            bebidas={bebidas}
            alCambiarCantidad={cambiarCantidad}
            alEditar={(l) => setArmando({ producto: l.producto, linea: l })}
            alAgregarBebida={(b) => setLineas((ls) => agregarLinea(ls, b, []))}
            alVaciar={() => setLineas([])}
            alCobrar={setCobrando}
          />
        </aside>
      </div>

      <button
        onClick={() => setVerPedidoMovil(true)}
        className="fixed inset-x-4 bottom-4 z-30 flex h-18 items-center justify-between rounded-2xl bg-cafe px-6 text-crema shadow-xl lg:hidden"
      >
        <span className="flex items-center gap-3 font-etiqueta text-lg font-semibold">
          <ShoppingBag className="size-6 text-mostaza" /> Ver pedido {unidades > 0 && `(${unidades})`}
        </span>
        <span className="numeros font-titulo text-3xl font-extrabold text-mostaza">{cop(total)}</span>
      </button>
      {verPedidoMovil && (
        <Modal abierto alCerrar={() => setVerPedidoMovil(false)} titulo="Tu pedido" ancho="max-w-lg">
          <div className="-mx-6 -my-5 h-[70dvh]">
            <PanelPedido
              lineas={lineas}
              bebidas={bebidas}
              alCambiarCantidad={cambiarCantidad}
              alEditar={(l) => setArmando({ producto: l.producto, linea: l })}
              alAgregarBebida={(b) => setLineas((ls) => agregarLinea(ls, b, []))}
              alVaciar={() => setLineas([])}
              alCobrar={setCobrando}
            />
          </div>
        </Modal>
      )}

      {armando && (
        <ModalPerro
          producto={armando.producto}
          lineaEditada={armando.linea}
          alCerrar={() => setArmando(null)}
          alConfirmar={(toppings, cantidad) => {
            setLineas((ls) => {
              const sinEditada = armando.linea ? ls.filter((l) => l.clave !== armando.linea!.clave) : ls;
              return agregarLinea(sinEditada, armando.producto, toppings, cantidad);
            });
            setArmando(null);
          }}
        />
      )}

      {cobrando && lineas.length > 0 && (
        <ModalCobro metodo={cobrando} total={total} alCerrar={() => setCobrando(null)} alConfirmar={() => confirmarVenta(cobrando)} />
      )}

      {verVentas && (
        <ModalVentasHoy
          cola={cola}
          alCerrar={() => setVerVentas(false)}
          alReintentar={() => void sincronizar()}
          alDescartar={descartar}
          alAnular={(m) => {
            avisar("exito", m, "El inventario se devolvió.");
            void refrescarEstado();
          }}
        />
      )}

      {verTurno && turno !== undefined && (
        <ModalTurno
          turno={turno}
          pendientes={pendientes}
          alCerrar={() => setVerTurno(false)}
          alCambiar={(m) => {
            avisar("exito", m);
            void refrescarEstado();
          }}
        />
      )}

      {verAlertas && (
        <Modal abierto alCerrar={() => setVerAlertas(false)} titulo="Por reordenar">
          <ul className="space-y-2">
            {alertas.map((a) => (
              <li key={a.insumo_id} className="flex items-baseline justify-between rounded-2xl bg-mostaza-100/60 px-5 py-3 ring-2 ring-mostaza">
                <span className="font-etiqueta text-lg font-semibold">{a.nombre}</span>
                <span className="numeros text-lg">
                  quedan <strong>{cantidadInsumo(Math.max(a.stock_actual, 0), a.unidad)}</strong>
                  <span className="text-cafe-700"> · mínimo {cantidadInsumo(a.stock_minimo, a.unidad)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-cafe-700">Avísale a un socio para hacer el pedido.</p>
        </Modal>
      )}

      <Avisos avisos={avisos} />
    </div>
  );
}

function Chip({
  children,
  onClick,
  etiqueta,
  tono = "normal",
}: {
  children: React.ReactNode;
  onClick: () => void;
  etiqueta: string;
  tono?: "normal" | "alerta";
}) {
  return (
    <button
      onClick={onClick}
      aria-label={etiqueta}
      className={`flex h-12 items-center gap-2 rounded-full px-4 font-etiqueta text-base font-semibold ${
        tono === "alerta" ? "bg-mostaza text-cafe" : "bg-cafe-700 text-crema active:bg-cafe"
      }`}
    >
      {children}
    </button>
  );
}
