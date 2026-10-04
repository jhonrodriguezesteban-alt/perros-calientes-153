"use client";

import { Banknote, CalendarDays, HandCoins, Pencil, Receipt, Undo2 } from "lucide-react";
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
  /** Semana de nómina a la que va (vales y pagos de nómina). */
  semana: string | null;
  socio: { nombre: string } | null;
}

/** Semana de nómina (lunes a sábado) o periodo especial con valor fijo. */
export interface Semana {
  desde: string;
  hasta: string;
  turnos: number | null;
  turnos_caja: number;
  valor_turno: number | null;
  devengado: number;
  vales: number;
  pagos: number;
  saldo: number;
  especial: boolean;
  en_curso: boolean;
  nota: string | null;
}

interface Persona {
  id: string;
  nombre: string;
  rol: "empleado" | "socio";
}

const TIPOS: Record<Tipo, { nombre: string; boton: string; ayuda: string }> = {
  nomina: { nombre: "Nómina", boton: "Pagar nómina", ayuda: "Pago de una semana (completo o una parte). Los vales ya cuentan como pago." },
  vale: { nombre: "Vale", boton: "Dar un vale", ayuda: "Adelanto de sueldo: cuenta como pago de la semana en que se da." },
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
        "id, fecha, persona, tipo, monto, bruto, periodo, pagado_con, nota, descontado_en, anulado_en, semana, socio:perfiles!pagos_personal_pagado_por_socio_fkey(nombre)",
      )
      .order("fecha", { ascending: false })
      .order("creado_en", { ascending: false })
      .limit(300),
    db().from("perfiles").select("id, nombre, rol").eq("activo", true).order("nombre"),
  ]);
  const acuerdos = exigir(await db().from("nomina_acuerdos").select("persona, valor_turno, desde").order("persona")) as {
    persona: string;
    valor_turno: number;
    desde: string;
  }[];
  const semanas = new Map<string, Semana[]>();
  for (const a of acuerdos) {
    semanas.set(a.persona, exigir(await db().rpc("nomina_semanas", { p_persona: a.persona })) as Semana[]);
  }
  return { movimientos: exigir(m) as unknown as Movimiento[], personas: exigir(p) as Persona[], acuerdos, semanas };
}

