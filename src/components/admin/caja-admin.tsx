"use client";

import { ChevronDown, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ResumenCierre } from "@/components/resumen-cierre";
import { db } from "@/lib/admin";
import { cop, horaBogota } from "@/lib/formato";
import type { ResumenDia } from "@/lib/tipos";
import { Modal } from "@/components/modal";
import { ModalRegistrarRetiro, type RetiroCaja } from "./registrar-retiro";
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
  Subtitulo,
  Tarjeta,
  useDatos,
  Vacio,
} from "./ui";

interface Cierre {
  id: string;
  abierto_en: string;
  cerrado_en: string | null;
  base_inicial: number;
  base_esperada: number | null;
  efectivo_esperado: number | null;
  efectivo_contado: number | null;
  diferencia: number | null;
  bancos_esperado: number | null;
  bancos_declarado: number | null;
  diferencia_bancos: number | null;
  retiros: number;
  resumen: ResumenDia | null;
  cerrador: { nombre: string } | null;
}

interface Retiro {
  id: string;
  monto: number;
  tercero: string;
  motivo: string | null;
  creado_en: string;
  anulado_en: string | null;
  quien: { nombre: string } | null;
}

async function cargarCaja() {
  const [c, r, k] = await Promise.all([
    db()
      .from("turnos")
      .select(
        "id, abierto_en, cerrado_en, base_inicial, base_esperada, efectivo_esperado, efectivo_contado, diferencia, bancos_esperado, bancos_declarado, diferencia_bancos, retiros, resumen, cerrador:perfiles!turnos_cerrado_por_fkey(nombre)",
      )
      .order("abierto_en", { ascending: false })
      .limit(60),
    db()
      .from("retiros_caja")
      .select("id, monto, tercero, motivo, creado_en, anulado_en, quien:perfiles!retiros_caja_registrado_por_fkey(nombre)")
      .order("creado_en", { ascending: false })
      .limit(100),
    db().rpc("retiros_clasificados", { p_limite: 150 }),
  ]);
  const registro = new Map(((exigir(k) ?? []) as { id: string; registro: string | null }[]).map((x) => [x.id, x.registro]));
  return { cierres: exigir(c) as unknown as Cierre[], retiros: exigir(r) as unknown as Retiro[], registro };
}

const NOMBRE_REGISTRO: Record<string, string> = { compra: "Compra", gasto: "Gasto", pago: "Vale / préstamo", sin_gasto: "No es gasto" };

const fecha = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });

