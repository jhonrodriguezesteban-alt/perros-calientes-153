"use client";

import { Landmark, Smartphone, Store, Wallet } from "lucide-react";
import { useCallback, useState } from "react";
import { Modal } from "@/components/modal";
import { db, fechaCorta, hoyBogota, PAGOS_COMPRA } from "@/lib/admin";
import { cop, horaBogota } from "@/lib/formato";
import { Boton, Campo, Cargando, Encabezado, Entrada, EntradaPesos, exigir, mensajeError, MensajeError, Subtitulo, Tarjeta, useDatos } from "./ui";

interface Flujo {
  caja_local: {
    abierta: boolean;
    desde?: string;
    monto: number;
    base?: number;
    efectivo_ventas?: number;
    cobros?: number;
    retiros?: number;
    cerrado_por?: string;
  };
  bold: number;
  nequi: number;
  disponible: number;
  entregado_socios: { tercero: string; monto: number }[];
  puesto_por_socios: { socio: string; monto: number }[];
  fiado_por_cobrar: number;
  periodo: {
    entradas: Record<"efectivo" | "datafono" | "nequi", { ventas: number; cobros: number; comisiones: number }>;
    salidas: Record<string, { compras: number; gastos: number }>;
    retiros: { tercero: string; motivo: string | null; monto: number; fecha: string }[];
    ajustes: { cuenta: string; monto: number; nota: string | null; fecha: string }[];
  };
}

const aFecha = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
const sumarDias = (dia: string, n: number) => aFecha(new Date(new Date(`${dia}T12:00:00-05:00`).getTime() + n * 86_400_000));

type Rango = "hoy" | "7" | "mes" | "mes-pasado";
const RANGOS: { id: Rango; nombre: string }[] = [
  { id: "hoy", nombre: "Hoy" },
  { id: "7", nombre: "Últimos 7 días" },
  { id: "mes", nombre: "Este mes" },
  { id: "mes-pasado", nombre: "Mes pasado" },
];
function rangoDe(r: Rango): [string, string] {
  const hoy = hoyBogota();
  const ini = `${hoy.slice(0, 7)}-01`;
  if (r === "hoy") return [hoy, hoy];
  if (r === "7") return [sumarDias(hoy, -6), hoy];
  if (r === "mes-pasado") {
    const fin = sumarDias(ini, -1);
    return [`${fin.slice(0, 7)}-01`, fin];
  }
  return [ini, hoy];
}

