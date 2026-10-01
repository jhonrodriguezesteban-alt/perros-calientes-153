"use client";

import { ArrowDown, ArrowUp, Camera, ChevronDown, Images, Plus, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { db, FAMILIAS, fechaCorta, hoyBogota, PAGOS_COMPRA, type Compra, type Insumo, type PagoCompra, type Solicitud } from "@/lib/admin";
import { NOMBRE_MEDIO_FACTURA, prepararFoto, type FacturaLeida, type ItemLeido } from "@/lib/factura";
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
  Insignia,
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
  /** Equipo o utensilio que no va al inventario: qué es. */
  equipo?: string;
  /** Si vino de leer la foto de la factura. */
  leido?: ItemLeido;
}

const SELECT_COMPRA =
  "id, fecha, proveedor, gasto_id, pagado_con, monto_socio, socio:perfiles!compras_socio_id_fkey(nombre), compra_items(cantidad, costo_total, insumos(nombre, unidad)), equipos:gastos!gastos_compra_id_fkey(monto, descripcion)";

async function cargarCompras() {
  const [insumos, compras, solicitudes, socios, prestadas] = await Promise.all([
    db().from("insumos").select("*").eq("activo", true).order("nombre").returns<Insumo[]>(),
    db()
      .from("compras")
      .select(SELECT_COMPRA)
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(30)
      .returns<Compra[]>(),
    db()
      .from("solicitudes_pedido")
      .select("id, insumo_id, descripcion, cantidad, unidad, nota, estado, creado_en, atendido_en, respuesta, solicitante:perfiles!solicitado_por(nombre)")
      .eq("estado", "pendiente")
      .order("creado_en")
      .returns<Solicitud[]>(),
    db().from("perfiles").select("id, nombre").eq("rol", "socio").eq("activo", true).order("nombre"),
    db().from("compras").select(SELECT_COMPRA).or("pagado_con.eq.socio,monto_socio.not.is.null").returns<Compra[]>(),
  ]);
  return {
    insumos: exigir(insumos),
    compras: exigir(compras),
    solicitudes: exigir(solicitudes),
    socios: exigir(socios) as { id: string; nombre: string }[],
    prestadas: exigir(prestadas),
  };
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
  const [pagadoCon, setPagadoCon] = useState<PagoCompra | null>(null);
  const [socioId, setSocioId] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [creandoInsumoPara, setCreandoInsumoPara] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [inicialAplicada, setInicialAplicada] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [lectura, setLectura] = useState<FacturaLeida | null>(null);
  const camara = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);

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

  // Lee la foto (o fotos) de la factura con Claude y llena el formulario para revisarlo.
  const leerFactura = async (archivos: FileList | null) => {
    if (!archivos || archivos.length === 0) return;
    setAviso(null);
    setLeyendo(true);
    try {
      const fotos = await Promise.all([...archivos].slice(0, 4).map(prepararFoto));
      const res = await fetch("/api/compras/leer-factura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fotos }),
      });
      const cuerpo = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
      if (!res.ok || !cuerpo) throw new Error(cuerpo?.error ?? "No se pudo leer la factura. Revisa la conexión e intenta de nuevo.");
      const f = cuerpo as FacturaLeida;
      if (f.items.length === 0) throw new Error(f.observaciones ?? "No encontré productos en la foto.");
      setLectura(f);
      if (f.proveedor) setProveedor(f.proveedor);
      if (f.fecha && f.fecha <= hoyBogota()) setFecha(f.fecha);
      setLineas(
        f.items.map((it) => ({
          ...lineaVacia(it.insumo_id, String(Math.round(it.cantidad * 100) / 100)),
          costo_total: it.costo_total,
          equipo: it.tipo === "equipo" ? (it.nombre_sugerido ?? it.descripcion) : undefined,
          leido: it,
        })),
      );
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e) });
    } finally {
      setLeyendo(false);
      if (camara.current) camara.current.value = "";
      if (galeria.current) galeria.current.value = "";
    }
  };

  // Corregir con qué se pagó una compra ya registrada
  const cambiarPago = async (c: Compra, pago: PagoCompra) => {
    try {
      exigir(await db().from("compras").update(c.monto_socio ? { pagado_con: pago } : { pagado_con: pago, socio_id: null }).eq("id", c.id));
      recargar();
    } catch (e) {
      setAviso({ tipo: "error", texto: mensajeError(e) });
    }
  };

  const cambiarLinea = (clave: number, cambio: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));

  const guardar = async () => {
    setAviso(null);
    const validas = lineas.filter((l) => l.insumo_id !== null && l.equipo === undefined);
    const equipos = lineas.filter((l) => l.equipo !== undefined);
    if (validas.length + equipos.length === 0) return setAviso({ tipo: "error", texto: "Agrega al menos un insumo o equipo." });
    for (const l of equipos) {
      if (!l.equipo?.trim()) return setAviso({ tipo: "error", texto: "Escribe qué equipo o utensilio se compró." });
      if (!l.costo_total) return setAviso({ tipo: "error", texto: `Falta cuánto costó ${l.equipo}.` });
    }
    for (const l of validas) {
      const c = aNumero(l.cantidad);
      if (!c || c <= 0) return setAviso({ tipo: "error", texto: `Falta la cantidad de ${insumos.get(l.insumo_id!)?.nombre}.` });
      if (l.costo_total === null) return setAviso({ tipo: "error", texto: `Falta cuánto costó ${insumos.get(l.insumo_id!)?.nombre}.` });
    }
    if (!pagadoCon) return setAviso({ tipo: "error", texto: "Elige con qué se pagó la compra." });
    if (pagadoCon === "socio" && !socioId) return setAviso({ tipo: "error", texto: "Elige qué socio puso la plata." });
    setGuardando(true);
    try {
      exigir(
        await db().rpc("registrar_compra", {
          p_compra: {
            fecha,
            proveedor,
            pagado_con: pagadoCon,
            socio_id: pagadoCon === "socio" ? socioId : null,
            registrar_gasto: registrarGasto,
            items: validas.map((l) => ({ insumo_id: l.insumo_id, cantidad: aNumero(l.cantidad), costo_total: l.costo_total })),
            equipos: equipos.map((l) => ({ descripcion: l.equipo!.trim(), costo_total: l.costo_total })),
            solicitudes: [...solicitudes],
          },
        }),
      );
      setAviso({ tipo: "ok", texto: `Compra de ${cop(total)} registrada. El inventario y los costos ya se actualizaron.` });
      setLineas([lineaVacia()]);
      setSolicitudes(new Set());
      setProveedor("");
      setPagadoCon(null);
      setSocioId("");
      setLectura(null);
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
            <div className="mb-5 rounded-2xl bg-mostaza-100/60 p-4 ring-2 ring-mostaza">
              <p className="flex items-center gap-2 font-etiqueta font-extrabold">
                <Sparkles className="size-5 text-rojo" /> Llenar con la foto de la factura
              </p>
              <p className="mt-1 text-sm text-cafe-700">
                Toma la foto y se leen los productos, gramajes, cantidades, valores y el proveedor. Revisas y eliges con qué se pagó.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Boton onClick={() => camara.current?.click()} cargando={leyendo}>
                  <Camera className="size-5" /> {leyendo ? "Leyendo la factura…" : "Tomar foto"}
                </Boton>
                <Boton variante="suave" onClick={() => galeria.current?.click()} disabled={leyendo}>
                  <Images className="size-5" /> Subir foto(s)
                </Boton>
              </div>
              <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void leerFactura(e.target.files)} />
              <input ref={galeria} type="file" accept="image/*" multiple hidden onChange={(e) => void leerFactura(e.target.files)} />
              {leyendo && <p className="mt-2 text-sm text-cafe-700">Esto tarda entre 20 segundos y un minuto.</p>}
            </div>
            {lectura && <ResumenLectura lectura={lectura} total={total} />}
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
                        value={l.equipo !== undefined ? "equipo" : (l.insumo_id ?? "")}
                        onChange={(e) => {
                          if (e.target.value === "nuevo") setCreandoInsumoPara(l.clave);
                          else if (e.target.value === "equipo")
                            cambiarLinea(l.clave, { insumo_id: null, equipo: l.leido?.nombre_sugerido ?? l.leido?.descripcion ?? "" });
                          else cambiarLinea(l.clave, { insumo_id: e.target.value ? Number(e.target.value) : null, equipo: undefined });
                        }}
                      >
                        <option value="">Elige un insumo…</option>
                        {FAMILIAS.map((f) => {
                          const deFamilia = data.insumos.filter((i) => (i.familia ?? "perro") === f.id);
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
                    {l.equipo !== undefined ? (
                      <Campo etiqueta="¿Qué es?">
                        <Entrada value={l.equipo} onChange={(e) => cambiarLinea(l.clave, { equipo: e.target.value })} placeholder="Ej. Pinzas de acero" />
                      </Campo>
                    ) : (
                      <Campo etiqueta={`Cantidad${ins ? ` (${ins.unidad === "und" ? "unidades" : ins.unidad})` : ""}`}>
                        <EntradaNumero valor={l.cantidad} alCambiar={(v) => cambiarLinea(l.clave, { cantidad: v })} placeholder="Ej. 1280" />
                      </Campo>
                    )}
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
                    {l.equipo !== undefined && (
                      <p className="text-sm text-cafe-700 sm:col-span-4">Queda como gasto de inversión (Equipos), no suma al inventario.</p>
                    )}
                    {ins && unitario !== null && l.equipo === undefined && (
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
                    {l.leido && (
                      <div className="flex flex-wrap items-center gap-2 text-sm text-cafe-700 sm:col-span-4">
                        <span>
                          Factura: <strong>{l.leido.descripcion}</strong> · {l.leido.presentacion}
                        </span>
                        {l.leido.confianza !== "alta" && (
                          <Insignia tono={l.leido.confianza === "baja" ? "peligro" : "alerta"}>Revisar</Insignia>
                        )}
                        {l.leido.nota && <span className="italic">{l.leido.nota}</span>}
                        {!l.insumo_id && l.equipo === undefined && (
                          <button
                            onClick={() => setCreandoInsumoPara(l.clave)}
                            className="rounded-lg bg-mostaza px-2 py-1 font-etiqueta text-xs font-extrabold text-cafe"
                          >
                            + Crear “{l.leido.nombre_sugerido ?? l.leido.descripcion}”
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <Boton variante="suave" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>
                <Plus className="size-5" /> Agregar otro insumo
              </Boton>
            </div>

            <div className="mt-5 border-t-2 border-cafe-100 pt-4">
              <p className="mb-2 font-etiqueta text-sm font-semibold text-cafe-700">¿Con qué se pagó?</p>
              <div className="flex flex-wrap gap-2">
                {PAGOS_COMPRA.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPagadoCon(p.id)}
                    className={`min-h-11 rounded-xl px-4 font-etiqueta text-sm font-semibold ${
                      pagadoCon === p.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                    }`}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
              {pagadoCon === "socio" && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Selector value={socioId} onChange={(e) => setSocioId(e.target.value)} className="w-auto min-w-56">
                    <option value="">¿Qué socio puso la plata?</option>
                    {data.socios.map((so) => (
                      <option key={so.id} value={so.id}>
                        {so.nombre}
                      </option>
                    ))}
                  </Selector>
                  <span className="text-sm text-cafe-700">Queda anotado como plata que el negocio le debe a ese socio.</span>
                </div>
              )}
              {pagadoCon === "caja" && fecha === hoyBogota() && (
                <p className="mt-2 text-sm text-cafe-700">Sale de la caja de hoy como retiro, para que el cierre del día cuadre.</p>
              )}
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

          {data.prestadas.length > 0 && (
            <Tarjeta>
              <Subtitulo>Compras pagadas por socios (préstamos al negocio)</Subtitulo>
              <div className="flex flex-wrap gap-3">
                {[...agruparPorSocio(data.prestadas).entries()].map(([nombre, monto]) => (
                  <div key={nombre} className="rounded-2xl bg-crema-200 px-4 py-3">
                    <p className="font-etiqueta text-sm font-semibold text-cafe-700">{nombre}</p>
                    <p className="numeros font-titulo text-2xl font-extrabold">{cop(monto)}</p>
                  </div>
                ))}
              </div>
            </Tarjeta>
          )}

          <Tarjeta>
            <Subtitulo>Compras recientes</Subtitulo>
            {data.compras.length === 0 ? (
              <Vacio>Todavía no hay compras registradas.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.compras.map((c) => {
                  const totalCompra = totalDe(c);
                  return (
                    <li key={c.id} className="py-3">
                      <button onClick={() => setAbierta(abierta === c.id ? null : c.id)} className="w-full text-left">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="font-etiqueta font-semibold">
                            {fechaCorta(c.fecha)} · {c.proveedor ?? "Sin proveedor"}
                            <span className="ml-2 font-normal text-cafe-700">· {textoPago(c)}</span>
                          </p>
                          <span className="flex items-center gap-2">
                            <span className="numeros font-titulo text-xl font-extrabold">{cop(totalCompra)}</span>
                            <ChevronDown className={`size-5 transition ${abierta === c.id ? "rotate-180" : ""}`} />
                          </span>
                        </div>
                        {abierta !== c.id && (
                          <p className="truncate text-sm text-cafe-700">
                            {c.compra_items.length + c.equipos.length} {c.compra_items.length + c.equipos.length === 1 ? "producto" : "productos"}:{" "}
                            {[...c.compra_items.map((i) => i.insumos?.nombre), ...c.equipos.map((e) => e.descripcion)].join(", ")}
                          </p>
                        )}
                      </button>
                      {abierta === c.id && (
                        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-etiqueta font-semibold text-cafe-700">Se pagó con:</span>
                          <select
                            value={c.pagado_con ?? ""}
                            onChange={(e) => void cambiarPago(c, e.target.value as PagoCompra)}
                            className="h-9 rounded-lg bg-crema px-2 ring-1 ring-cafe-100"
                          >
                            <option value="" disabled>
                              Sin registrar
                            </option>
                            {PAGOS_COMPRA.filter((p) => p.id !== "socio" && p.id !== "caja").map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nombre}
                              </option>
                            ))}
                            {c.pagado_con === "socio" && <option value="socio">Lo pagó {c.socio?.nombre ?? "un socio"}</option>}
                            {c.pagado_con === "caja" && <option value="caja">Efectivo de la caja</option>}
                          </select>
                        </label>
                      )}
                      {abierta === c.id && c.pagado_con !== "socio" && (
                        <ParteSocio compra={c} total={totalDe(c)} socios={data.socios} alGuardar={recargar} alError={(t) => setAviso({ tipo: "error", texto: t })} />
                      )}
                      {abierta === c.id && (
                        <div className="-mx-2 mt-3 overflow-x-auto">
                          <table className="w-full min-w-[520px] text-sm">
                            <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                              <tr className="border-b-2 border-cafe-100">
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">Insumo</th>
                                <th className="px-2 py-2 text-right">Cantidad</th>
                                <th className="px-2 py-2 text-right">Costo unitario</th>
                                <th className="px-2 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="numeros">
                              {c.compra_items.map((i, n) => (
                                <tr key={n} className="border-b border-cafe-100">
                                  <td className="px-2 py-2 text-left text-cafe-300">{n + 1}</td>
                                  <td className="px-2 py-2 text-left font-etiqueta font-semibold">{i.insumos?.nombre}</td>
                                  <td className="px-2 py-2 text-right">{i.insumos ? cantidadInsumo(i.cantidad, i.insumos.unidad) : i.cantidad}</td>
                                  <td className="px-2 py-2 text-right text-cafe-700">
                                    {i.insumos ? costoTexto({ costo_unitario: i.costo_total / i.cantidad, unidad: i.insumos.unidad }) : "—"}
                                  </td>
                                  <td className="px-2 py-2 text-right font-semibold">{cop(i.costo_total)}</td>
                                </tr>
                              ))}
                              {c.equipos.map((e, n) => (
                                <tr key={`e${n}`} className="border-b border-cafe-100">
                                  <td className="px-2 py-2 text-left text-cafe-300">{c.compra_items.length + n + 1}</td>
                                  <td className="px-2 py-2 text-left font-etiqueta font-semibold">{e.descripcion}</td>
                                  <td colSpan={2} className="px-2 py-2 text-right text-cafe-700">Equipo (no va al inventario)</td>
                                  <td className="px-2 py-2 text-right font-semibold">{cop(e.monto)}</td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={4} className="px-2 py-2 text-right font-etiqueta font-semibold">Total</td>
                                <td className="px-2 py-2 text-right font-titulo text-lg font-extrabold">{cop(totalCompra)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
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
          {...propsInsumoNuevo(lineas.find((l) => l.clave === creandoInsumoPara))}
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

function textoPago(c: Compra) {
  if (!c.pagado_con) return "pago sin registrar";
  if (c.pagado_con === "socio") return `lo pagó ${c.socio?.nombre ?? "un socio"}`;
  const medio = PAGOS_COMPRA.find((p) => p.id === c.pagado_con)?.nombre.toLowerCase() ?? c.pagado_con;
  return c.monto_socio ? `${medio} + ${c.socio?.nombre ?? "un socio"} puso ${cop(c.monto_socio)}` : medio;
}

function agruparPorSocio(compras: Compra[]) {
  const m = new Map<string, number>();
  for (const c of compras) {
    const n = c.socio?.nombre ?? "Socio";
    m.set(n, (m.get(n) ?? 0) + (c.pagado_con === "socio" ? totalDe(c) : (c.monto_socio ?? 0)));
  }
  return m;
}

/** Un socio puso solo una parte de la compra: el resto salió del medio de pago. */
function ParteSocio({
  compra,
  total,
  socios,
  alGuardar,
  alError,
}: {
  compra: Compra;
  total: number;
  socios: { id: string; nombre: string }[];
  alGuardar: () => void;
  alError: (t: string) => void;
}) {
  const actual = socios.find((s) => s.nombre === compra.socio?.nombre)?.id ?? "";
  const [abierto, setAbierto] = useState(!!compra.monto_socio);
  const [socioId, setSocioId] = useState(actual);
  const [monto, setMonto] = useState<number | null>(compra.monto_socio);
  const [guardando, setGuardando] = useState(false);

  const guardar = async (quitar = false) => {
    if (!quitar) {
      if (!socioId) return alError("Elige qué socio puso la plata.");
      if (!monto || monto <= 0 || monto >= total) return alError(`La parte del socio debe ser mayor a $0 y menor que el total (${cop(total)}).`);
    }
    setGuardando(true);
    try {
      exigir(
        await db()
          .from("compras")
          .update(quitar ? { monto_socio: null, socio_id: null } : { monto_socio: monto, socio_id: socioId })
          .eq("id", compra.id),
      );
      if (quitar) {
        setMonto(null);
        setAbierto(false);
      }
      alGuardar();
    } catch (e) {
      alError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="mt-2 text-sm font-semibold text-cafe-700 underline underline-offset-2">
        ¿Un socio puso una parte de esta compra?
      </button>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-crema-200/60 p-3 text-sm">
      <span className="font-etiqueta font-semibold text-cafe-700">Un socio puso</span>
      <EntradaPesos valor={monto} alCambiar={setMonto} placeholder="$0" className="!h-9 !w-36" />
      <Selector value={socioId} onChange={(e) => setSocioId(e.target.value)} className="!h-9 w-auto min-w-40">
        <option value="">¿Quién?</option>
        {socios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
      </Selector>
      {monto && monto < total ? <span className="text-cafe-700">· el resto, {cop(total - monto)}, salió del medio de pago</span> : null}
      <Boton variante="secundario" className="!min-h-9 px-3 text-sm" onClick={() => void guardar()} cargando={guardando}>
        Guardar
      </Boton>
      {compra.monto_socio && (
        <button onClick={() => void guardar(true)} className="text-sm font-semibold text-rojo">
          Quitar
        </button>
      )}
    </div>
  );
}

function propsInsumoNuevo(l: Linea | undefined) {
  const it = l?.leido;
  if (!it) return {};
  return {
    nombreInicial: it.nombre_sugerido ?? it.descripcion,
    familiaInicial: it.familia_sugerida,
    unidadInicial: it.unidad,
    costoInicial: it.cantidad > 0 ? it.costo_total / it.cantidad : undefined,
  };
}

/** Lo que se leyó de la factura: total impreso vs. suma de renglones y avisos. */
function ResumenLectura({ lectura, total }: { lectura: FacturaLeida; total: number }) {
  const diferencia = lectura.total_factura !== null ? lectura.total_factura - total : 0;
  const sinInsumo = lectura.items.filter((i) => i.insumo_id === null && i.tipo !== "equipo").length;
  return (
    <div className="mb-5 space-y-1 rounded-2xl bg-crema-200/60 p-4 text-sm ring-1 ring-cafe-100">
      <p className="font-etiqueta font-semibold">
        Leí {lectura.items.length} {lectura.items.length === 1 ? "producto" : "productos"}
        {lectura.proveedor && ` de ${lectura.proveedor}`} · la factura dice {NOMBRE_MEDIO_FACTURA[lectura.medio_pago]}.
      </p>
      {lectura.total_factura !== null && (
        <p className={Math.abs(diferencia) >= 50 ? "font-semibold text-rojo" : "text-cafe-700"}>
          Total de la factura {cop(lectura.total_factura)} · suma de los renglones {cop(total)}
          {Math.abs(diferencia) >= 50 && ` → ${diferencia > 0 ? "faltan" : "sobran"} ${cop(Math.abs(diferencia))}; revisa los valores`}
        </p>
      )}
      {sinInsumo > 0 && (
        <p className="text-cafe-700">
          {sinInsumo} {sinInsumo === 1 ? "producto no coincide" : "productos no coinciden"} con ningún insumo: créalo o elígelo en la lista.
        </p>
      )}
      {lectura.observaciones && <p className="italic text-cafe-700">{lectura.observaciones}</p>}
      <p className="text-cafe-700">Revisa todo antes de registrar: nada se guarda hasta que presiones “Registrar compra”.</p>
    </div>
  );
}

const totalDe = (c: Compra) => c.compra_items.reduce((s, i) => s + i.costo_total, 0) + c.equipos.reduce((s, e) => s + e.monto, 0);
