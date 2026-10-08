"use client";

import { ChefHat, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cantidadInsumo, cop } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";

export interface Preparacion {
  insumo_id: number;
  nombre: string;
  unidad: "g" | "ml" | "und";
  rendimiento: number;
  ingredientes: {
    ingrediente_id: number;
    nombre: string;
    unidad: "g" | "ml" | "und";
    cantidad: number;
    /** Solo llega para socios. */
    costo_unitario: number | null;
  }[];
}

export async function cargarPreparaciones() {
  const { data, error } = await supabaseNavegador().rpc("preparaciones_lista");
  if (error) throw error;
  return (data ?? []) as Preparacion[];
}

const redondear = (n: number) => String(Math.round(n * 100) / 100);
const aNumero = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/** Registrar una tanda: descuenta los ingredientes y suma lo preparado al inventario. */
export function ModalPrepararTanda({
  preparacion: p,
  alCerrar,
  alListo,
}: {
  preparacion: Preparacion;
  alCerrar: () => void;
  alListo: (mensaje: string) => void;
}) {
  const receta = (n: number) => Object.fromEntries(p.ingredientes.map((i) => [i.ingrediente_id, redondear(i.cantidad * n)]));
  const [tandas, setTandas] = useState(1);
  const [cantidades, setCantidades] = useState<Record<number, string>>(() => receta(1));
  const [producido, setProducido] = useState(() => redondear(p.rendimiento));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al cambiar el número de tandas, se recalculan las cantidades de la receta
  const cambiarTandas = (n: number) => {
    setTandas(n);
    setCantidades(receta(n));
    setProducido(redondear(p.rendimiento * n));
  };

  const costo = p.ingredientes.every((i) => i.costo_unitario !== null)
    ? p.ingredientes.reduce((s, i) => s + aNumero(cantidades[i.ingrediente_id] ?? "0") * (i.costo_unitario ?? 0), 0)
    : null;
  const salio = aNumero(producido);

  const guardar = async () => {
    setError(null);
    if (!(salio > 0)) return setError("Escribe cuánto salió.");
    if (p.ingredientes.some((i) => !(aNumero(cantidades[i.ingrediente_id] ?? "") > 0))) return setError("Revisa las cantidades usadas.");
    setGuardando(true);
    const { error } = await supabaseNavegador().rpc("preparar_tanda", {
      p_insumo_id: p.insumo_id,
      p_items: p.ingredientes.map((i) => ({ ingrediente_id: i.ingrediente_id, cantidad: aNumero(cantidades[i.ingrediente_id]) })),
      p_producido: salio,
      p_nota: tandas === 1 ? null : `${tandas} tandas`,
    });
    setGuardando(false);
    if (error) return setError(error.code ? error.message : "Sin conexión. Intenta de nuevo.");
    alListo(`${p.nombre}: ${cantidadInsumo(salio, p.unidad)} preparados`);
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={
        <span className="flex items-center gap-2">
          <ChefHat className="size-6 text-rojo" /> Preparar {p.nombre.toLowerCase()}
        </span>
      }
      pie={
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="min-h-14 w-full rounded-2xl bg-rojo font-etiqueta text-lg font-extrabold text-crema disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Registrar tanda"}
        </button>
      }
    >
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-crema-200 p-3">
        <span className="font-etiqueta font-semibold">¿Cuántas tandas?</span>
        <span className="flex items-center gap-2">
          <button
            aria-label="Menos"
            onClick={() => cambiarTandas(Math.max(0.5, tandas - 0.5))}
            className="grid size-11 place-items-center rounded-xl ring-2 ring-cafe-100 active:bg-cafe-100"
          >
            <Minus className="size-5" />
          </button>
          <span className="numeros w-12 text-center font-titulo text-2xl font-extrabold">{tandas.toLocaleString("es-CO")}</span>
          <button
            aria-label="Más"
            onClick={() => cambiarTandas(tandas + 0.5)}
            className="grid size-11 place-items-center rounded-xl ring-2 ring-cafe-100 active:bg-cafe-100"
          >
            <Plus className="size-5" />
          </button>
        </span>
      </div>

      <p className="mb-2 mt-5 font-etiqueta font-semibold">Lo que se usó</p>
      <ul className="space-y-2">
        {p.ingredientes.map((i) => (
          <li key={i.ingrediente_id} className="flex items-center justify-between gap-3">
            <span className="font-etiqueta">{i.nombre}</span>
            <span className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={cantidades[i.ingrediente_id] ?? ""}
                onChange={(e) => setCantidades((c) => ({ ...c, [i.ingrediente_id]: e.target.value.replace(/[^\d.,]/g, "") }))}
                className="numeros h-12 w-28 rounded-xl bg-crema px-3 text-right font-semibold ring-2 ring-cafe-100 outline-none focus:ring-cafe"
              />
              <span className="w-10 text-sm text-cafe-700">{i.unidad}</span>
            </span>
          </li>
        ))}
      </ul>

      <label className="mt-5 flex items-center justify-between gap-3">
        <span className="font-etiqueta font-semibold">¿Cuánto salió?</span>
        <span className="flex items-center gap-2">
          <input
            inputMode="decimal"
            value={producido}
            onChange={(e) => setProducido(e.target.value.replace(/[^\d.,]/g, ""))}
            className="numeros h-12 w-28 rounded-xl bg-crema px-3 text-right font-semibold ring-2 ring-cafe outline-none"
          />
          <span className="w-10 text-sm text-cafe-700">{p.unidad}</span>
        </span>
      </label>
      <p className="mt-2 text-sm text-cafe-700">
        Si usaste otras cantidades o salió más o menos, cámbialo. Los ingredientes se descuentan del inventario y lo preparado se suma.
      </p>
      {costo !== null && salio > 0 && (
        <p className="mt-3 rounded-2xl bg-crema-200 px-4 py-2 text-sm">
          Costo de la tanda <strong className="numeros">{cop(costo)}</strong> · sale a{" "}
          <strong className="numeros">
            ${(costo / salio).toLocaleString("es-CO", { maximumFractionDigits: 2 })}/{p.unidad}
          </strong>
        </p>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}
