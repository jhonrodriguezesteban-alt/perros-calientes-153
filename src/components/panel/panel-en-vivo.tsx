"use client";

import { useCallback, useEffect, useState } from "react";
import { cop, NOMBRE_METODO } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { MetodoPago } from "@/lib/tipos";

const METODOS: MetodoPago[] = ["efectivo", "datafono", "nequi", "credito"];

interface VentaResumen {
  total: number;
  metodo_pago: MetodoPago;
  vendida_en: string;
  comision_datafono: number;
  venta_items: { cantidad: number; tipo_producto: string }[];
  venta_pagos: { metodo: string; monto: number }[];
}

/** Lo recibido por método: una venta mixta aporta a varios; lo fiado va a "credito". */
function montosPorMetodo(v: VentaResumen): [string, number][] {
  if (v.metodo_pago === "credito") return [["credito", v.total]];
  if (v.venta_pagos?.length) return v.venta_pagos.map((p) => [p.metodo, p.monto]);
  return [[v.metodo_pago, v.total]];
}

interface Dia {
  dia: string;
  total: number;
  perros: number;
  bebidas: number;
  porMetodo: Record<string, number>;
}

interface PuntoEquilibrio {
  fuente: string;
  pe_unidades_dia: number | null;
  pe_unidades_mes: number | null;
  costos_fijos: number;
  margen_contribucion_mes: number;
  avance_pct: number | null;
  margen_combinado_por_perro: number;
  merma_pct: number;
  perros_vendidos_mes: number;
}

const diaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
const nombreDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });

function inicioDelMesBogota() {
  return `${diaBogota.format(new Date()).slice(0, 7)}-01T00:00:00-05:00`;
}

/** Primer día del mes anterior (para poder ver el mes pasado). */
function inicioMesPasadoBogota() {
  const [a, m] = diaBogota.format(new Date()).slice(0, 7).split("-").map(Number);
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  return `${anterior}-01T00:00:00-05:00`;
}

const nombreMes = new Intl.DateTimeFormat("es-CO", { month: "long", timeZone: "America/Bogota" });