/** Cierres de caja de cada día y retiros de efectivo. */
export function CajaAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarCaja);
  const [corrigiendo, setCorrigiendo] = useState<Cierre | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [ordenando, setOrdenando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [registrando, setRegistrando] = useState<RetiroCaja | null>(null);

  // Trae a este cierre las ventas del mismo día que quedaron en otra caja
  // (p. ej. vendidas antes de abrir, con la caja del día anterior abierta).
  const traerVentas = async (c: Cierre) => {
    setOrdenando(c.id);
    setAviso(null);
    try {
      const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(c.abierto_en));
      const n = exigir(await db().rpc("reasignar_ventas_dia", { p_fecha: dia })) as number;
      setAviso(n > 0 ? `Listo: ${n} ${n === 1 ? "venta pasó" : "ventas pasaron"} a este cierre y se recalculó.` : "Todas las ventas de ese día ya estaban en este cierre.");
      recargar();
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setOrdenando(null);
    }
  };

  const retirosVigentes = (data?.retiros ?? []).filter((r) => !r.anulado_en);
  const sinRegistrar = retirosVigentes.filter((r) => !data?.registro.get(r.id));
  const porTercero = new Map<string, number>();
  for (const r of retirosVigentes) porTercero.set(r.tercero, (porTercero.get(r.tercero) ?? 0) + r.monto);

  return (
    <div className="space-y-6">
      <Encabezado titulo="Caja" descripcion="Cierre de cada día (efectivo y bancos: lo que dice el sistema vs. lo declarado) y retiros de efectivo." />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}
      {aviso && <p className="rounded-2xl bg-cafe px-4 py-3 font-semibold text-crema">{aviso}</p>}

      {data && (
        <>
          <Tarjeta>
            <Subtitulo>Cierres de caja</Subtitulo>
            {data.cierres.length === 0 ? (
              <Vacio>Todavía no hay cierres. Andrea finaliza el día desde el POS → Caja → Finalizar día.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.cierres.map((c) => (
                  <li key={c.id} className="py-3">
                    <button
                      onClick={() => setAbierto(abierto === c.id ? null : c.id)}
                      disabled={!c.resumen}
                      className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                    >
                      <span className="font-etiqueta font-semibold first-letter:uppercase">
                        {fecha.format(new Date(c.abierto_en))}{" "}
                        <span className="font-normal normal-case text-cafe-700">
                          {horaBogota(c.abierto_en)} – {c.cerrado_en ? horaBogota(c.cerrado_en) : "abierto"}
                          {c.cerrador && ` · ${c.cerrador.nombre}`}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {c.cerrado_en ? (
                          <>
                            <Diferencia etiqueta="Efectivo" valor={c.diferencia} />
                            <Diferencia etiqueta="Bancos" valor={c.diferencia_bancos} />
                            {c.retiros > 0 && <Insignia>Retiros {cop(c.retiros)}</Insignia>}
                            {c.resumen && <span className="numeros font-titulo text-lg font-extrabold">{cop(c.resumen.total)}</span>}
                          </>
                        ) : (
                          <Insignia tono="alerta">Día abierto</Insignia>
                        )}
                        {c.resumen && <ChevronDown className={`size-5 transition ${abierto === c.id ? "rotate-180" : ""}`} />}
                      </span>
                    </button>
                    {abierto === c.id && c.resumen && (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm text-cafe-700">
                            Abrió con {cop(c.base_inicial)}
                            {c.base_esperada !== null &&
                              c.base_esperada !== c.base_inicial &&
                              ` · el cierre anterior dejó ${cop(c.base_esperada)} (${c.base_inicial > c.base_esperada ? "+" : "−"}${cop(Math.abs(c.base_inicial - c.base_esperada))})`}
                          </p>
                          <span className="flex flex-wrap gap-2">
                            <Boton variante="suave" className="min-h-10 px-3 text-sm" onClick={() => void traerVentas(c)} cargando={ordenando === c.id}>
                              <RefreshCw className="size-4" /> Traer ventas de este día
                            </Boton>
                            <Boton variante="suave" className="min-h-10 px-3 text-sm" onClick={() => setCorrigiendo(c)}>
                              <Pencil className="size-4" /> Corregir cierre
                            </Boton>
                          </span>
                        </div>
                        <ResumenCierre resumen={c.resumen} compartir />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <Subtitulo>Retiros de efectivo</Subtitulo>
            {sinRegistrar.length > 0 && (
              <p className="mb-4 rounded-2xl bg-mostaza-100/70 px-4 py-3 text-sm ring-2 ring-mostaza">
                <strong>
                  {sinRegistrar.length} {sinRegistrar.length === 1 ? "retiro sin registrar" : "retiros sin registrar"} por{" "}
                  {cop(sinRegistrar.reduce((s, r) => s + r.monto, 0))}
                </strong>
                . Ya salieron de la caja, pero no están en Compras ni en Gastos. Toca “Registrar” en cada uno para decir en qué se usó (no
                se descuenta otra vez de la caja).
              </p>
            )}
            {porTercero.size > 0 && (
              <div className="mb-4 flex flex-wrap gap-2">
                {[...porTercero.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, m]) => (
                    <Insignia key={t}>
                      {t}: {cop(m)}
                    </Insignia>
                  ))}
              </div>
            )}
            {data.retiros.length === 0 ? (
              <p className="text-cafe-300">No hay retiros.</p>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.retiros.map((r) => (
                  <li key={r.id} className={`flex items-center justify-between gap-3 py-2 ${r.anulado_en ? "opacity-50" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-etiqueta font-semibold">
                        {r.tercero}
                        {r.anulado_en && <span className="ml-2 text-xs">ANULADO</span>}
                      </p>
                      <p className="truncate text-sm text-cafe-700">
                        {fecha.format(new Date(r.creado_en))} {horaBogota(r.creado_en)} · {r.motivo ?? "Sin motivo"}
                        {r.quien && ` · registró ${r.quien.nombre}`}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      {!r.anulado_en &&
                        (data.registro.get(r.id) ? (
                          <Insignia tono="ok">{NOMBRE_REGISTRO[data.registro.get(r.id)!] ?? "Registrado"}</Insignia>
                        ) : (
                          <Boton variante="suave" className="!min-h-9 px-3 text-sm" onClick={() => setRegistrando(r)}>
                            Registrar
                          </Boton>
                        ))}
                      <span className={`numeros font-titulo text-lg font-bold ${r.anulado_en ? "line-through" : ""}`}>{cop(r.monto)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}
      {registrando && (
        <ModalRegistrarRetiro
          retiro={registrando}
          alCerrar={() => setRegistrando(null)}
          alGuardar={(texto) => {
            setRegistrando(null);
            setAviso(texto);
            recargar();
          }}
        />
      )}
      {corrigiendo && (
        <ModalCorregir
          cierre={corrigiendo}
          alCerrar={() => setCorrigiendo(null)}
          alGuardar={() => {
            setCorrigiendo(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

function ModalCorregir({ cierre, alCerrar, alGuardar }: { cierre: Cierre; alCerrar: () => void; alGuardar: () => void }) {
  const r = cierre.resumen;
  const [base, setBase] = useState<number | null>(cierre.base_inicial);
  const [contado, setContado] = useState<number | null>(cierre.efectivo_contado);
  const [bold, setBold] = useState<number | null>(r?.bold_declarado ?? 0);
  const [nequi, setNequi] = useState<number | null>(r?.nequi_declarado ?? 0);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const esperado = (base ?? 0) + (r ? r.efectivo + r.cobros_fiado.efectivo - r.retiros : 0);

  const guardar = async () => {
    if (!nota.trim()) return setError("Escribe por qué se corrige (queda anotado en el cierre).");
    setGuardando(true);
    setError(null);
    try {
      exigir(
        await db().rpc("corregir_cierre", {
          p_turno_id: cierre.id,
          p_base: base ?? 0,
          p_efectivo_contado: contado ?? 0,
          p_bold: bold ?? 0,
          p_nequi: nequi ?? 0,
          p_nota: nota.trim(),
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
      titulo={`Corregir cierre del ${fecha.format(new Date(cierre.abierto_en))}`}
      pie={
        <Boton onClick={guardar} cargando={guardando} className="w-full">
          Guardar corrección
        </Boton>
      }
    >
      <p className="mb-4 text-sm text-cafe-700">
        Las ventas no cambian: solo la base y lo que se contó o declaró. El cuadre se recalcula y la corrección queda anotada.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Base con la que abrió">
          <EntradaPesos valor={base} alCambiar={setBase} />
        </Campo>
        <Campo etiqueta="Efectivo contado al cerrar" ayuda={`Debería haber ${cop(esperado)}`}>
          <EntradaPesos valor={contado} alCambiar={setContado} />
        </Campo>
        <Campo etiqueta="Recibido por Bold" ayuda={r ? `Sistema: ${cop(r.bold_esperado)}` : undefined}>
          <EntradaPesos valor={bold} alCambiar={setBold} />
        </Campo>
        <Campo etiqueta="Recibido por Nequi" ayuda={r ? `Sistema: ${cop(r.nequi_esperado)}` : undefined}>
          <EntradaPesos valor={nequi} alCambiar={setNequi} />
        </Campo>
        <Campo etiqueta="¿Por qué se corrige?" className="sm:col-span-2">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Andrea no contó la base; eran $16.000" />
        </Campo>
      </div>
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function Diferencia({ etiqueta, valor }: { etiqueta: string; valor: number | null }) {
  if (valor === null) return null;
  return (
    <Insignia tono={valor === 0 ? "ok" : "peligro"}>
      {etiqueta}: {valor === 0 ? "cuadra" : valor > 0 ? `+${cop(valor)}` : `−${cop(-valor)}`}
    </Insignia>
  );
}
