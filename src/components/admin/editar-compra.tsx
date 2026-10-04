"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { db, FAMILIAS, hoyBogota, PAGOS_COMPRA, type Compra, type Insumo, type PagoCompra } from "@/lib/admin";
import { cop } from "@/lib/formato";
import { ModalInsumo } from "./modal-insumo";
import { aNumero, Boton, Campo, Entrada, EntradaNumero, EntradaPesos, exigir, mensajeError, MensajeError, Selector } from "./ui";

interface Renglon {
  clave: number;
  insumo_id: number | null;
  cantidad: string;
  costo_total: number | null;
  /** Equipo o utensilio (no va al inventario): qué es. */
  equipo?: string;
}

let siguiente = 1;

/** Corregir una compra ya registrada: datos, pago y renglones. El inventario y los costos se ajustan solos. */
export function ModalEditarCompra({
  compra,
  insumos,
  socios,
  alCerrar,
  alGuardar,
}: {
  compra: Compra;
  insumos: Insumo[];
  socios: { id: string; nombre: string }[];
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const sufijo = compra.proveedor ? ` · ${compra.proveedor}` : "";
  const [fecha, setFecha] = useState(compra.fecha);
  const [proveedor, setProveedor] = useState(compra.proveedor ?? "");
  const [pago, setPago] = useState<PagoCompra | null>(compra.pagado_con);
  const [socioId, setSocioId] = useState(
    compra.pagado_con === "socio" ? (socios.find((s) => s.nombre === compra.socio?.nombre)?.id ?? "") : "",
  );
  const [renglones, setRenglones] = useState<Renglon[]>([
    ...compra.compra_items.map((i) => ({ clave: siguiente++, insumo_id: i.insumo_id, cantidad: String(i.cantidad), costo_total: i.costo_total })),
    ...compra.equipos.map((e) => ({
      clave: siguiente++,
      insumo_id: null,
      cantidad: "",
      costo_total: e.monto,
      equipo: (e.descripcion ?? "").endsWith(sufijo) ? (e.descripcion ?? "").slice(0, (e.descripcion ?? "").length - sufijo.length) : (e.descripcion ?? ""),
    })),
  ]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [creandoPara, setCreandoPara] = useState<number | null>(null);
  const [nuevos, setNuevos] = useState<Insumo[]>([]);

  // Insumos de la compra que ya no están activos también se pueden elegir
  const lista: Pick<Insumo, "id" | "nombre" | "unidad" | "familia">[] = [...insumos, ...nuevos];
  for (const i of compra.compra_items) {
    if (i.insumos && !lista.some((x) => x.id === i.insumo_id)) {
      lista.push({ id: i.insumo_id, nombre: i.insumos.nombre, unidad: i.insumos.unidad, familia: "otros" });
    }
  }
  const porId = new Map(lista.map((i) => [i.id, i]));
  const total = renglones.reduce((s, r) => s + (r.costo_total ?? 0), 0);
  const esCaja = compra.pagado_con === "caja";

  const cambiar = (clave: number, cambio: Partial<Renglon>) =>
    setRenglones((rs) => rs.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));

  const guardar = async () => {
    setError(null);
    const items = renglones.filter((r) => r.equipo === undefined);
    const equipos = renglones.filter((r) => r.equipo !== undefined);
    if (renglones.length === 0) return setError("La compra necesita al menos un producto.");
    for (const r of items) {
      if (r.insumo_id === null) return setError("Elige el insumo de cada renglón (o quítalo).");
      const c = aNumero(r.cantidad);
      if (!c || c <= 0) return setError(`Falta la cantidad de ${porId.get(r.insumo_id)?.nombre}.`);
      if (r.costo_total === null) return setError(`Falta cuánto costó ${porId.get(r.insumo_id)?.nombre}.`);
    }
    for (const r of equipos) {
      if (!r.equipo?.trim()) return setError("Escribe qué equipo o utensilio se compró.");
      if (!r.costo_total) return setError(`Falta cuánto costó ${r.equipo}.`);
    }
    if (!pago) return setError("Elige con qué se pagó la compra.");
    if (pago === "socio" && !socioId) return setError("Elige qué socio puso la plata.");
    if (compra.monto_socio && compra.monto_socio >= total) {
      return setError(`Un socio puso ${cop(compra.monto_socio)}: el total debe ser mayor. Quita primero esa parte.`);
    }
    setGuardando(true);
    try {
      exigir(
        await db().rpc("editar_compra", {
          p_compra_id: compra.id,
          p_compra: {
            fecha,
            proveedor,
            pagado_con: pago,
            socio_id: pago === "socio" ? socioId : null,
            items: items.map((r) => ({ insumo_id: r.insumo_id, cantidad: aNumero(r.cantidad), costo_total: r.costo_total })),
            equipos: equipos.map((r) => ({ descripcion: r.equipo!.trim(), costo_total: r.costo_total })),
          },
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
      ancho="max-w-3xl"
      titulo="Editar compra"
      pie={
        <div className="flex items-center justify-between gap-4">
          <span className="numeros font-titulo text-2xl font-extrabold text-rojo">{cop(total)}</span>
          <Boton onClick={guardar} cargando={guardando}>
            Guardar cambios
          </Boton>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha">
          <Entrada type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Proveedor">
          <Entrada value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Campo>
      </div>

      <div className="mt-5 space-y-3">
        {renglones.map((r) => {
          const ins = r.insumo_id !== null ? porId.get(r.insumo_id) : undefined;
          return (
            <div key={r.clave} className="grid gap-2 rounded-2xl bg-crema-200/60 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
              <Campo etiqueta="Insumo">
                <Selector
                  value={r.equipo !== undefined ? "equipo" : (r.insumo_id ?? "")}
                  onChange={(e) =>
                    e.target.value === "nuevo"
                      ? setCreandoPara(r.clave)
                      : e.target.value === "equipo"
                      ? cambiar(r.clave, { insumo_id: null, equipo: "" })
                      : cambiar(r.clave, { insumo_id: e.target.value ? Number(e.target.value) : null, equipo: undefined })
                  }
                >
                  <option value="">Elige un insumo…</option>
                  {FAMILIAS.map((f) => {
                    const deFamilia = lista.filter((i) => (i.familia ?? "perro") === f.id);
                    return deFamilia.length === 0 ? null : (
                      <optgroup key={f.id} label={f.nombre}>
                        {deFamilia.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  <option value="nuevo">+ Crear insumo nuevo…</option>
                  <option value="equipo">Equipo o utensilio (no va al inventario)</option>
                </Selector>
              </Campo>
              {r.equipo !== undefined ? (
                <Campo etiqueta="¿Qué es?">
                  <Entrada value={r.equipo} onChange={(e) => cambiar(r.clave, { equipo: e.target.value })} placeholder="Ej. Pinzas de acero" />
                </Campo>
              ) : (
                <Campo etiqueta={`Cantidad${ins ? ` (${ins.unidad === "und" ? "unidades" : ins.unidad})` : ""}`}>
                  <EntradaNumero valor={r.cantidad} alCambiar={(v) => cambiar(r.clave, { cantidad: v })} />
                </Campo>
              )}
              <Campo etiqueta="Costó en total">
                <EntradaPesos valor={r.costo_total} alCambiar={(v) => cambiar(r.clave, { costo_total: v })} placeholder="$0" />
              </Campo>
              <button
                aria-label="Quitar"
                onClick={() => setRenglones((rs) => rs.filter((x) => x.clave !== r.clave))}
                className="grid size-12 place-items-center rounded-xl text-cafe-700 active:bg-cafe-100"
              >
                <Trash2 className="size-5" />
              </button>
            </div>
          );
        })}
        <Boton
          variante="suave"
          onClick={() => setRenglones((rs) => [...rs, { clave: siguiente++, insumo_id: null, cantidad: "", costo_total: null }])}
        >
          <Plus className="size-5" /> Agregar otro producto
        </Boton>
      </div>

      <div className="mt-5 border-t-2 border-cafe-100 pt-4">
        <p className="mb-2 font-etiqueta text-sm font-semibold text-cafe-700">¿Con qué se pagó?</p>
        {esCaja ? (
          <p className="text-sm text-cafe-700">
            Efectivo de la caja. No se puede cambiar aquí porque ya salió del cierre de ese día; el retiro queda con el valor nuevo.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PAGOS_COMPRA.filter((p) => p.id !== "caja").map((p) => (
              <button
                key={p.id}
                onClick={() => setPago(p.id)}
                className={`min-h-11 rounded-xl px-4 font-etiqueta text-sm font-semibold ${
                  pago === p.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                }`}
              >
                {p.nombre}
              </button>
            ))}
          </div>
        )}
        {pago === "socio" && (
          <Selector value={socioId} onChange={(e) => setSocioId(e.target.value)} className="mt-3 w-auto min-w-56">
            <option value="">¿Qué socio puso la plata?</option>
            {socios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Selector>
        )}
      </div>

      <p className="mt-4 text-sm text-cafe-700">Al guardar se corrigen el inventario, el costo de los insumos y el gasto de esta compra.</p>
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
      {creandoPara !== null && (
        <ModalInsumo
          alCerrar={() => setCreandoPara(null)}
          alGuardar={(nuevo) => {
            setNuevos((ns) => [...ns, nuevo]);
            cambiar(creandoPara, { insumo_id: nuevo.id, equipo: undefined });
            setCreandoPara(null);
          }}
        />
      )}
    </Modal>
  );
}
