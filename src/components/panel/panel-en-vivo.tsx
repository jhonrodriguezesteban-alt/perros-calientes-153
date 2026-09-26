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
  venta_items: { cantidad: number; tipo_producto: string }[];
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
  perros_vendidos_mes: number;
}

const diaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
const nombreDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });

function inicioDelMesBogota() {
  return `${diaBogota.format(new Date()).slice(0, 7)}-01T00:00:00-05:00`;
}

function porDia(ventas: VentaResumen[]): Dia[] {
  const mapa = new Map<string, Dia>();
  for (const v of ventas) {
    const dia = diaBogota.format(new Date(v.vendida_en));
    const d = mapa.get(dia) ?? { dia, total: 0, perros: 0, bebidas: 0, porMetodo: {} };
    d.total += v.total;
    d.porMetodo[v.metodo_pago] = (d.porMetodo[v.metodo_pago] ?? 0) + v.total;
    for (const i of v.venta_items) {
      if (i.tipo_producto === "perro") d.perros += i.cantidad;
      else if (i.tipo_producto === "bebida") d.bebidas += i.cantidad;
    }
    mapa.set(dia, d);
  }
  return [...mapa.values()].sort((a, b) => b.dia.localeCompare(a.dia));
}

async function obtenerDatos() {
  const supabase = supabaseNavegador();
  const [v, p] = await Promise.all([
    supabase
      .from("ventas")
      .select("total, metodo_pago, vendida_en, venta_items(cantidad, tipo_producto)")
      .eq("estado", "completada")
      .gte("vendida_en", inicioDelMesBogota()),
    supabase.rpc("punto_equilibrio"),
  ]);
  return {
    ventas: v.error ? null : (v.data as VentaResumen[]),
    pe: p.error ? null : (p.data as PuntoEquilibrio),
  };
}

/** Cifras del día, del mes (día por día) y punto de equilibrio, en vivo. */
export function PanelEnVivo() {
  const [ventasMes, setVentas] = useState<VentaResumen[]>([]);
  const [pe, setPe] = useState<PuntoEquilibrio | null>(null);

  const cargar = useCallback(async () => {
    const d = await obtenerDatos();
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
  const ventas = ventasMes.filter((v) => diaBogota.format(new Date(v.vendida_en)) === hoy);
  const dias = porDia(ventasMes);
  const mes = {
    total: dias.reduce((s, d) => s + d.total, 0),
    perros: dias.reduce((s, d) => s + d.perros, 0),
    bebidas: dias.reduce((s, d) => s + d.bebidas, 0),
  };
  const total = ventas.reduce((s, v) => s + v.total, 0);
  const porMetodo = METODOS.map((m) => ({ m, valor: ventas.filter((v) => v.metodo_pago === m).reduce((s, v) => s + v.total, 0) })).filter(
    (x) => x.valor > 0 || x.m === "efectivo" || x.m === "datafono",
  );
  const avance = Math.max(0, Math.min(100, pe?.avance_pct ?? 0));

  return (
    <div className="space-y-6">
        <section>
          <h1 className="font-titulo text-3xl font-extrabold">Hoy</h1>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tarjeta etiqueta="Ventas" valor={cop(total)} destacado />
            <Tarjeta etiqueta="Transacciones" valor={String(ventas.length)} />
            {porMetodo.map(({ m, valor }) => (
              <Tarjeta key={m} etiqueta={NOMBRE_METODO[m]} valor={cop(valor)} nota={total ? `${Math.round((valor / total) * 100)}%` : undefined} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-titulo text-2xl font-extrabold">Este mes</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tarjeta etiqueta="Ventas del mes" valor={cop(mes.total)} destacado />
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
                {pe.pe_unidades_mes ?? "—"} al mes · margen combinado {cop(pe.margen_combinado_por_perro)} por perro
              </p>
            </div>
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
