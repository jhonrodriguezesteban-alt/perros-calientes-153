"use client";

import { Check, Clock, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { cantidadInsumo, horaBogota } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";

interface InsumoPedido {
  insumo_id: number;
  nombre: string;
  unidad: "g" | "ml" | "und";
  stock_actual: number;
  stock_minimo: number;
}

interface MiSolicitud {
  id: string;
  descripcion: string;
  cantidad: number | null;
  unidad: InsumoPedido["unidad"] | null;
  estado: "pendiente" | "comprada" | "descartada";
  creado_en: string;
  respuesta: string | null;
}

async function cargar() {
  const supabase = supabaseNavegador();
  const [insumos, solicitudes] = await Promise.all([
    supabase.rpc("insumos_para_pedido"),
    supabase
      .from("solicitudes_pedido")
      .select("id, descripcion, cantidad, unidad, estado, creado_en, respuesta")
      .order("creado_en", { ascending: false })
      .limit(10),
  ]);
  if (insumos.error) throw insumos.error;
  if (solicitudes.error) throw solicitudes.error;
  return { insumos: insumos.data as InsumoPedido[], solicitudes: solicitudes.data as MiSolicitud[] };
}

/** Pedir un insumo a los socios. Ellos lo ven en su panel y responden. */
export function ModalSolicitar({
  insumoInicial,
  alCerrar,
  alEnviar,
}: {
  insumoInicial?: number;
  alCerrar: () => void;
  alEnviar: (mensaje: string) => void;
}) {
  const [datos, setDatos] = useState<Awaited<ReturnType<typeof cargar>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState<InsumoPedido | "otro" | null>(null);
  const [otro, setOtro] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);

  const alCargar = useCallback((d: Awaited<ReturnType<typeof cargar>>) => {
    setDatos(d);
    if (insumoInicial) setElegido(d.insumos.find((i) => i.insumo_id === insumoInicial) ?? null);
  }, [insumoInicial]);

  useEffect(() => {
    let activo = true;
    cargar()
      .then((d) => activo && alCargar(d))
      .catch(() => activo && setError("No pudimos cargar la lista. Revisa el internet."));
    return () => {
      activo = false;
    };
  }, [alCargar]);

  const filtrados = useMemo(
    () =>
      (datos?.insumos ?? [])
        .filter((i) => i.nombre.toLowerCase().includes(busqueda.toLowerCase()))
        .sort((a, b) => Number(b.stock_actual <= b.stock_minimo) - Number(a.stock_actual <= a.stock_minimo)),
    [datos, busqueda],
  );

  const enviar = async () => {
    if (!elegido) return;
    if (elegido === "otro" && !otro.trim()) return setError("Escribe qué hace falta.");
    setError(null);
    setEnviando(true);
    const cant = Number(cantidad.replace(",", "."));
    const { data: u } = await supabaseNavegador().auth.getUser();
    const { error } = await supabaseNavegador()
      .from("solicitudes_pedido")
      .insert({
        insumo_id: elegido === "otro" ? null : elegido.insumo_id,
        descripcion: elegido === "otro" ? otro.trim() : elegido.nombre,
        cantidad: cantidad && cant > 0 ? cant : null,
        unidad: elegido === "otro" ? null : elegido.unidad,
        nota: nota.trim() || null,
        solicitado_por: u.user?.id,
      });
    setEnviando(false);
    if (error) setError(error.code ? "No se pudo enviar: " + error.message : "Sin conexión. Intenta de nuevo.");
    else alEnviar(`Pedido de ${elegido === "otro" ? otro.trim() : elegido.nombre} enviado a los socios`);
  };

  const unidadTexto = elegido && elegido !== "otro" ? (elegido.unidad === "und" ? "unidades" : elegido.unidad) : "";

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="Pedir insumo"
      ancho="max-w-2xl"
      pie={
        elegido && (
          <button
            onClick={enviar}
            disabled={enviando}
            className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-xl font-extrabold text-white active:bg-rojo-700 disabled:bg-cafe-300"
          >
            {enviando && <Loader2 className="size-6 animate-spin" />}
            Enviar pedido a los socios
          </button>
        )
      }
    >
      {!datos && !error && (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-8 animate-spin text-cafe-300" />
        </div>
      )}

      {datos && !elegido && (
        <>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-4 size-6 text-cafe-300" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="¿Qué hace falta?"
              className="h-14 w-full rounded-2xl bg-crema pl-12 pr-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtrados.map((i) => {
              const bajo = i.stock_actual <= i.stock_minimo;
              return (
                <button
                  key={i.insumo_id}
                  onClick={() => setElegido(i)}
                  className={`min-h-16 rounded-2xl px-3 py-2 text-left ${bajo ? "bg-mostaza-100 ring-2 ring-mostaza" : "bg-crema ring-2 ring-cafe-100"} active:bg-cafe-100`}
                >
                  <span className="block font-etiqueta font-semibold leading-tight">{i.nombre}</span>
                  <span className="text-sm text-cafe-700">quedan {cantidadInsumo(Math.max(i.stock_actual, 0), i.unidad)}</span>
                </button>
              );
            })}
            <button onClick={() => setElegido("otro")} className="min-h-16 rounded-2xl px-3 py-2 text-left ring-2 ring-dashed ring-cafe-300">
              <span className="font-etiqueta font-semibold">Otra cosa…</span>
            </button>
          </div>

          {datos.solicitudes.length > 0 && (
            <div className="mt-6">
              <p className="mb-2 font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-700">Pedidos recientes</p>
              <ul className="space-y-2">
                {datos.solicitudes.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3 rounded-xl bg-crema-200/60 px-3 py-2">
                    <span>
                      <span className="font-etiqueta font-semibold">{s.descripcion}</span>
                      {s.cantidad && s.unidad && <span className="text-cafe-700"> · {cantidadInsumo(s.cantidad, s.unidad)}</span>}
                      {s.respuesta && <span className="block text-sm text-cafe-700">“{s.respuesta}”</span>}
                    </span>
                    <EstadoSolicitud estado={s.estado} hora={horaBogota(s.creado_en)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {datos && elegido && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl bg-cafe px-5 py-4 text-crema">
            <span className="font-titulo text-2xl font-extrabold">{elegido === "otro" ? "Otra cosa" : elegido.nombre}</span>
            <button onClick={() => setElegido(null)} className="font-etiqueta text-sm font-semibold text-mostaza">
              Cambiar
            </button>
          </div>
          {elegido === "otro" && (
            <input
              value={otro}
              onChange={(e) => setOtro(e.target.value)}
              placeholder="¿Qué hace falta? Ej. bolsas, gas, guantes"
              className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
            />
          )}
          <label className="block">
            <span className="mb-1 block font-etiqueta font-semibold">¿Cuánto? {unidadTexto && `(${unidadTexto})`} — opcional</span>
            <input
              inputMode="decimal"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^\d.,]/g, ""))}
              className="numeros h-14 w-full rounded-2xl bg-crema px-4 text-xl ring-2 ring-cafe-100 outline-none focus:ring-cafe"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-etiqueta font-semibold">Nota — opcional</span>
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. se acaba hoy en la noche"
              className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
            />
          </label>
        </div>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function EstadoSolicitud({ estado, hora }: { estado: MiSolicitud["estado"]; hora: string }) {
  if (estado === "comprada")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-cafe px-3 py-1 font-etiqueta text-xs font-semibold text-crema">
        <Check className="size-4" /> Comprado
      </span>
    );
  if (estado === "descartada")
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-crema-200 px-3 py-1 font-etiqueta text-xs font-semibold">
        <X className="size-4" /> No se compra
      </span>
    );
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-mostaza-100 px-3 py-1 font-etiqueta text-xs font-semibold ring-1 ring-mostaza">
      <Clock className="size-4" /> Pendiente · {hora}
    </span>
  );
}