/** Dónde está la plata hoy y qué entró y salió en un periodo. */
export function FlujoAdmin() {
  const [rango, setRango] = useState<Rango>("mes");
  const [desde, hasta] = rangoDe(rango);
  const cargar = useCallback(async () => exigir(await db().rpc("flujo_caja", { p_desde: desde, p_hasta: hasta })) as Flujo, [desde, hasta]);
  const { data: f, error, cargando, recargar } = useDatos(cargar);
  const [ajustando, setAjustando] = useState<"bold" | "nequi" | null>(null);

  return (
    <div className="space-y-6">
      <Encabezado titulo="Flujo de caja" descripcion="Cuánta plata hay hoy y dónde está, y qué entró y salió en el periodo." />
      {cargando && !f && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {f && (
        <>
          <section className="rounded-3xl bg-cafe p-6 text-crema">
            <p className="font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-300">Dinero disponible ahora</p>
            <p className={`numeros font-titulo text-5xl font-extrabold ${f.disponible < 0 ? "text-rojo" : "text-mostaza"}`}>{cop(f.disponible)}</p>
            <p className="mt-1 text-sm text-cafe-100">Caja del local + Bold + Nequi. El fiado pendiente ({cop(f.fiado_por_cobrar)}) no está incluido.</p>
          </section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Cuenta Icono={Store} titulo="Caja del local (efectivo)" monto={f.caja_local.monto}>
              {f.caja_local.abierta ? (
                <>
                  <p>Día abierto desde las {f.caja_local.desde ? horaBogota(f.caja_local.desde) : "—"}. Debería haber:</p>
                  <ul className="mt-1 space-y-0.5">
                    <Linea etiqueta="Base" valor={f.caja_local.base ?? 0} />
                    <Linea etiqueta="Ventas en efectivo" valor={f.caja_local.efectivo_ventas ?? 0} />
                    {!!f.caja_local.cobros && <Linea etiqueta="Fiado cobrado" valor={f.caja_local.cobros} />}
                    {!!f.caja_local.retiros && <Linea etiqueta="Retiros" valor={-f.caja_local.retiros} />}
                  </ul>
                </>
              ) : f.caja_local.desde ? (
                <p>
                  Lo que se contó al cerrar el {fechaCorta(f.caja_local.desde)} a las {horaBogota(f.caja_local.desde)}
                  {f.caja_local.cerrado_por ? ` (${f.caja_local.cerrado_por})` : ""}.
                </p>
              ) : (
                <p>Todavía no hay cierres de caja.</p>
              )}
            </Cuenta>
            <Cuenta Icono={Landmark} titulo="Bold (banco)" monto={f.bold} alAjustar={() => setAjustando("bold")}>
              <p>Lo cobrado por Bold (menos la comisión) menos lo pagado con tarjeta.</p>
            </Cuenta>
            <Cuenta Icono={Smartphone} titulo="Nequi / transferencias" monto={f.nequi} alAjustar={() => setAjustando("nequi")}>
              <p>Lo recibido por Nequi menos lo pagado por transferencia.</p>
            </Cuenta>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tarjeta>
              <Subtitulo>Plata entregada a socios (retiros de caja)</Subtitulo>
              {f.entregado_socios.length === 0 ? (
                <p className="text-cafe-300">Ninguna todavía.</p>
              ) : (
                <ul className="divide-y divide-cafe-100">
                  {f.entregado_socios.map((x) => (
                    <Fila key={x.tercero} etiqueta={x.tercero} valor={x.monto} />
                  ))}
                </ul>
              )}
            </Tarjeta>
            <Tarjeta>
              <Subtitulo>Plata que pusieron los socios (compras y gastos)</Subtitulo>
              {f.puesto_por_socios.length === 0 ? (
                <p className="text-cafe-300">Ninguna registrada.</p>
              ) : (
                <ul className="divide-y divide-cafe-100">
                  {f.puesto_por_socios.map((x) => (
                    <Fila key={x.socio} etiqueta={x.socio} valor={x.monto} />
                  ))}
                </ul>
              )}
            </Tarjeta>
          </div>

          <Tarjeta>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Subtitulo>Entradas y salidas</Subtitulo>
              <div className="flex flex-wrap gap-2">
                {RANGOS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setRango(r.id)}
                    className={`min-h-10 rounded-full px-4 font-etiqueta text-sm font-semibold ${
                      rango === r.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                    }`}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>
            <Periodo f={f} />
          </Tarjeta>
        </>
      )}

      {ajustando && f && (
        <ModalAjuste
          cuenta={ajustando}
          actual={f[ajustando]}
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

function Periodo({ f }: { f: Flujo }) {
  const e = f.periodo.entradas;
  const entradas: [string, number][] = [
    ["Ventas en efectivo", e.efectivo.ventas],
    ["Fiado cobrado en efectivo", e.efectivo.cobros],
    ["Ventas por Bold", e.datafono.ventas],
    ["Fiado cobrado por Bold", e.datafono.cobros],
    ["Comisión Bold", -e.datafono.comisiones],
    ["Ventas por Nequi", e.nequi.ventas],
    ["Fiado cobrado por Nequi", e.nequi.cobros],
  ].filter(([, v]) => v !== 0) as [string, number][];
  const totalEntradas = entradas.reduce((s, [, v]) => s + v, 0);

  const nombres: Record<string, string> = { ...Object.fromEntries(PAGOS_COMPRA.map((p) => [p.id, p.nombre])), sin_registrar: "Sin forma de pago registrada" };
  const salidas = Object.entries(f.periodo.salidas)
    .map(([k, v]) => [nombres[k] ?? k, v.compras, v.gastos] as const)
    .filter(([, c, g]) => c + g > 0);
  const totalSalidas = salidas.reduce((s, [, c, g]) => s + c + g, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h3 className="mb-2 font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">Entró</h3>
        <ul className="divide-y divide-cafe-100">
          {entradas.map(([k, v]) => (
            <Fila key={k} etiqueta={k} valor={v} />
          ))}
          <Fila etiqueta="Total entradas" valor={totalEntradas} fuerte />
        </ul>
      </section>
      <section>
        <h3 className="mb-2 font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">Salió (compras y gastos)</h3>
        <ul className="divide-y divide-cafe-100">
          {salidas.map(([k, c, g]) => (
            <li key={k} className="flex items-baseline justify-between gap-3 py-2">
              <span>
                {k}
                <span className="block text-xs text-cafe-300">
                  {c > 0 && `compras ${cop(c)}`}
                  {c > 0 && g > 0 && " · "}
                  {g > 0 && `gastos ${cop(g)}`}
                </span>
              </span>
              <span className="numeros">{cop(c + g)}</span>
            </li>
          ))}
          <Fila etiqueta="Total salidas" valor={totalSalidas} fuerte />
        </ul>
      </section>
      <section className="rounded-2xl bg-crema-200 p-4 lg:col-span-2">
        <Fila etiqueta="Entradas − salidas del periodo" valor={totalEntradas - totalSalidas} fuerte />
      </section>
      {f.periodo.retiros.length > 0 && (
        <section className="lg:col-span-2">
          <h3 className="mb-2 font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">Retiros de la caja del local</h3>
          <ul className="divide-y divide-cafe-100">
            {f.periodo.retiros.map((r, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="font-etiqueta font-semibold">{r.tercero}</span>
                  <span className="text-sm text-cafe-700">
                    {" "}
                    · {fechaCorta(r.fecha)} {horaBogota(r.fecha)}
                    {r.motivo ? ` · ${r.motivo}` : ""}
                  </span>
                </span>
                <span className="numeros">{cop(r.monto)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Cuenta({
  Icono,
  titulo,
  monto,
  alAjustar,
  children,
}: {
  Icono: typeof Wallet;
  titulo: string;
  monto: number;
  alAjustar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tarjeta className="flex flex-col">
      <p className="flex items-center gap-2 font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-700">
        <Icono className="size-5" /> {titulo}
      </p>
      <p className={`numeros mt-1 font-titulo text-4xl font-extrabold ${monto < 0 ? "text-rojo" : ""}`}>{cop(monto)}</p>
      <div className="mt-2 flex-1 text-sm text-cafe-700">{children}</div>
      {alAjustar && (
        <Boton variante="suave" className="mt-3 min-h-10 self-start px-3 text-sm" onClick={alAjustar}>
          Ajustar al saldo real
        </Boton>
      )}
    </Tarjeta>
  );
}

function Linea({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <li className="flex justify-between gap-3">
      <span>{etiqueta}</span>
      <span className="numeros">{valor < 0 ? `−${cop(-valor)}` : cop(valor)}</span>
    </li>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <li className={`flex items-baseline justify-between gap-3 py-2 ${fuerte ? "font-etiqueta font-extrabold" : ""}`}>
      <span>{etiqueta}</span>
      <span className={`numeros ${fuerte ? "font-titulo text-xl" : ""} ${valor < 0 ? "text-rojo" : ""}`}>
        {valor < 0 ? `−${cop(-valor)}` : cop(valor)}
      </span>
    </li>
  );
}

function ModalAjuste({
  cuenta,
  actual,
  alCerrar,
  alGuardar,
}: {
  cuenta: "bold" | "nequi";
  actual: number;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [real, setReal] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const nombre = cuenta === "bold" ? "Bold" : "Nequi";

  const guardar = async () => {
    if (real === null) return setError("Escribe el saldo que muestra la app de " + nombre + ".");
    setGuardando(true);
    try {
      exigir(await db().rpc("ajustar_saldo_cuenta", { p_cuenta: cuenta, p_saldo_real: real, p_nota: nota }));
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
      titulo={`Saldo real de ${nombre}`}
      pie={
        <Boton onClick={guardar} cargando={guardando} className="w-full">
          Guardar saldo
        </Boton>
      }
    >
      <p className="mb-4 text-sm text-cafe-700">
        La app calcula {cop(actual)}. Si en {nombre} ves otro saldo (por plata que entró o salió por fuera de la app), escríbelo y
        la diferencia queda registrada como ajuste.
      </p>
      <div className="grid gap-4">
        <Campo etiqueta={`Saldo que muestra ${nombre} hoy`}>
          <EntradaPesos valor={real} alCambiar={setReal} placeholder="$0" />
        </Campo>
        <Campo etiqueta="Nota (opcional)">
          <Entrada value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. Transferí a la cuenta de Jhon" />
        </Campo>
      </div>
      {real !== null && <p className="mt-3 text-sm font-semibold">Ajuste: {real - actual >= 0 ? "+" : "−"}{cop(Math.abs(real - actual))}</p>}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}
