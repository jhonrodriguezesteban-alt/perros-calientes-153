"use client";

import { ChefHat, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cargarPreparaciones, ModalPrepararTanda, type Preparacion } from "@/components/preparar-tanda";
import { db, type Insumo } from "@/lib/admin";
import { cantidadInsumo, cop } from "@/lib/formato";
import { aNumero, Boton, Campo, EntradaNumero, exigir, mensajeError, MensajeError, Selector, Subtitulo, Tarjeta, useDatos } from "./ui";

/** Preparaciones (ej. salsa de huevo): su receta y registrar tandas. */
export function TarjetaPreparaciones({ insumos, alCambiar }: { insumos: Insumo[]; alCambiar: () => void }) {
  const { data, error, recargar } = useDatos(cargarPreparaciones);
  const [preparando, setPreparando] = useState<Preparacion | null>(null);
  const [editando, setEditando] = useState<Preparacion | "nueva" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const porId = new Map(insumos.map((i) => [i.id, i]));

  return (
    <Tarjeta>
      <Subtitulo
        accion={
          <Boton variante="suave" className="min-h-10 px-3 text-sm" onClick={() => setEditando("nueva")}>
            <Plus className="size-4" /> Nueva preparación
          </Boton>
        }
      >
        Preparaciones
      </Subtitulo>
      <p className="-mt-2 mb-4 text-sm text-cafe-700">
        Insumos que se hacen con otros. Cada tanda descuenta los ingredientes y suma lo preparado con su costo. Andrea también las registra desde el
        POS (botón “Preparar”).
      </p>
      {error && <MensajeError>{error}</MensajeError>}
      {aviso && <p className="mb-3 rounded-2xl bg-cafe px-4 py-3 font-semibold text-crema">{aviso}</p>}
      {data && data.length === 0 && <p className="text-cafe-300">Todavía no hay preparaciones.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {(data ?? []).map((p) => {
          const ins = porId.get(p.insumo_id);
          const costoTanda = p.ingredientes.reduce((s, i) => s + i.cantidad * (i.costo_unitario ?? 0), 0);
          return (
            <div key={p.insumo_id} className="rounded-2xl bg-crema-200/60 p-4 ring-2 ring-cafe-100">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex items-center gap-2 font-etiqueta font-extrabold">
                  <ChefHat className="size-5 text-rojo" /> {p.nombre}
                </p>
                {ins && <span className="numeros text-sm font-semibold">Hay {cantidadInsumo(ins.stock_actual, ins.unidad)}</span>}
              </div>
              <ul className="numeros mt-2 space-y-0.5 text-sm text-cafe-700">
                {p.ingredientes.map((i) => (
                  <li key={i.ingrediente_id} className="flex justify-between gap-2">
                    <span>{i.nombre}</span>
                    <span>{cantidadInsumo(i.cantidad, i.unidad)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-2 border-t border-cafe-100 pt-1 font-semibold text-cafe">
                  <span>Rinde</span>
                  <span>{cantidadInsumo(p.rendimiento, p.unidad)}</span>
                </li>
              </ul>
              <p className="mt-2 text-sm">
                Tanda {cop(costoTanda)} · sale a{" "}
                <strong className="numeros">
                  ${(costoTanda / p.rendimiento).toLocaleString("es-CO", { maximumFractionDigits: 2 })}/{p.unidad}
                </strong>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Boton className="!min-h-10 px-3 text-sm" onClick={() => setPreparando(p)}>
                  <ChefHat className="size-4" /> Preparar tanda
                </Boton>
                <Boton variante="suave" className="!min-h-10 px-3 text-sm" onClick={() => setEditando(p)}>
                  <Pencil className="size-4" /> Receta
                </Boton>
              </div>
            </div>
          );
        })}
      </div>

      {preparando && (
        <ModalPrepararTanda
          preparacion={preparando}
          alCerrar={() => setPreparando(null)}
          alListo={(m) => {
            setPreparando(null);
            setAviso(m);
            recargar();
            alCambiar();
          }}
        />
      )}
      {editando && (
        <ModalReceta
          preparacion={editando === "nueva" ? null : editando}
          insumos={insumos}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
    </Tarjeta>
  );
}

let clave = 1;

function ModalReceta({
  preparacion,
  insumos,
  alCerrar,
  alGuardar,
}: {
  preparacion: Preparacion | null;
  insumos: Insumo[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const activos = insumos.filter((i) => i.activo);
  const [insumoId, setInsumoId] = useState<number | null>(preparacion?.insumo_id ?? null);
  const [rinde, setRinde] = useState(preparacion ? String(preparacion.rendimiento) : "");
  const [items, setItems] = useState(
    (preparacion?.ingredientes ?? [{ ingrediente_id: 0, cantidad: 0 }]).map((i) => ({
      clave: clave++,
      ingrediente_id: i.ingrediente_id || null,
      cantidad: i.cantidad ? String(i.cantidad) : "",
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const producto = insumoId ? activos.find((i) => i.id === insumoId) : undefined;

  const guardar = async () => {
    setError(null);
    if (!insumoId) return setError("Elige qué se prepara (créalo antes en Inventario si no existe).");
    const r = aNumero(rinde);
    if (!r || r <= 0) return setError("Escribe cuánto rinde una tanda.");
    const lista = items.filter((i) => i.ingrediente_id || i.cantidad);
    if (lista.length === 0 || lista.some((i) => !i.ingrediente_id || !(aNumero(i.cantidad)! > 0))) {
      return setError("Elige cada ingrediente y su cantidad.");
    }
    setGuardando(true);
    try {
      exigir(
        await db().rpc("guardar_preparacion", {
          p_insumo_id: insumoId,
          p_rendimiento: r,
          p_items: lista.map((i) => ({ ingrediente_id: i.ingrediente_id, cantidad: aNumero(i.cantidad) })),
          p_nota: null,
        }),
      );
      alGuardar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={preparacion ? `Receta de ${preparacion.nombre.toLowerCase()}` : "Nueva preparación"}
      pie={
        <Boton onClick={() => void guardar()} cargando={guardando} className="w-full">
          Guardar receta
        </Boton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="¿Qué se prepara?">
          <Selector value={insumoId ?? ""} disabled={!!preparacion} onChange={(e) => setInsumoId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elige el insumo…</option>
            {activos.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta={`Una tanda rinde${producto ? ` (${producto.unidad})` : ""}`}>
          <EntradaNumero valor={rinde} alCambiar={setRinde} placeholder="Ej. 1150" />
        </Campo>
      </div>
      <p className="mb-2 mt-5 font-etiqueta text-sm font-semibold">Ingredientes de una tanda</p>
      <div className="space-y-2">
        {items.map((it) => {
          const ing = it.ingrediente_id ? activos.find((i) => i.id === it.ingrediente_id) : undefined;
          return (
            <div key={it.clave} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
              <Selector
                value={it.ingrediente_id ?? ""}
                onChange={(e) =>
                  setItems((xs) => xs.map((x) => (x.clave === it.clave ? { ...x, ingrediente_id: e.target.value ? Number(e.target.value) : null } : x)))
                }
              >
                <option value="">Ingrediente…</option>
                {activos
                  .filter((i) => i.id !== insumoId)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
              </Selector>
              <EntradaNumero
                valor={it.cantidad}
                alCambiar={(v) => setItems((xs) => xs.map((x) => (x.clave === it.clave ? { ...x, cantidad: v } : x)))}
                placeholder={ing ? ing.unidad : "Cant."}
              />
              <button
                aria-label="Quitar"
                onClick={() => setItems((xs) => (xs.length > 1 ? xs.filter((x) => x.clave !== it.clave) : xs))}
                className="grid size-12 place-items-center rounded-xl text-cafe-700 active:bg-cafe-100"
              >
                <Trash2 className="size-5" />
              </button>
            </div>
          );
        })}
      </div>
      <Boton variante="suave" className="mt-3" onClick={() => setItems((xs) => [...xs, { clave: clave++, ingrediente_id: null, cantidad: "" }])}>
        <Plus className="size-5" /> Agregar ingrediente
      </Boton>
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}
