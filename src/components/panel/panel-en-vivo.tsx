"use client";

import { useCallback, useEffect, useState } from "react";
import { cop, NOMBRE_METODO } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { MetodoPago } from "@/lib/tipos";

const METODOS: MetodoPago[] = ["efectivo", "datafono", "nequi", "credito"];

interface VentaResumen {
  total: number;
  metodo_pago: MetodoPago;
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

function inicioDeHoyBogota() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
  return `${hoy}T00:00:00-05:00`;
}

async function obtenerDatos() {
  const supabase = supabaseNavegador();
  const [v, p] = await Promise.all([
    supabase.from("ventas").select("total, metodo_pago").eq("estado", "completada").gte("vendida_en", inicioDeHoyBogota()),
    supabase.rpc("punto_equilibrio"),
  ]);
  return {
    ventas: v.error ? null : (v.data as VentaResumen[]),
    pe: p.error ? null : (p.data as PuntoEquilibrio),
  };
}

/** Primera versión del panel: cifras del día y punto de equilibrio en vivo. */
export function PanelEnVivo() {
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
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