/** Nómina, vales (adelantos) y préstamos. */
export function NominaAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarNomina);
  const [form, setForm] = useState<{ tipo: Tipo; persona?: string; semana?: string } | null>(null);
  const [ajustando, setAjustando] = useState<{ persona: string; semana: Semana } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const vigentes = useMemo(() => (data?.movimientos ?? []).filter((m) => !m.anulado_en), [data]);
  const conAcuerdo = useMemo(() => new Set((data?.acuerdos ?? []).map((a) => a.persona)), [data]);
  // Vales de quien no tiene nómina por semanas: se descuentan en la próxima nómina
  const valesPendientes = useMemo(
    () => agrupar(vigentes.filter((m) => m.tipo === "vale" && !m.descontado_en && !conAcuerdo.has(m.persona)), (m) => m.monto),
    [vigentes, conAcuerdo],
  );
  const porPagar = useMemo(
    () =>
      new Map(
        [...(data?.semanas ?? new Map<string, Semana[]>())]
          .map(([p, ss]) => [p, ss.filter((x) => !x.en_curso && x.saldo > 0).reduce((t, x) => t + x.saldo, 0)] as const)
          .filter(([, v]) => v > 0),
      ),
    [data],
  );
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
              <Subtitulo>Nómina por pagar</Subtitulo>
              {porPagar.size === 0 && valesPendientes.size === 0 ? (
                <p className="text-cafe-300">Todo al día.</p>
              ) : (
                <ul className="divide-y divide-cafe-100">
                  {[...porPagar].map(([p, v]) => (
                    <li key={p} className="flex items-center justify-between gap-2 py-2">
                      <span className="font-etiqueta font-semibold">{p}</span>
                      <span className="numeros font-bold text-rojo">{cop(v)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {valesPendientes.size > 0 && (
                <p className="mb-1 mt-3 font-etiqueta text-xs font-semibold uppercase text-cafe-700">Vales por descontar</p>
              )}
              {valesPendientes.size === 0 ? null : (
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

          {[...data.semanas].map(([persona, semanas]) => (
            <Tarjeta key={persona}>
              <Subtitulo>
                Nómina de {persona} por semanas
              </Subtitulo>
              <p className="-mt-2 mb-4 text-sm text-cafe-700">
                {(() => {
                  const a = data.acuerdos.find((x) => x.persona === persona)!;
                  return `${cop(a.valor_turno)} por turno, lunes a sábado (desde el ${fechaCorta(a.desde)}). Los turnos se cuentan con los días que se abrió la caja. Los vales cuentan como pago de su semana.`;
                })()}
              </p>
              {semanas.length === 0 ? (
                <Vacio>Todavía no hay semanas.</Vacio>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {semanas.map((w) => (
                    <TarjetaSemana
                      key={w.desde}
                      semana={w}
                      movimientos={vigentes.filter((m) => m.persona === persona && m.semana === w.desde)}
                      alPagar={() => setForm({ tipo: "nomina", persona, semana: w.desde })}
                      alAjustar={() => setAjustando({ persona, semana: w })}
                    />
                  ))}
                </div>
              )}
            </Tarjeta>
          ))}

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
                        {m.semana && !m.anulado_en && (
                          <span className="text-xs font-normal text-cafe-700">semana del {fechaCorta(m.semana)}</span>
                        )}
                        {m.tipo === "vale" && !m.anulado_en && !conAcuerdo.has(m.persona) && (
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
          semanaInicial={form.semana}
          semanas={data.semanas}
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
      {ajustando && (
        <ModalTurnos
          persona={ajustando.persona}
          semana={ajustando.semana}
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

const rango = (w: Semana) => `${fechaCorta(w.desde)} al ${fechaCorta(w.hasta)}`;

/** Una semana de nómina: lo ganado, vales y pagos, y cuánto falta. */
function TarjetaSemana({
  semana: w,
  movimientos,
  alPagar,
  alAjustar,
}: {
  semana: Semana;
  movimientos: Movimiento[];
  alPagar: () => void;
  alAjustar: () => void;
}) {
  const estado = w.en_curso ? (
    <Insignia tono="alerta">En curso</Insignia>
  ) : w.saldo > 0 ? (
    <Insignia tono="peligro">Falta {cop(w.saldo)}</Insignia>
  ) : w.devengado === 0 && w.saldo === 0 ? (
    <Insignia>Sin turnos</Insignia>
  ) : w.saldo < 0 ? (
    <Insignia tono="alerta">Pagado de más {cop(-w.saldo)}</Insignia>
  ) : (
    <Insignia tono="ok">Pagada</Insignia>
  );
  return (
    <div className={`rounded-2xl p-4 ring-2 ${!w.en_curso && w.saldo > 0 ? "bg-mostaza-100/50 ring-mostaza" : "bg-crema-200/60 ring-cafe-100"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-etiqueta font-extrabold">
          <CalendarDays className="size-5 text-rojo" /> {rango(w)}
        </p>
        {estado}
      </div>
      {w.nota && <p className="text-xs text-cafe-700">{w.nota}</p>}
      <dl className="numeros mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt>
            {w.especial ? "Nómina acordada" : `${w.turnos} ${w.turnos === 1 ? "turno" : "turnos"} × ${cop(w.valor_turno ?? 0)}`}
            {!w.especial && w.turnos !== w.turnos_caja && <span className="text-cafe-700"> (la caja dice {w.turnos_caja})</span>}
          </dt>
          <dd className="font-semibold">{cop(w.devengado)}</dd>
        </div>
        {movimientos
          .slice()
          .sort((a, b) => a.fecha.localeCompare(b.fecha))
          .map((m) => (
            <div key={m.id} className="flex justify-between gap-2 text-cafe-700">
              <dt>
                {m.tipo === "vale" ? "Vale" : "Pago"} {fechaCorta(m.fecha)} · {nombrePago(m)}
              </dt>
              <dd>−{cop(m.monto)}</dd>
            </div>
          ))}
        <div className="flex justify-between gap-2 border-t border-cafe-100 pt-1 font-etiqueta font-extrabold">
          <dt>{w.saldo >= 0 ? "Falta por pagar" : "Pagado de más"}</dt>
          <dd className={w.saldo > 0 ? "text-rojo" : ""}>{cop(Math.abs(w.saldo))}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {w.saldo > 0 && (
          <Boton className="!min-h-10 px-3 text-sm" onClick={alPagar}>
            <Banknote className="size-4" /> Pagar
          </Boton>
        )}
        {!w.especial && (
          <Boton variante="suave" className="!min-h-10 px-3 text-sm" onClick={alAjustar}>
            <Pencil className="size-4" /> Ajustar turnos
          </Boton>
        )}
      </div>
    </div>
  );
}

function ModalTurnos({ persona, semana, alCerrar, alGuardar }: { persona: string; semana: Semana; alCerrar: () => void; alGuardar: () => void }) {
  const [turnos, setTurnos] = useState(String(semana.turnos ?? semana.turnos_caja));
  const [nota, setNota] = useState(semana.nota ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardar = async (usarCaja = false) => {
    setGuardando(true);
    setError(null);
    try {
      exigir(
        await db().rpc("ajustar_turnos_semana", {
          p_persona: persona,
          p_desde: semana.desde,
          p_turnos: usarCaja ? null : Number(turnos),
          p_nota: nota,
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
      titulo={`Turnos del ${rango(semana)}`}
      pie={
        <Boton onClick={() => void guardar()} cargando={guardando} className="w-full">
          Guardar
        </Boton>
      }
    >
      <p className="mb-4 text-sm text-cafe-700">
        Según la caja, {persona} trabajó {semana.turnos_caja} {semana.turnos_caja === 1 ? "día" : "días"} esa semana. Cámbialo si faltó o trabajó un
        día sin abrir caja.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Turnos trabajados">
          <Selector value={turnos} onChange={(e) => setTurnos(e.target.value)}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Nota">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Faltó el martes" />
        </Campo>
      </div>
      {semana.turnos !== semana.turnos_caja && (
        <button onClick={() => void guardar(true)} className="mt-3 text-sm font-semibold text-cafe-700 underline underline-offset-2">
          Volver a contar con la caja ({semana.turnos_caja})
        </button>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function ModalMovimiento({
  tipo,
  personaInicial,
  semanaInicial,
  semanas,
  personas,
  movimientos,
  prestamos,
  alCerrar,
  alGuardar,
}: {
  tipo: Tipo;
  personaInicial?: string;
  semanaInicial?: string;
  semanas: Map<string, Semana[]>;
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
  const semanasPersona = semanas.get(persona.trim());
  const porSemanas = tipo === "nomina" && !!semanasPersona;
  const pendientes = (semanasPersona ?? []).filter((w) => w.saldo > 0).sort((a, b) => a.desde.localeCompare(b.desde));
  const [semana, setSemana] = useState(semanaInicial ?? pendientes[0]?.desde ?? "");
  const elegida = semanasPersona?.find((w) => w.desde === semana);
  const [montoSemana, setMontoSemana] = useState<number | null>(elegida && elegida.saldo > 0 ? elegida.saldo : null);
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
    if (porSemanas) {
      if (!semana) return setError("Elige qué semana se paga.");
      if (!montoSemana) return setError("Escribe cuánto se paga.");
      if (!pagadoCon) return setError("Elige con qué se pagó.");
      if (pagadoCon === "socio" && !socioId) return setError("Elige qué socio puso la plata.");
      setGuardando(true);
      setError(null);
      try {
        exigir(
          await db().rpc("pagar_nomina_semana", {
            p: {
              persona: persona.trim(),
              semana,
              fecha,
              monto: montoSemana,
              periodo: elegida ? `Semana ${rango(elegida)}` : null,
              pagado_con: pagadoCon,
              socio_id: pagadoCon === "socio" ? socioId : null,
              nota,
            },
          }),
        );
        alGuardar();
      } catch (e) {
        setError(mensajeError(e));
      } finally {
        setGuardando(false);
      }
      return;
    }
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
          Guardar {porSemanas ? (montoSemana ? `· se pagan ${cop(montoSemana)}` : "") : tipo === "nomina" && bruto ? `· se pagan ${cop(Math.max(neto, 0))}` : ""}
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

        {porSemanas ? (
          <>
            <Campo etiqueta="¿Qué semana se paga?" className="sm:col-span-2">
              <Selector
                value={semana}
                onChange={(e) => {
                  setSemana(e.target.value);
                  const w = semanasPersona?.find((x) => x.desde === e.target.value);
                  setMontoSemana(w && w.saldo > 0 ? w.saldo : null);
                }}
              >
                <option value="">Elige…</option>
                {[...(semanasPersona ?? [])]
                  .sort((a, b) => a.desde.localeCompare(b.desde))
                  .map((w) => (
                    <option key={w.desde} value={w.desde}>
                      {rango(w)} · {w.saldo > 0 ? `falta ${cop(w.saldo)}` : "pagada"}
                      {w.en_curso ? " (en curso)" : ""}
                    </option>
                  ))}
              </Selector>
            </Campo>
            <Campo
              etiqueta="Valor que se paga"
              ayuda={elegida ? `Ganado ${cop(elegida.devengado)} − vales ${cop(elegida.vales)} − pagos ${cop(elegida.pagos)}. Puede ser una parte.` : undefined}
              className="sm:col-span-2"
            >
              <EntradaPesos valor={montoSemana} alCambiar={setMontoSemana} placeholder="$0" />
            </Campo>
          </>
        ) : tipo === "nomina" ? (
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

      {tipo === "vale" && semanasPersona && (
        <p className="mt-3 text-sm text-cafe-700">Cuenta como pago de la semana de esa fecha.</p>
      )}

      {tipo === "nomina" && !porSemanas && vales.length > 0 && (
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
