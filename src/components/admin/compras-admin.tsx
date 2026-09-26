"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { db, fechaCorta, hoyBogota, type Compra, type Insumo, type Solicitud } from "@/lib/admin";
import { cantidadInsumo, cop } from "@/lib/formato";
import { costoTexto } from "./inventario-admin";
import { ModalInsumo } from "./modal-insumo";
import {
  aNumero,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Entrada,
  EntradaNumero,
  EntradaPesos,
  exigir,
  mensajeError,
  MensajeError,
  Selector,
  Subtitulo,
  Tarjeta,
  useDatos,
  Vacio,
} from "./ui";

interface Linea {
  clave: number;
  insumo_id: number | null;
  cantidad: string;
  costo_total: number | null;
}

async function cargarCompras() {
  const [insumos, compras, solicitudes] = await Promise.all([
    db().from("insumos").select("*").eq("activo", true).order("nombre").returns<Insumo[]>(),
    db()
      .from("compras")
      .select("id, fecha, proveedor, gasto_id, compra_items(cantidad, costo_total, insumos(nombre, unidad))")
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(20)
      .returns<Compra[]>(),
    db()
      .from("solicitudes_pedido")
      .select("id, insumo_id, descripcion, cantidad, unidad, nota, estado, creado_en, atendido_en, respuesta, solicitante:perfiles!solicitado_por(nombre)")
      .eq("estado", "pendiente")
      .order("creado_en")
      .returns<Solicitud[]>(),
  ]);
  return { insumos: exigir(insumos), compras: exigir(compras), solicitudes: exigir(solicitudes) };
}

let siguienteClave = 1;
const lineaVacia = (insumo_id: number | null = null, cantidad = ""): Linea => ({
  clave: siguienteClave++,
  insumo_id,
  cantidad,
  costo_total: null,
});

