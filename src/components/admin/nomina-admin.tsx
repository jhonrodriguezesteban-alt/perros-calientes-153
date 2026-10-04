"use client";

import { Banknote, HandCoins, Receipt, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { db, fechaCorta, hoyBogota, PAGOS_COMPRA, type PagoCompra } from "@/lib/admin";
import { cop } from "@/lib/formato";
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Entrada,
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

type Tipo = "nomina" | "vale" | "prestamo" | "abono";

interface Movimiento {
  id: string;
  fecha: string;
  persona: string;
  tipo: Tipo;
  monto: number;
  bruto: number | null;
  periodo: string | null;
  pagado_con: PagoCompra;
  nota: string | null;
  descontado_en: string | null;
  anulado_en: string | null;
  socio: { nombre: string } | null;
}

interface Persona {
  id: string;
  nombre: string;
  rol: "empleado" | "socio";
}

const TIPOS: Record<Tipo, { nombre: string; boton: string; ayuda: string }> = {
  nomina: { nombre: "Nómina", boton: "Pagar nómina", ayuda: "Pago del periodo. Se descuentan los vales pendientes." },
  vale: { nombre: "Vale", boton: "Dar un vale", ayuda: "Adelanto de sueldo: se descuenta en la próxima nómina." },
  prestamo: { nombre: "Préstamo", boton: "Prestar plata", ayuda: "A un socio o a quien sea. No es gasto: la plata debe volver." },
  abono: { nombre: "Abono", boton: "Recibir un abono", ayuda: "Alguien devuelve parte (o todo) de un préstamo." },
};

const PAGOS_ABONO: { id: PagoCompra; nombre: string }[] = [
  { id: "transferencia", nombre: "A Nequi" },
  { id: "fondo", nombre: "Al fondo de inversión" },
  { id: "efectivo", nombre: "Efectivo (a un socio)" },
];

async function cargarNomina() {
  const [m, p] = await Promise.all([
    db()
      .from("pagos_personal")
      .select(
        "id, fecha, persona, tipo, monto, bruto, periodo, pagado_con, nota, descontado_en, anulado_en, socio:perfiles!pagos_personal_pagado_por_socio_fkey(nombre)",
      )
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(300),
    db().from("perfiles").select("id, nombre, rol").eq("activo", true).order("nombre"),
  ]);
  return { movimientos: exigir(m) as unknown as Movimiento[], personas: exigir(p) as Persona[] };
}

/** Nómina, vales (adelantos) y préstamos. */
export function NominaAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarNomina);
  const [form, setForm] = useState<{ tipo: Tipo; persona?: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const vigentes = useMemo(() => (data?.movimientos ?? []).filter((m) => !m.anulado_en), [data]);
  const valesPendientes = useMemo(() => agrupar(vigentes.filter((m) => m.tipo === "vale" && !m.descontado_en), (m) => m.monto), [vigentes]);
  const prestamos = useMemo(
    () =>
      new Map(
        [...agrupar(vigentes.filter((m) => m.tipo === "prestamo" || m.tipo === "abono"), (m) => (m.tipo === "prestamo" ? m.monto : -m.monto))].filter(
          ([, v]) => v > 0,
        ),
      ),
    [vigentes],
  );
  const mesActual = hoyBogota().slice(0, 7);
  const nominaMes = vigentes
    .filter((m) => (m.tipo === "nomina" || m.tipo === "vale") && m.fecha.startsWith(mesActual))
    .reduce((s, m) => s + m.monto, 0);

  const anular = async (m: Movimiento) => {
    if (!window.confirm(`¿Anular ${TIPOS[m.tipo].nombre.toLowerCase()} de ${m.persona} por ${cop(m.monto)}?`)) return;
    setAviso(null);
    try {
      exigir(await db().rpc("anular_pago_personal", { p_id: m.id }));
      recargar();
    } catch (e) {
      setAviso(mensajeError(e));
    }
  };

  return (
    <div className="space-y-6">
      <Encabezado
        titulo="Nómina y préstamos"
        descripcion="Pagos de nómina, vales (adelantos) y plata prestada a socios u otras personas. Todo sale en el flujo de caja con su forma de pago."
      />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}
      {aviso && <MensajeError>{aviso}</MensajeError>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(Object.keys(TIPOS) as Tipo[]).map((t) => {
              const Icono = { nomina: Banknote, vale: Receipt, prestamo: HandCoins, abono: Undo2 }[t];
              return (
                <button
                  key={t}
                  onClick={() => setForm({ tipo: t })}
                  className="flex min-h-24 flex-col items-start justify-between gap-2 rounded-3xl bg-crema p-4 text-left ring-2 ring-cafe-100 active:bg-cafe-100 lg:hover:ring-cafe-300"
                >
                  <Icono className="size-7 text-rojo" />
                  <span>
                    <span className="block font-etiqueta font-extrabold">{TIPOS[t].boton}</span>
                    <span className="block text-xs text-cafe-700">{TIPOS[t].ayuda}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Tarjeta>
              <Subtitulo>Nómina de este mes</Subtitulo>
              <p className="numeros font-titulo text-3xl font-extrabold text-rojo">{cop(nominaMes)}</p>
              <p className="text-sm text-cafe-700">Nóminas y vales pagados (queda en Finanzas como gasto de Nómina).</p>
            </Tarjeta>
            <Tarjeta>
              <Subtitulo>Vales por descontar</Subtitulo>
              {valesPendientes.size === 0 ? (
                <p className="text-cafe-300">Ninguno.</p>
              ) : (
                <ul className="divide-y divide-cafe-100">
                  {[...valesPendientes].map(([p, v]) => (
                    <li key={p} className="flex items-center justify-between gap-2 py-2">
                      <span className="font-etiqueta font-semibold">{p}</span>
                      <span className="numeros font-bold">{cop(v)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
            <Tarjeta>
              <Subtitulo>Préstamos por cobrar</Subtitulo>
              {prestamos.size === 0 ? (
                <p className="text-cafe-300">Nadie debe.</p>
              ) : (
                <ul className="divide-y divide-cafe-100">
                  {[...prestamos].map(([p, v]) => (
                    <li key={p} className="flex items-center justify-between gap-2 py-2">
                      <span className="font-etiqueta font-semibold">{p}</span>
                      <span className="flex items-center gap-2">
                        <span className="numeros font-bold">{cop(v)}</span>
                        <button onClick={() => setForm({ tipo: "abono", persona: p })} className="rounded-lg px-2 py-1 font-etiqueta text-xs font-bold ring-2 ring-cafe-100">
                          Abono
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>

          <Tarjeta>
            <Subtitulo>Historial</Subtitulo>
            {data.movimientos.length === 0 ? (
              <Vacio>Todavía no hay pagos registrados.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.movimientos.map((m) => (
                  <li key={m.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${m.anulado_en ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-etiqueta font-semibold">
                        <Insignia tono={m.tipo === "prestamo" ? "alerta" : m.tipo === "abono" ? "ok" : "neutro"}>{TIPOS[m.tipo].nombre}</Insignia>
                        {m.persona}
                        {m.anulado_en && <span className="text-xs">ANULADO</span>}
                        {m.tipo === "vale" && !m.anulado_en && (
                          <span className="text-xs font-normal text-cafe-700">{m.descontado_en ? "ya descontado" : "por descontar"}</span>
                        )}
                      </p>
                      <p className="text-sm text-cafe-700">
                        {fechaCorta(m.fecha)}
                        {m.periodo && ` · ${m.periodo}`}
                        {m.tipo === "nomina" && m.bruto !== null && m.bruto !== m.monto && ` · nómina ${cop(m.bruto)} − vales ${cop(m.bruto - m.monto)}`}
                        {` · ${nombrePago(m)}`}
                        {m.nota && ` · ${m.nota}`}
                      </p>
                    </div>
                    <span className="flex items-center gap-3">
                      <span className={`numeros font-titulo text-lg font-bold ${m.anulado_en ? "line-through" : ""}`}>
                        {m.tipo === "abono" ? "+" : ""}
                        {cop(m.monto)}
                      </span>
                      {!m.anulado_en && (
                        <button onClick={() => void anular(m)} className="rounded-lg px-2 py-1 text-xs font-semibold text-rojo ring-1 ring-rojo/40">
                          Anular
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {form && data && (
        <ModalMovimiento
          tipo={form.tipo}
          personaInicial={form.persona}
          personas={data.personas}
          movimientos={vigentes}
          prestamos={prestamos}
          alCerrar={() => setForm(null)}
          alGuardar={() => {
            setForm(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function ModalMovimiento({
  tipo,
  personaInicial,
  personas,
  movimientos,
  prestamos,
  alCerrar,
  alGuardar,
}: {
  tipo: Tipo;
  personaInicial?: string;
  personas: Persona[];
  movimientos: Movimiento[];
  prestamos: Map<string, number>;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const empleada = personas.find((p) => p.rol === "empleado")?.nombre ?? "";
  const [persona, setPersona] = useState(personaInicial ?? (tipo === "nomina" || tipo === "vale" ? empleada : ""));
  const [fecha, setFecha] = useState(hoyBogota());
  const ultimaNomina = movimientos.find((m) => m.tipo === "nomina" && m.persona === persona.trim());
  const [bruto, setBruto] = useState<number | null>(ultimaNomina?.bruto ?? null);
  const [monto, setMonto] = useState<number | null>(tipo === "abono" && personaInicial ? (prestamos.get(personaInicial) ?? null) : null);
  const [periodo, setPeriodo] = useState("");
  const [pagadoCon, setPagadoCon] = useState<PagoCompra | null>(null);
  const [socioId, setSocioId] = useState("");
  const [nota, setNota] = useState("");
  const [sinDescontar, setSinDescontar] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nombres = [...new Set([...personas.map((p) => p.nombre), ...movimientos.map((m) => m.persona)])];
  const vales = movimientos.filter((m) => m.tipo === "vale" && !m.descontado_en && m.persona === persona.trim());
  const descontados = vales.filter((v) => !sinDescontar.has(v.id));
  const totalVales = descontados.reduce((s, v) => s + v.monto, 0);
  const neto = (bruto ?? 0) - totalVales;
  const debe = prestamos.get(persona.trim()) ?? 0;
  const opciones = tipo === "abono" ? PAGOS_ABONO : tipo === "prestamo" ? PAGOS_COMPRA.filter((p) => p.id !== "socio") : PAGOS_COMPRA;

  const guardar = async () => {
    if (!persona.trim()) return setError(tipo === "abono" ? "¿Quién devuelve?" : "¿A quién se le paga?");
    if (tipo === "nomina" ? !bruto : !monto) return setError("Escribe el valor.");
    if (tipo === "nomina" && neto < 0) return setError("Los vales suman más que la nómina.");
    if (!pagadoCon) return setError(tipo === "abono" ? "Elige cómo lo devolvió." : "Elige con qué se pagó.");
    if (pagadoCon === "socio" && !socioId) return setError("Elige qué socio puso la plata.");
    setGuardando(true);
    setError(null);
    try {
      exigir(
        await db().rpc("registrar_pago_personal", {
          p: {
            tipo,
            persona: persona.trim(),
            fecha,
            monto,
            bruto,
            periodo,
            pagado_con: pagadoCon,
            socio_id: pagadoCon === "socio" ? socioId : null,
            nota,
            vales: tipo === "nomina" ? descontados.map((v) => v.id) : [],
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
      titulo={TIPOS[tipo].boton}
      pie={
        <Boton onClick={guardar} cargando={guardando} className="w-full">
          Guardar {tipo === "nomina" && bruto ? `· se pagan ${cop(Math.max(neto, 0))}` : ""}
        </Boton>
      }
    >
      <p className="mb-4 text-sm text-cafe-700">{TIPOS[tipo].ayuda}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta={tipo === "abono" ? "¿Quién devuelve?" : tipo === "prestamo" ? "¿A quién se le presta?" : "¿A quién?"}>
          <Entrada
            list="personas-nomina"
            value={persona}
            onChange={(e) => {
              setPersona(e.target.value);
              setSinDescontar(new Set());
              if (tipo === "nomina") setBruto(movimientos.find((m) => m.tipo === "nomina" && m.persona === e.target.value.trim())?.bruto ?? null);
            }}
            placeholder="Ej. Andrea"
          />
          <datalist id="personas-nomina">
            {(tipo === "abono" ? [...prestamos.keys()] : nombres).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Fecha">
          <Entrada type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
        </Campo>

        {tipo === "nomina" ? (
          <>
            <Campo etiqueta="Valor de la nómina (antes de vales)" ayuda={ultimaNomina ? `La última fue ${cop(ultimaNomina.bruto ?? 0)}` : undefined}>
              <EntradaPesos valor={bruto} alCambiar={setBruto} placeholder="$0" />
            </Campo>
            <Campo etiqueta="Periodo">
              <Entrada value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ej. Semana del 22 al 28 de sept" />
            </Campo>
          </>
        ) : (
          <Campo etiqueta="Valor" ayuda={tipo === "abono" && debe > 0 ? `Debe ${cop(debe)}` : undefined} className="sm:col-span-2">
            <EntradaPesos valor={monto} alCambiar={setMonto} placeholder="$0" />
          </Campo>
        )}
      </div>

      {tipo === "nomina" && vales.length > 0 && (
        <div className="mt-4 rounded-2xl bg-mostaza-100/60 p-3 ring-2 ring-mostaza">
          <p className="mb-2 font-etiqueta text-sm font-semibold">Vales que se descuentan:</p>
          <ul className="space-y-1">
            {vales.map((v) => (
              <li key={v.id}>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-cafe"
                      checked={!sinDescontar.has(v.id)}
                      onChange={() =>
                        setSinDescontar((s) => {
                          const n = new Set(s);
                          if (n.has(v.id)) n.delete(v.id);
                          else n.add(v.id);
                          return n;
                        })
                      }
                    />
                    {fechaCorta(v.fecha)}
                    {v.nota && ` · ${v.nota}`}
                  </span>
                  <span className="numeros font-semibold">−{cop(v.monto)}</span>
                </label>
              </li>
            ))}
          </ul>
          {bruto ? (
            <p className="mt-2 border-t border-mostaza pt-2 text-right font-etiqueta font-extrabold">
              Se le paga: <span className="numeros text-rojo">{cop(neto)}</span>
            </p>
          ) : null}
        </div>
      )}

      <p className="mb-2 mt-5 font-etiqueta text-sm font-semibold text-cafe-700">{tipo === "abono" ? "¿Cómo lo devolvió?" : "¿Con qué se pagó?"}</p>
      <div className="flex flex-wrap gap-2">
        {opciones.map((p) => (
          <button
            key={p.id}
            onClick={() => setPagadoCon(p.id)}
            className={`min-h-11 rounded-xl px-3 font-etiqueta text-sm font-semibold ${
              pagadoCon === p.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
            }`}
          >
            {p.nombre}
          </button>
        ))}
      </div>
      {pagadoCon === "socio" && (
        <Selector value={socioId} onChange={(e) => setSocioId(e.target.value)} className="mt-3">
          <option value="">¿Qué socio puso la plata?</option>
          {personas
            .filter((p) => p.rol === "socio")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
        </Selector>
      )}
      {pagadoCon === "caja" && fecha === hoyBogota() && <p className="mt-2 text-sm text-cafe-700">Sale de la caja de hoy como retiro.</p>}

      <Campo etiqueta="Nota (opcional)" className="mt-4">
        <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder={tipo === "prestamo" ? "Ej. Para el arriendo, devuelve el 15" : ""} />
      </Campo>
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function agrupar(ms: Movimiento[], valor: (m: Movimiento) => number) {
  const r = new Map<string, number>();
  for (const m of ms) r.set(m.persona, (r.get(m.persona) ?? 0) + valor(m));
  return r;
}

function nombrePago(m: Movimiento) {
  if (m.tipo === "abono") return PAGOS_ABONO.find((p) => p.id === m.pagado_con)?.nombre ?? m.pagado_con;
  if (m.pagado_con === "socio") return `lo pagó ${m.socio?.nombre ?? "un socio"}`;
  return PAGOS_COMPRA.find((p) => p.id === m.pagado_con)?.nombre ?? m.pagado_con;
}
