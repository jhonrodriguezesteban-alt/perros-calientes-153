"use client";

import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { db, fechaCorta, type Insumo } from "@/lib/admin";
import { cantidadInsumo, cop } from "@/lib/formato";
import { ModalInsumo } from "./modal-insumo";
import {
  aNumero,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Entrada,
  EntradaNumero,
  exigir,
  Insignia,
  mensajeError,
  MensajeError,
  Subtitulo,
  Tarjeta,
  useDatos,
  Vacio,
} from "./ui";

interface Movimiento {
  id: number;
  tipo: string;
  cantidad: number;
  nota: string | null;
  creado_en: string;
  insumos: { nombre: string; unidad: Insumo["unidad"] } | null;
}

const NOMBRE_MOVIMIENTO: Record<string, string> = {
  inicial: "Inventario inicial",
  compra: "Compra",
  consumo_venta: "Venta",
  reverso_venta: "Venta anulada",
  ajuste: "Ajuste por conteo",
  merma: "Merma / daño",
};

async function cargarInventario() {
  const [insumos, movimientos] = await Promise.all([
    db().from("insumos").select("*").order("nombre").returns<Insumo[]>(),
    db()
      .from("movimientos_inventario")
      .select("id, tipo, cantidad, nota, creado_en, insumos(nombre, unidad)")
      .neq("tipo", "consumo_venta")
      .order("creado_en", { ascending: false })
      .limit(25)
      .returns<Movimiento[]>(),
  ]);
  return { insumos: exigir(insumos), movimientos: exigir(movimientos) };
}

export function costoTexto(i: Pick<Insumo, "costo_unitario" | "unidad">) {
  const decimales = i.costo_unitario < 100 ? 2 : 0;
  const valor = i.costo_unitario.toLocaleString("es-CO", { maximumFractionDigits: decimales, minimumFractionDigits: 0 });
  return `$${valor}/${i.unidad === "und" ? "und" : i.unidad}`;
}