export function ComprasAdmin({ solicitudInicial }: { solicitudInicial?: string }) {
  const { data, error, cargando, recargar } = useDatos(cargarCompras);
  const [fecha, setFecha] = useState(hoyBogota());
  const [proveedor, setProveedor] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  const [solicitudes, setSolicitudes] = useState<Set<string>>(new Set());
  const [registrarGasto, setRegistrarGasto] = useState(true);
  const [creandoInsumoPara, setCreandoInsumoPara] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [inicialAplicada, setInicialAplicada] = useState(false);

  const insumos = useMemo(() => new Map((data?.insumos ?? []).map((i) => [i.id, i])), [data]);
  const proveedores = useMemo(
    () => [...new Set((data?.compras ?? []).map((c) => c.proveedor).filter(Boolean) as string[])],
    [data],
  );

  const alternarSolicitud = useCallback(
    (s: Solicitud) => {
      setSolicitudes((prev) => {
        const n = new Set(prev);
        if (n.has(s.id)) n.delete(s.id);
        else n.add(s.id);
        return n;
      });
      // Al marcar una solicitud, se agrega su insumo a la compra si no está.
      if (s.insumo_id && !solicitudes.has(s.id)) {
        setLineas((ls) => {
          if (ls.some((l) => l.insumo_id === s.insumo_id)) return ls;
          const vacias = ls.filter((l) => l.insumo_id !== null);
          return [...vacias, lineaVacia(s.insumo_id, s.cantidad ? String(s.cantidad) : "")];
        });
      }
    },
    [solicitudes],
  );

  // Si se llegó desde "Comprar" en una solicitud, marcarla una sola vez.
  if (data && solicitudInicial && !inicialAplicada) {
    const s = data.solicitudes.find((x) => x.id === solicitudInicial);
    setInicialAplicada(true);
    if (s) alternarSolicitud(s);
  }

  const total = lineas.reduce((s, l) => s + (l.costo_total ?? 0), 0);

  const cambiarLinea = (clave: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const guardar = async () => {
    setAviso(null);
    const validas = lineas.filter((l) => l.insumo_id !== null);
    if (validas.length === 0) return setAviso({ tipo: "error", texto: "Agrega al menos un insumo." });
    for (const l of validas) {
      const c = aNumero(l.cantidad);
      if (!c || c <= 0) return setAviso({ tipo: "error", texto: `Falta la cantidad de ${insumos.get(l.insumo_id!)?.nombre}.` });
      if (l.costo_total === null) return setAviso({ tipo: "error", texto: `Falta cuánto costó ${insumos.get(l.insumo_id!)?.nombre}.` });
    }
    setGuardando(true);
    try {
      exigir(
        await db().rpc("registrar_compra", {
          p_compra: {
            fecha,
            proveedor,
            registrar_gasto: registrarGasto,
            items: validas.map((l) => ({ insumo_id: l.insumo_id, cantidad: aNumero(l.cantidad), costo_total: l.costo_total })),
            solicitudes: [...solicitudes],
          },
        }),
      );
      setAviso({ tipo: "ok", texto: `Compra de ${cop(total)} registrada. El inventario y los costos ya se actualizaron.` });
      setLineas([lineaVacia()]);
      setSolicitudes(new Set());
      setProveedor("");
      recargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e) });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-6">
      <Encabezado
        titulo="Compras"
        descripcion="Registra lo que compras: suma al inventario, actualiza el costo promedio y queda como gasto."
      />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {data && (
        <>
          <Tarjeta>
            <Subtitulo>Nueva compra</Subtitulo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Fecha">
                <Entrada type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
              </Campo>
              <Campo etiqueta="Proveedor">
                <Entrada list="proveedores" value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ej. Calypso del Caribe" />
                <datalist id="proveedores">
                  {proveedores.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Campo>
            </div>

            {data.solicitudes.length > 0 && (
              <div className="mt-5 rounded-2xl bg-mostaza-100/60 p-4 ring-2 ring-mostaza">
                <p className="mb-2 font-etiqueta text-sm font-semibold">Solicitudes pendientes que atiende esta compra:</p>
                <div className="flex flex-wrap gap-2">
                  {data.solicitudes.map((s) => (
                    <label key={s.id} className="flex min-h-11 items-center gap-2 rounded-xl bg-crema px-3 ring-1 ring-cafe-100">
                      <input type="checkbox" className="size-5 accent-cafe" checked={solicitudes.has(s.id)} onChange={() => alternarSolicitud(s)} />
                      <span className="font-etiqueta text-sm font-semibold">
                        {s.descripcion}
                        {s.cantidad && s.unidad ? ` · ${cantidadInsumo(s.cantidad, s.unidad)}` : ""}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-3">
              {lineas.map((l) => {
                const ins = l.insumo_id ? insumos.get(l.insumo_id) : undefined;
                const cant = aNumero(l.cantidad);
                const unitario = ins && cant && l.costo_total !== null ? l.costo_total / cant : null;
                const variacion = ins && unitario !== null && ins.costo_unitario > 0 ? (unitario - ins.costo_unitario) / ins.costo_unitario : null;
                return (
                  <div key={l.clave} className="grid gap-2 rounded-2xl bg-crema-200/60 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
                    <Campo etiqueta="Insumo">
                      <Selector
                        value={l.insumo_id ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "nuevo") setCreandoInsumoPara(l.clave);
                          else cambiarLinea(l.clave, { insumo_id: e.target.value ? Number(e.target.value) : null });
                        }}
                      >
                        <option value="">Elige un insumo…</option>
                        {data.insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre}
                          </option>
                        ))}
                        <option value="nuevo">+ Crear insumo nuevo…</option>
                      </Selector>
                    </Campo>
                    <Campo etiqueta={`Cantidad${ins ? ` (${ins.unidad === "und" ? "unidades" : ins.unidad})` : ""}`}>
                      <EntradaNumero valor={l.cantidad} alCambiar={(v) => cambiarLinea(l.clave, { cantidad: v })} placeholder="Ej. 1280" />
                    </Campo>
                    <Campo etiqueta="Costó en total">
                      <EntradaPesos valor={l.costo_total} alCambiar={(v) => cambiarLinea(l.clave, { costo_total: v })} placeholder="$0" />
                    </Campo>
                    <button
                      aria-label="Quitar"
                      onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : [lineaVacia()]))}
                      className="grid size-12 place-items-center rounded-xl text-cafe-700 active:bg-cafe-100"
                    >
                      <Trash2 className="size-5" />
                    </button>
                    {ins && unitario !== null && (
                      <p className="flex items-center gap-2 text-sm text-cafe-700 sm:col-span-4">
                        Sale a <strong className="numeros">{costoTexto({ costo_unitario: unitario, unidad: ins.unidad })}</strong>
                        <span className="text-cafe-300">(antes {costoTexto(ins)})</span>
                        {variacion !== null && Math.abs(variacion) >= 0.005 && (
                          <span className={`inline-flex items-center gap-1 font-semibold ${variacion > 0 ? "text-rojo" : "text-exito"}`}>
                            {variacion > 0 ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
                            {Math.abs(variacion * 100).toFixed(0)}%
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
              <Boton variante="suave" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
                <Plus className="size-5" /> Agregar otro insumo
              </Boton>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t-2 border-cafe-100 pt-4">
              <label className="flex items-center gap-3 font-etiqueta text-sm font-semibold">
                <input type="checkbox" className="size-5 accent-cafe" checked={registrarGasto} onChange={(e) => setRegistrarGasto(e.target.checked)} />
                Registrar también como gasto (categoría Insumos)
              </label>
              <div className="flex items-center gap-4">
                <span className="numeros font-titulo text-3xl font-extrabold text-rojo">{cop(total)}</span>
                <Boton onClick={guardar} cargando={guardando}>
                  Registrar compra
                </Boton>
              </div>
            </div>
            {aviso && (
              <div className="mt-4">
                {aviso.tipo === "error" ? (
                  <MensajeError>{aviso.texto}</MensajeError>
                ) : (
                  <p className="rounded-2xl bg-cafe px-4 py-3 font-semibold text-crema">{aviso.texto}</p>
                )}
              </div>
            )}
          </Tarjeta>

          <Tarjeta>
            <Subtitulo>Compras recientes</Subtitulo>
            {data.compras.length === 0 ? (
              <Vacio>Todavía no hay compras registradas.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.compras.map((c) => {
                  const totalCompra = c.compra_items.reduce((s, i) => s + i.costo_total, 0);
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="font-etiqueta font-semibold">
                          {fechaCorta(c.fecha)} · {c.proveedor ?? "Sin proveedor"}
                        </p>
                        <span className="numeros font-titulo text-xl font-extrabold">{cop(totalCompra)}</span>
                      </div>
                      <p className="text-sm text-cafe-700">
                        {c.compra_items
                          .map((i) => `${i.insumos?.nombre} ${i.insumos ? cantidadInsumo(i.cantidad, i.insumos.unidad) : i.cantidad} (${cop(i.costo_total)})`)
                          .join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {creandoInsumoPara !== null && (
        <ModalInsumo
          alCerrar={() => setCreandoInsumoPara(null)}
          alGuardar={(nuevo) => {
            cambiarLinea(creandoInsumoPara, { insumo_id: nuevo.id });
            setCreandoInsumoPara(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