function porDia(ventas: VentaResumen[]): Dia[] {
  const mapa = new Map<string, Dia>();
  for (const v of ventas) {
    const dia = diaBogota.format(new Date(v.vendida_en));
    const d = mapa.get(dia) ?? { dia, total: 0, perros: 0, bebidas: 0, porMetodo: {} };
    d.total += v.total;
    for (const [m, monto] of montosPorMetodo(v)) d.porMetodo[m] = (d.porMetodo[m] ?? 0) + monto;
    for (const i of v.venta_items) {
      if (i.tipo_producto === "perro") d.perros += i.cantidad;
      else if (i.tipo_producto === "bebida") d.bebidas += i.cantidad;
    }
    mapa.set(dia, d);
  }
  return [...mapa.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

function consultarVentas(conPagos: boolean) {
  return supabaseNavegador()
    .from("ventas")
    .select(`total, metodo_pago, vendida_en, comision_datafono, venta_items(cantidad, tipo_producto)${conPagos ? ", venta_pagos(metodo, monto)" : ""}`)
    .eq("estado", "completada")
    .gte("vendida_en", inicioMesPasadoBogota());
}

async function obtenerDatos() {
  const [primera, p] = await Promise.all([consultarVentas(true), supabaseNavegador().rpc("punto_equilibrio")]);
  // Si la base todavía no tiene el detalle de pagos (migración de pagos
  // mixtos sin correr), se muestran las ventas igual, por su método.
  const v = primera.error ? await consultarVentas(false) : primera;
  return {
    ventas: v.error ? null : ((v.data ?? []) as unknown as VentaResumen[]),
    error: v.error ? v.error.message : null,
    pe: p.error ? null : (p.data as PuntoEquilibrio),
  };
}

/** Cifras del día, del mes (día por día) y punto de equilibrio, en vivo. */
export function PanelEnVivo() {
  const [ventasDosMeses, setVentas] = useState<VentaResumen[]>([]);
  const [verMesPasado, setVerMesPasado] = useState(false);
  const [pe, setPe] = useState<PuntoEquilibrio | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const d = await obtenerDatos();
    setError(d.error);
    if (d.ventas) setVentas(d.ventas);
    if (d.pe) setPe(d.pe);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    const supabase = supabaseNavegador();
    const canal = supabase
      .channel("panel-ventas")
      .on("postgres_changes", { event: "*", schema: "public", table: "ventas" }, () => void cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "gastos" }, () => void cargar())
      .subscribe((estado: string) => {
        // Al (re)conectar, traer el estado actual por si algo cambió mientras tanto.
        if (estado === "SUBSCRIBED") void cargar();
      });
    return () => {
      clearTimeout(t);
      void supabase.removeChannel(canal);
    };
  }, [cargar]);

  const hoy = diaBogota.format(new Date());
  const inicioMes = new Date(inicioDelMesBogota()).getTime();
  const ventasMes = ventasDosMeses.filter((v) => new Date(v.vendida_en).getTime() >= inicioMes);
  const ventasMesPasado = ventasDosMeses.filter((v) => new Date(v.vendida_en).getTime() < inicioMes);
  const ventas = ventasMes.filter((v) => diaBogota.format(new Date(v.vendida_en)) === hoy);
  const dias = porDia(verMesPasado ? ventasMesPasado : ventasMes);
  const diasMesActual = porDia(ventasMes);
  const mesActual = {
    total: diasMesActual.reduce((s, d) => s + d.total, 0),
    perros: diasMesActual.reduce((s, d) => s + d.perros, 0),
    bebidas: diasMesActual.reduce((s, d) => s + d.bebidas, 0),
  };
  const nombreMesPasado = nombreMes.format(new Date(inicioMesPasadoBogota()));
  const nombreMesActual = nombreMes.format(new Date(inicioDelMesBogota()));
  const mes = {
    total: dias.reduce((s, d) => s + d.total, 0),
    perros: dias.reduce((s, d) => s + d.perros, 0),
    bebidas: dias.reduce((s, d) => s + d.bebidas, 0),
  };
  const total = ventas.reduce((s, v) => s + v.total, 0);
  const comisionMes = ventasMes.reduce((s, v) => s + (v.comision_datafono ?? 0), 0);
  const faltaMargen = pe ? pe.costos_fijos - pe.margen_contribucion_mes : 0;
  const porMetodo = METODOS.map((m) => ({
    m,
    valor: ventas.reduce((s, v) => s + montosPorMetodo(v).filter(([x]) => x === m).reduce((a, [, n]) => a + n, 0), 0),
    n: ventas.filter((v) => montosPorMetodo(v).some(([x]) => x === m)).length,
  })).filter(
    (x) => x.valor > 0 || x.m === "efectivo" || x.m === "datafono",
  );
  const avance = Math.max(0, Math.min(100, pe?.avance_pct ?? 0));

  return (
    <div className="space-y-6">
        <section>
          <h1 className="font-titulo text-3xl font-extrabold">Hoy</h1>
          {error && (
            <p className="mt-3 rounded-2xl bg-rojo/10 px-4 py-3 font-semibold text-rojo">No se pudieron cargar las ventas: {error}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tarjeta etiqueta="Ventas" valor={cop(total)} destacado />
            <Tarjeta etiqueta="Transacciones" valor={String(ventas.length)} />
            {porMetodo.map(({ m, valor, n }) => (
              <Tarjeta
                key={m}
                etiqueta={NOMBRE_METODO[m]}
                valor={cop(valor)}
                nota={total ? `${n} ${n === 1 ? "transacción" : "transacciones"} · ${Math.round((valor / total) * 100)}%` : undefined}
              />
            ))}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-titulo text-2xl font-extrabold first-letter:uppercase">
              {verMesPasado ? `${nombreMesPasado} (mes pasado)` : "Este mes"}
            </h2>
            <div className="flex gap-1 rounded-full bg-crema-200 p-1">
              {[false, true].map((pasado) => (
                <button
                  key={String(pasado)}
                  onClick={() => setVerMesPasado(pasado)}
                  className={`min-h-9 rounded-full px-4 font-etiqueta text-sm font-semibold first-letter:uppercase ${
                    verMesPasado === pasado ? "bg-cafe text-crema" : "text-cafe-700"
                  }`}
                >
                  {pasado ? nombreMesPasado : nombreMesActual}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tarjeta etiqueta={verMesPasado ? `Ventas de ${nombreMesPasado}` : "Ventas del mes"} valor={cop(mes.total)} destacado />
            <Tarjeta etiqueta="Perros vendidos" valor={String(mes.perros)} />
            <Tarjeta etiqueta="Bebidas vendidas" valor={String(mes.bebidas)} />
            <Tarjeta etiqueta="Perros por día" valor={dias.length ? (mes.perros / dias.length).toFixed(1) : "—"} nota={`${dias.length} ${dias.length === 1 ? "día" : "días"} con ventas`} />
          </div>
          {dias.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-2xl bg-crema ring-2 ring-cafe-100">
              <table className="w-full min-w-[640px] text-right">
                <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                  <tr className="border-b-2 border-cafe-100">
                    <th className="px-3 py-2 text-left">Día</th>
                    <th className="px-3 py-2">Perros</th>
                    <th className="px-3 py-2">Bebidas</th>
                    {METODOS.map((m) => (
                      <th key={m} className="px-3 py-2">
                        {NOMBRE_METODO[m]}
                      </th>
                    ))}
                    <th className="px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="numeros">
                  {dias.map((d) => (
                    <tr key={d.dia} className={`border-b border-cafe-100 last:border-0 ${d.dia === hoy ? "bg-mostaza-100/60" : ""}`}>
                      <td className="px-3 py-2 text-left font-etiqueta font-semibold first-letter:uppercase">
                        {nombreDia.format(new Date(`${d.dia}T12:00:00-05:00`))}
                      </td>
                      <td className="px-3 py-2">{d.perros}</td>
                      <td className="px-3 py-2">{d.bebidas}</td>
                      {METODOS.map((m) => (
                        <td key={m} className="px-3 py-2 text-cafe-700">
                          {d.porMetodo[m] ? cop(d.porMetodo[m]) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 font-titulo text-lg font-extrabold">{cop(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {pe && (
          <section className="rounded-3xl bg-cafe p-6 text-crema">
            <h2 className="font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-300">Punto de equilibrio del mes</h2>
            <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-2">
              <p>
                <span className="numeros font-titulo text-5xl font-extrabold text-mostaza">{pe.pe_unidades_dia ?? "—"}</span>
                <span className="ml-2 font-etiqueta font-semibold">perros/día</span>
              </p>
              <p className="text-cafe-100">
                {pe.pe_unidades_mes ?? "—"} al mes · cada perro deja {cop(pe.margen_combinado_por_perro)} (promedio de los últimos 30 días)
              </p>
            </div>
            {pe.fuente === "ventas_reales" && (
              <dl className="mt-5 max-w-xl space-y-1 rounded-2xl bg-cafe-700/60 p-4 text-sm sm:text-base">
                <FilaMargen
                  etiqueta={`Ventas del mes (${mesActual.perros} perros · ${mesActual.bebidas} bebidas)`}
                  valor={mesActual.total}
                />
                <FilaMargen etiqueta={`− Insumos usados (con ${pe.merma_pct}% de merma)`} valor={-(mesActual.total - comisionMes - pe.margen_contribucion_mes)} />
                <FilaMargen etiqueta="− Comisión Bold" valor={-comisionMes} />
                <FilaMargen etiqueta="= Margen acumulado" valor={pe.margen_contribucion_mes} fuerte />
              </dl>
            )}
            <div className="mt-5">
              <div className="mb-1 flex justify-between font-etiqueta text-sm font-semibold">
                <span>Margen acumulado {cop(pe.margen_contribucion_mes)}</span>
                <span>Costos fijos {cop(pe.costos_fijos)}</span>
              </div>
              <div className="h-4 overflow-hidden rounded-full bg-cafe-700">
                <div className="h-full rounded-full bg-mostaza transition-all" style={{ width: `${avance}%` }} />
              </div>
              <p className="mt-2 text-sm text-cafe-100">
                {avance.toFixed(0)}% cubierto
                {faltaMargen > 0 && pe.margen_combinado_por_perro > 0 &&
                  ` · faltan ${cop(faltaMargen)} de margen ≈ ${Math.ceil(faltaMargen / pe.margen_combinado_por_perro)} perros más este mes`}
                {pe.fuente !== "ventas_reales" && " · calculado con catálogo y estimados (aún no hay ventas este mes)"}
              </p>
            </div>
          </section>
        )}

    </div>
  );
}

function Tarjeta({ etiqueta, valor, nota, destacado }: { etiqueta: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="rounded-2xl bg-crema p-4 ring-2 ring-cafe-100">
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className={`numeros font-titulo text-2xl font-extrabold sm:text-3xl ${destacado ? "text-rojo" : ""}`}>{valor}</p>
      {nota && <p className="font-etiqueta text-sm font-semibold text-cafe-300">{nota}</p>}
    </div>
  );
}

function FilaMargen({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${fuerte ? "border-t border-cafe-300/40 pt-1 font-extrabold text-mostaza" : "text-cafe-100"}`}>
      <dt>{etiqueta}</dt>
      <dd className="numeros whitespace-nowrap">{valor < 0 ? `−${cop(-valor)}` : cop(valor)}</dd>
    </div>
  );
}
