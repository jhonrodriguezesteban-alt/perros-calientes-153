"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { db, nombreUnidad, type Insumo, type Unidad } from "@/lib/admin";
import { cop } from "@/lib/formato";
import { aNumero, Boton, Campo, Entrada, EntradaNumero, EntradaPesos, exigir, mensajeError, MensajeError, Selector } from "./ui";

/** Crear o editar un insumo. El costo se puede calcular desde la presentación que se compra. */
export function ModalInsumo({
  insumo,
  nombreInicial = "",
  alCerrar,
  alGuardar,
}: {
  insumo?: Insumo;
  nombreInicial?: string;
  alCerrar: () => void;
  alGuardar: (insumo: Insumo) => void;
}) {
  const [nombre, setNombre] = useState(insumo?.nombre ?? nombreInicial);
  const [unidad, setUnidad] = useState<Unidad>(insumo?.unidad ?? "g");
  const [costo, setCosto] = useState(insumo ? String(insumo.costo_unitario) : "");
  const [minimo, setMinimo] = useState(insumo ? String(insumo.stock_minimo) : "");
  const [nota, setNota] = useState(insumo?.nota ?? "");
  const [estimado, setEstimado] = useState(insumo?.es_estimado ?? false);
  const [activo, setActivo] = useState(insumo?.activo ?? true);
  const [motivo, setMotivo] = useState("");
  const [paquetePrecio, setPaquetePrecio] = useState<number | null>(null);
  const [paqueteContenido, setPaqueteContenido] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const costoNum = aNumero(costo);
  const cambiaCosto = insumo && costoNum !== null && Math.abs(costoNum - insumo.costo_unitario) > 0.00005;

  const calcularDesdePaquete = () => {
    const contenido = aNumero(paqueteContenido);
    if (paquetePrecio && contenido && contenido > 0) setCosto(String(Math.round((paquetePrecio / contenido) * 10000) / 10000));
  };

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) return setError("Escribe el nombre del insumo.");
    if (costoNum === null || costoNum < 0) return setError("Escribe el costo por " + nombreUnidad[unidad].replace(/s$/, "") + ".");
    if (cambiaCosto && !motivo.trim()) return setError("Escribe por qué cambia el costo (queda registrado).");
    setGuardando(true);
    try {
      const datos = {
        nombre: nombre.trim(),
        stock_minimo: aNumero(minimo) ?? 0,
        nota: nota.trim() || null,
        es_estimado: estimado,
        activo,
      };
      let guardado: Insumo;
      if (insumo) {
        exigir(await db().from("insumos").update(datos).eq("id", insumo.id).select().single());
        if (cambiaCosto) {
          exigir(
            await db().rpc("ajustar_costo_insumo", { p_insumo_id: insumo.id, p_costo: costoNum, p_motivo: motivo.trim() }),
          );
        }
        guardado = exigir(await db().from("insumos").select("*").eq("id", insumo.id).single<Insumo>());
      } else {
        guardado = exigir(
          await db()
            .from("insumos")
            .insert({ ...datos, unidad, costo_unitario: costoNum })
            .select("*")
            .single<Insumo>(),
        );
      }
      alGuardar(guardado);
    } catch (e) {
      const m = mensajeError(e);
      setError(/duplicate|unique/i.test(m) ? "Ya existe un insumo con ese nombre." : m);
    } finally {
      setGuardando(false);
    }
  };

  const u = unidad === "und" ? "unidad" : unidad;
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={insumo ? `Editar ${insumo.nombre}` : "Nuevo insumo"}
      pie={
        <Boton onClick={guardar} cargando={guardando} className="w-full">
          Guardar insumo
        </Boton>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" className="sm:col-span-2">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Queso cheddar" />
        </Campo>
        <Campo etiqueta="Se mide en" ayuda={insumo ? "No se puede cambiar después de creado." : undefined}>
          <Selector value={unidad} disabled={!!insumo} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            <option value="g">Gramos (g)</option>
            <option value="ml">Mililitros (ml)</option>
            <option value="und">Unidades</option>
          </Selector>
        </Campo>
        <Campo etiqueta={`Costo por ${u}`} ayuda={costoNum !== null ? `${cop(costoNum)} por ${u}` : undefined}>
          <EntradaNumero valor={costo} alCambiar={setCosto} placeholder="Ej. 22,5" />
        </Campo>

        <div className="rounded-2xl bg-crema-200 p-4 sm:col-span-2">
          <p className="mb-2 font-etiqueta text-sm font-semibold">¿No sabes el costo por {u}? Calcúlalo con lo que compras:</p>
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <Campo etiqueta="Precio del paquete">
              <EntradaPesos valor={paquetePrecio} alCambiar={setPaquetePrecio} placeholder="$31.301" />
            </Campo>
            <Campo etiqueta={`Trae (${unidad === "und" ? "unidades" : unidad})`}>
              <EntradaNumero valor={paqueteContenido} alCambiar={setPaqueteContenido} placeholder="1280" />
            </Campo>
            <Boton variante="suave" onClick={calcularDesdePaquete}>
              Calcular
            </Boton>
          </div>
        </div>

        {cambiaCosto && (
          <Campo etiqueta="¿Por qué cambia el costo?" className="sm:col-span-2" ayuda="Lo normal es que el costo cambie solo al registrar compras.">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Lote dañado, corrección" />
          </Campo>
        )}

        <Campo etiqueta={`Avisar cuando queden menos de (${unidad})`}>
          <EntradaNumero valor={minimo} alCambiar={setMinimo} placeholder="Ej. 500" />
        </Campo>
        <Campo etiqueta="Nota (proveedor, presentación)">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Libra en La Inglesa" />
        </Campo>
        <label className="flex items-center gap-3 font-etiqueta text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-cafe" checked={estimado} onChange={(e) => setEstimado(e.target.checked)} />
          El costo es estimado (falta confirmar)
        </label>
        {insumo && (
          <label className="flex items-center gap-3 font-etiqueta text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-cafe" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        )}
      </div>
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}