export function InventarioAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarInventario);
  const [busqueda, setBusqueda] = useState("");
  const [soloReordenar, setSoloReordenar] = useState(false);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [editando, setEditando] = useState<Insumo | "nuevo" | null>(null);
  const [ajustando, setAjustando] = useState<Insumo | null>(null);

  const insumos = useMemo(
    () =>
      (data?.insumos ?? []).filter(
        (i) =>
          (mostrarInactivos || i.activo) &&
          (!soloReordenar || i.stock_actual <= i.stock_minimo) &&
          i.nombre.toLowerCase().includes(busqueda.toLowerCase()),
      ),
    [data, busqueda, soloReordenar, mostrarInactivos],
  );
  const activos = (data?.insumos ?? []).filter((i) => i.activo);
  const porReordenar = activos.filter((i) => i.stock_actual <= i.stock_minimo).length;
  const valorInventario = activos.reduce((s, i) => s + Math.max(i.stock_actual, 0) * i.costo_unitario, 0);
  const estimados = activos.filter((i) => i.es_estimado).length;

  return (
    <div className="space-y-6">
      <Encabezado
        titulo="Inventario"
        descripcion="Lo que hay en el contenedor. Las ventas lo descuentan y las compras lo suman solas."
        accion={
          <Boton onClick={() => setEditando("nuevo")}>
            <Plus className="size-5" /> Nuevo insumo
          </Boton>
        }
      />

      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra etiqueta="Insumos activos" valor={String(activos.length)} />
            <Cifra etiqueta="Por reordenar" valor={String(porReordenar)} alerta={porReordenar > 0} />
            <Cifra etiqueta="Valor en inventario" valor={cop(valorInventario)} />
            <Cifra etiqueta="Costos estimados" valor={String(estimados)} alerta={estimados > 0} />
          </div>

          <Tarjeta>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute left-3 top-3.5 size-5 text-cafe-300" />
                <Entrada value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar insumo" className="pl-10" />
              </div>
              <Filtro activo={soloReordenar} onClick={() => setSoloReordenar((v) => !v)}>
                Solo por reordenar
              </Filtro>
              <Filtro activo={mostrarInactivos} onClick={() => setMostrarInactivos((v) => !v)}>
                Ver inactivos
              </Filtro>
            </div>

            {insumos.length === 0 ? (
              <Vacio>No hay insumos con ese filtro.</Vacio>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left">
                  <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                    <tr className="border-b-2 border-cafe-100">
                      <th className="px-2 py-2">Insumo</th>
                      <th className="px-2 py-2 text-right">Hay</th>
                      <th className="px-2 py-2 text-right">Mínimo</th>
                      <th className="px-2 py-2 text-right">Costo</th>
                      <th className="px-2 py-2 text-right">Valor</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {insumos.map((i) => {
                      const bajo = i.stock_actual <= i.stock_minimo;
                      return (
                        <tr key={i.id} className={`border-b border-cafe-100 ${i.activo ? "" : "opacity-50"}`}>
                          <td className="px-2 py-3">
                            <p className="font-etiqueta font-semibold">{i.nombre}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {bajo && i.activo && <Insignia tono={i.stock_actual < 0 ? "peligro" : "alerta"}>{i.stock_actual < 0 ? "Negativo: falta registrar compra" : "Reordenar"}</Insignia>}
                              {i.es_estimado && <Insignia>Costo estimado</Insignia>}
                              {!i.activo && <Insignia>Inactivo</Insignia>}
                            </div>
                          </td>
                          <td className={`numeros px-2 py-3 text-right font-semibold ${bajo ? "text-rojo" : ""}`}>
                            {cantidadInsumo(i.stock_actual, i.unidad)}
                          </td>
                          <td className="numeros px-2 py-3 text-right text-cafe-700">{cantidadInsumo(i.stock_minimo, i.unidad)}</td>
                          <td className="numeros px-2 py-3 text-right">{costoTexto(i)}</td>
                          <td className="numeros px-2 py-3 text-right">{cop(Math.max(i.stock_actual, 0) * i.costo_unitario)}</td>
                          <td className="px-2 py-3">
                            <div className="flex justify-end gap-2">
                              <Boton variante="suave" className="min-h-10 px-3 text-sm" onClick={() => setAjustando(i)}>
                                <SlidersHorizontal className="size-4" /> Ajustar
                              </Boton>
                              <Boton variante="suave" className="min-h-10 px-3 text-sm" onClick={() => setEditando(i)}>
                                Editar
                              </Boton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>

          <Tarjeta>
            <Subtitulo>Últimos movimientos (sin ventas)</Subtitulo>
            {data.movimientos.length === 0 ? (
              <Vacio>Todavía no hay compras ni ajustes registrados.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.movimientos.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                    <span>
                      <span className="font-etiqueta font-semibold">{m.insumos?.nombre}</span>
                      <span className="text-cafe-700"> · {NOMBRE_MOVIMIENTO[m.tipo] ?? m.tipo}</span>
                      {m.nota && <span className="text-cafe-300"> · {m.nota}</span>}
                    </span>
                    <span className="numeros shrink-0 text-right">
                      <span className={m.cantidad < 0 ? "text-rojo" : ""}>
                        {m.cantidad > 0 ? "+" : ""}
                        {m.insumos ? cantidadInsumo(m.cantidad, m.insumos.unidad) : m.cantidad}
                      </span>
                      <span className="ml-2 text-sm text-cafe-300">{fechaCorta(m.creado_en)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {editando && (
        <ModalInsumo
          insumo={editando === "nuevo" ? undefined : editando}
          alCerrar={() => setEditando(null)}
          alGuardar={() => {
            setEditando(null);
            recargar();
          }}
        />
      )}
      {ajustando && (
        <ModalAjuste
          insumo={ajustando}
          alCerrar={() => setAjustando(null)}
          alGuardar={() => {
            setAjustando(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

type ModoAjuste = "conteo" | "merma" | "inicial";

function ModalAjuste({ insumo, alCerrar, alGuardar }: { insumo: Insumo; alCerrar: () => void; alGuardar: () => void }) {
  const [modo, setModo] = useState<ModoAjuste>("conteo");
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const n = aNumero(cantidad);
  const u = insumo.unidad === "und" ? "unidades" : insumo.unidad;

  const delta = n === null ? null : modo === "conteo" ? n - insumo.stock_actual : modo === "merma" ? -Math.abs(n) : Math.abs(n);

  const guardar = async () => {
    setError(null);
    if (delta === null || delta === 0) return setError(modo === "conteo" ? "La cantidad contada es igual a la del sistema." : "Escribe la cantidad.");
    if (modo === "merma" && !nota.trim()) return setError("Escribe qué pasó (se dañó, se cayó…).");
    setGuardando(true);
    try {
      exigir(
        await db().rpc("ajustar_stock", {
          p_insumo_id: insumo.id,
          p_tipo: modo === "conteo" ? "ajuste" : modo,
          p_cantidad: delta,
          p_nota: nota.trim() || (modo === "conteo" ? "Conteo físico" : null),
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
      titulo={`Ajustar ${insumo.nombre}`}
      pie={
        <Boton onClick={guardar} cargando={guardando} className="w-full">
          Guardar ajuste
        </Boton>
      }
    >
      <p className="mb-4 text-cafe-700">
        El sistema dice que hay <strong className="numeros">{cantidadInsumo(insumo.stock_actual, insumo.unidad)}</strong>.
      </p>
      <div className="mb-4 grid grid-cols-3 gap-2">
        {(
          [
            ["conteo", "Conté y hay…"],
            ["merma", "Se dañó / perdió"],
            ["inicial", "Llegó sin compra"],
          ] as const
        ).map(([m, t]) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={`min-h-14 rounded-2xl px-2 font-etiqueta text-sm font-semibold ${modo === m ? "bg-cafe text-crema" : "ring-2 ring-cafe-100"}`}
          >
            {t}
          </button>
        ))}
      </div>
      <Campo
        etiqueta={modo === "conteo" ? `¿Cuánto hay realmente? (${u})` : `Cantidad (${u})`}
        ayuda={
          delta !== null && delta !== 0
            ? `Se ${delta > 0 ? "suman" : "restan"} ${cantidadInsumo(Math.abs(delta), insumo.unidad)} → quedan ${cantidadInsumo(insumo.stock_actual + delta, insumo.unidad)}`
            : undefined
        }
      >
        <EntradaNumero valor={cantidad} alCambiar={setCantidad} autoFocus />
      </Campo>
      <Campo etiqueta="Nota" className="mt-3">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder={modo === "merma" ? "Obligatoria: qué pasó" : "Opcional"} />
      </Campo>
      {modo === "inicial" && (
        <p className="mt-3 text-sm text-cafe-700">Si fue una compra, mejor regístrala en Compras: así queda el costo y el gasto.</p>
      )}
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}

function Cifra({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${alerta ? "bg-mostaza-100 ring-2 ring-mostaza" : "bg-crema ring-2 ring-cafe-100"}`}>
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className="numeros font-titulo text-2xl font-extrabold sm:text-3xl">{valor}</p>
    </div>
  );
}

function Filtro({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`min-h-12 rounded-full px-4 font-etiqueta text-sm font-semibold ${activo ? "bg-cafe text-crema" : "ring-2 ring-cafe-100"}`}
    >
      {children}
    </button>
  );
}
