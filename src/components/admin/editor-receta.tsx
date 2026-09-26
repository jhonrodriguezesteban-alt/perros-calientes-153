"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Insumo } from "@/lib/admin";
import { cop } from "@/lib/formato";
import { ModalInsumo } from "./modal-insumo";
import { aNumero, Boton, EntradaNumero, Selector } from "./ui";

export interface LineaReceta {
  clave: number;
  insumo_id: number | null;
  cantidad: string;
}

let clave = 1;
export const nuevaLinea = (insumo_id: number | null = null, cantidad = ""): LineaReceta => ({ clave: clave++, insumo_id, cantidad });

export function costoLineas(lineas: LineaReceta[], insumos: Map<number, Insumo>) {
  return lineas.reduce((s, l) => s + (aNumero(l.cantidad) ?? 0) * (l.insumo_id ? insumos.get(l.insumo_id)?.costo_unitario ?? 0 : 0), 0);
}

/** Lista de insumos + cantidad (receta de un producto o porción de un topping), con su costo. */
export function EditorReceta({
  lineas,
  alCambiar,
  insumos,
  alCrearInsumo,
  titulo = "Receta",
}: {
  lineas: LineaReceta[];
  alCambiar: (l: LineaReceta[]) => void;
  insumos: Insumo[];
  alCrearInsumo: (i: Insumo) => void;
  titulo?: string;
}) {
  const [creandoPara, setCreandoPara] = useState<number | null>(null);
  const mapa = new Map(insumos.map((i) => [i.id, i]));
  const cambiar = (k: number, c: Partial<LineaReceta>) => alCambiar(lineas.map((l) => (l.clave === k ? { ...l, ...c } : l)));

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="font-etiqueta text-sm font-semibold text-cafe-700">{titulo}</p>
        <p className="font-etiqueta text-sm font-semibold">
          Costo: <span className="numeros text-rojo">{cop(costoLineas(lineas, mapa))}</span>
        </p>
      </div>
      <div className="space-y-2">
        {lineas.map((l) => {
          const ins = l.insumo_id ? mapa.get(l.insumo_id) : undefined;
          const costo = ins ? (aNumero(l.cantidad) ?? 0) * ins.costo_unitario : 0;
          return (
            <div key={l.clave} className="grid grid-cols-[1fr_110px_90px_auto] items-center gap-2">
              <Selector
                value={l.insumo_id ?? ""}
                onChange={(e) => (e.target.value === "nuevo" ? setCreandoPara(l.clave) : cambiar(l.clave, { insumo_id: e.target.value ? Number(e.target.value) : null }))}
              >
                <option value="">Insumo…</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre}
                    {i.es_estimado ? " (costo estimado)" : ""}
                  </option>
                ))}
                <option value="nuevo">+ Crear insumo nuevo…</option>
              </Selector>
              <div className="relative">
                <EntradaNumero valor={l.cantidad} alCambiar={(v) => cambiar(l.clave, { cantidad: v })} placeholder="Cant." className="pr-10" />
                <span className="pointer-events-none absolute right-3 top-3 text-sm text-cafe-300">{ins ? (ins.unidad === "und" ? "und" : ins.unidad) : ""}</span>
              </div>
              <span className="numeros text-right text-sm text-cafe-700">{cop(costo)}</span>
              <button
                aria-label="Quitar insumo"
                onClick={() => alCambiar(lineas.length > 1 ? lineas.filter((x) => x.clave !== l.clave) : [nuevaLinea()])}
                className="grid size-11 place-items-center rounded-xl text-cafe-300 active:bg-cafe-100"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Boton variante="suave" className="mt-2 min-h-10 text-sm" onClick={() => alCambiar([...lineas, nuevaLinea()])}>
        <Plus className="size-4" /> Agregar insumo
      </Boton>
      {creandoPara !== null && (
        <ModalInsumo
          alCerrar={() => setCreandoPara(null)}
          alGuardar={(nuevo) => {
            alCrearInsumo(nuevo);
            cambiar(creandoPara, { insumo_id: nuevo.id });
            setCreandoPara(null);
          }}
        />
      )}
    </div>
  );
}

/** Valida y convierte las líneas; devuelve un mensaje de error o las filas listas. */
export function lineasValidas(lineas: LineaReceta[]): { error?: string; filas: { insumo_id: number; cantidad: number }[] } {
  const usadas = lineas.filter((l) => l.insumo_id !== null || l.cantidad.trim() !== "");
  if (usadas.length === 0) return { error: "Agrega al menos un insumo con su cantidad, para saber el costo.", filas: [] };
  const filas: { insumo_id: number; cantidad: number }[] = [];
  for (const l of usadas) {
    const c = aNumero(l.cantidad);
    if (!l.insumo_id) return { error: "Hay una línea sin insumo.", filas: [] };
    if (!c || c <= 0) return { error: "Hay un insumo sin cantidad.", filas: [] };
    if (filas.some((f) => f.insumo_id === l.insumo_id)) return { error: "Hay un insumo repetido.", filas: [] };
    filas.push({ insumo_id: l.insumo_id, cantidad: c });
  }
  return { filas };
}
