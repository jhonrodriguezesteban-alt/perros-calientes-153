"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { db, hoyBogota } from "@/lib/admin";
import { cop, detallePagos, horaBogota, NOMBRE_METODO } from "@/lib/formato";
import { Cargando, Encabezado, Entrada, exigir, Insignia, mensajeError, MensajeError, Tarjeta, useDatos, Vacio } from "./ui";

interface Dia {
  dia: string;
  ventas: number;
  anuladas: number;
  perros: number;
  bebidas: number;
  adicionales: number;
  total: number;
  efectivo: number;
  bold: number;
  nequi: number;
  fiado: number;
  costo_insumos: number;
  comisiones: number;
}

interface VentaDetalle {
  id: string;
  numero: number;
  vendida_en: string;
  metodo_pago: string;
  total: number;
  estado: "completada" | "anulada";
  cliente: string | null;
  motivo_anulacion: string | null;
  vendedor: { nombre: string } | null;
  venta_items: {
    nombre_producto: string;
    tipo_producto: string;
    cantidad: number;
    subtotal: number;
    venta_item_toppings: { nombre_topping: string; precio_extra: number }[];
  }[];
  venta_pagos: { metodo: string; monto: number }[];
}

// Fechas como "YYYY-MM-DD" en hora de Colombia
const aFecha = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
const sumarDias = (dia: string, n: number) => aFecha(new Date(new Date(`${dia}T12:00:00-05:00`).getTime() + n * 86_400_000));
const nombreDia = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "America/Bogota" });
const nombreLargo = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });
const deDia = (dia: string) => new Date(`${dia}T12:00:00-05:00`);

type Rango = "hoy" | "ayer" | "7" | "mes" | "mes-pasado" | "otro";

function rangoDe(r: Rango): [string, string] {
  const hoy = hoyBogota();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  switch (r) {
    case "hoy":
      return [hoy, hoy];
    case "ayer":
      return [sumarDias(hoy, -1), sumarDias(hoy, -1)];
    case "7":
      return [sumarDias(hoy, -6), hoy];
    case "mes-pasado": {
      const fin = sumarDias(inicioMes, -1);
      return [`${fin.slice(0, 7)}-01`, fin];
    }
    default:
      return [inicioMes, hoy];
  }
}

const RANGOS: { id: Rango; nombre: string }[] = [
  { id: "hoy", nombre: "Hoy" },
  { id: "ayer", nombre: "Ayer" },
  { id: "7", nombre: "Últimos 7 días" },
  { id: "mes", nombre: "Este mes" },
  { id: "mes-pasado", nombre: "Mes pasado" },
  { id: "otro", nombre: "Elegir fechas" },
];

/** Ventas por rango de fechas; al tocar un día se ve el detalle completo. */
export function VentasAdmin() {
  const [rango, setRango] = useState<Rango>("mes");
  const [[desde, hasta], setFechas] = useState<[string, string]>(() => rangoDe("mes"));
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const cargar = useCallback(
    async () => exigir(await db().rpc("ventas_por_dia", { p_desde: desde, p_hasta: hasta })) as Dia[],
    [desde, hasta],
  );
  const { data, error, cargando } = useDatos(cargar);

  const elegir = (r: Rango) => {
    setRango(r);
    if (r !== "otro") setFechas(rangoDe(r));
  };

  const t = useMemo(() => {
    const d = data ?? [];
    const s = (k: keyof Dia) => d.reduce((a, x) => a + Number(x[k]), 0);
    return {
      total: s("total"),
      ventas: s("ventas"),
      perros: s("perros"),
      bebidas: s("bebidas"),
      adicionales: s("adicionales"),
      efectivo: s("efectivo"),
      bold: s("bold"),
      nequi: s("nequi"),
      fiado: s("fiado"),
      costo: s("costo_insumos"),
      comisiones: s("comisiones"),
      dias: d.length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      <Encabezado titulo="Ventas" descripcion="Elige un periodo y toca un día para ver cada venta, lo que se vendió y cómo se pagó." />

      <Tarjeta>
        <div className="flex flex-wrap gap-2">
          {RANGOS.map((r) => (
            <button
              key={r.id}
              onClick={() => elegir(r.id)}
              className={`min-h-11 rounded-full px-4 font-etiqueta text-sm font-semibold ${
                rango === r.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
              }`}
            >
              {r.nombre}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-etiqueta text-sm font-semibold">
            Desde
            <Entrada
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => {
                setRango("otro");
                setFechas([e.target.value, hasta]);
              }}
              className="w-auto"
            />
          </label>
          <label className="flex items-center gap-2 font-etiqueta text-sm font-semibold">
            Hasta
            <Entrada
              type="date"
              value={hasta}
              min={desde}
              max={hoyBogota()}
              onChange={(e) => {
                setRango("otro");
                setFechas([desde, e.target.value]);
              }}
              className="w-auto"
            />
          </label>
        </div>
      </Tarjeta>

      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Cifra etiqueta="Vendido" valor={cop(t.total)} nota={`${t.ventas} ventas · ${t.dias} ${t.dias === 1 ? "día" : "días"}`} destacado />
            <Cifra etiqueta="Perros" valor={String(t.perros)} nota={`${t.adicionales} adicionales`} />
            <Cifra etiqueta="Bebidas" valor={String(t.bebidas)} />
            <Cifra etiqueta="Ticket promedio" valor={t.ventas ? cop(t.total / t.ventas) : "—"} />
            <Cifra etiqueta="Efectivo" valor={cop(t.efectivo)} />
            <Cifra etiqueta="Bold" valor={cop(t.bold)} nota={t.comisiones ? `comisión ${cop(t.comisiones)}` : undefined} />
            <Cifra etiqueta="Nequi" valor={cop(t.nequi)} />
            <Cifra etiqueta="Fiado" valor={cop(t.fiado)} />
          </div>

          <Tarjeta>
            {data.length === 0 ? (
              <Vacio>No hay ventas en esas fechas.</Vacio>
            ) : (
              <div className="-mx-2 overflow-x-auto">
                <table className="w-full min-w-[760px] text-right">
                  <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                    <tr className="border-b-2 border-cafe-100">
                      <th className="px-2 py-2 text-left">Día</th>
                      <th className="px-2 py-2">Ventas</th>
                      <th className="px-2 py-2">Perros</th>
                      <th className="px-2 py-2">Bebidas</th>
                      <th className="px-2 py-2">Efectivo</th>
                      <th className="px-2 py-2">Bold</th>
                      <th className="px-2 py-2">Nequi</th>
                      <th className="px-2 py-2">Fiado</th>
                      <th className="px-2 py-2">Total</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="numeros">
                    {data.map((d) => (
                      <tr
                        key={d.dia}
                        onClick={() => setDiaAbierto(d.dia)}
                        className="cursor-pointer border-b border-cafe-100 active:bg-cafe-100 lg:hover:bg-mostaza-100/50"
                      >
                        <td className="px-2 py-3 text-left font-etiqueta font-semibold first-letter:uppercase">
                          {nombreDia.format(deDia(d.dia))}
                          {d.anuladas > 0 && <span className="ml-2 text-xs font-normal text-cafe-300">{d.anuladas} anuladas</span>}
                        </td>
                        <td className="px-2 py-3">{d.ventas}</td>
                        <td className="px-2 py-3">{d.perros}</td>
                        <td className="px-2 py-3">{d.bebidas}</td>
                        <td className="px-2 py-3 text-cafe-700">{d.efectivo ? cop(d.efectivo) : "—"}</td>
                        <td className="px-2 py-3 text-cafe-700">{d.bold ? cop(d.bold) : "—"}</td>
                        <td className="px-2 py-3 text-cafe-700">{d.nequi ? cop(d.nequi) : "—"}</td>
                        <td className="px-2 py-3 text-cafe-700">{d.fiado ? cop(d.fiado) : "—"}</td>
                        <td className="px-2 py-3 font-titulo text-lg font-extrabold">{cop(d.total)}</td>
                        <td className="px-2 py-3 text-cafe-300">
                          <ChevronRight className="ml-auto size-5" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Tarjeta>
        </>
      )}

      {diaAbierto && <DetalleDia dia={diaAbierto} alCerrar={() => setDiaAbierto(null)} />}
    </div>
  );
}

function DetalleDia({ dia, alCerrar }: { dia: string; alCerrar: () => void }) {
  const [ventas, setVentas] = useState<VentaDetalle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    void (async () => {
      try {
        const r = exigir(
          await db()
            .from("ventas")
            .select(
              "id, numero, vendida_en, metodo_pago, total, estado, cliente, motivo_anulacion, vendedor:perfiles!ventas_vendedor_id_fkey(nombre), venta_items(nombre_producto, tipo_producto, cantidad, subtotal, venta_item_toppings(nombre_topping, precio_extra)), venta_pagos(metodo, monto)",
            )
            .gte("vendida_en", `${dia}T00:00:00-05:00`)
            .lt("vendida_en", `${sumarDias(dia, 1)}T00:00:00-05:00`)
            .order("vendida_en"),
        ) as unknown as VentaDetalle[];
        if (activo) setVentas(r);
      } catch (e) {
        if (activo) setError(mensajeError(e));
      }
    })();
    return () => {
      activo = false;
    };
  }, [dia]);

  const ok = useMemo(() => (ventas ?? []).filter((v) => v.estado === "completada"), [ventas]);
  const productos = useMemo(() => {
    const m = new Map<string, { tipo: string; cantidad: number; total: number }>();
    for (const v of ok)
      for (const i of v.venta_items) {
        const x = m.get(i.nombre_producto) ?? { tipo: i.tipo_producto, cantidad: 0, total: 0 };
        x.cantidad += i.cantidad;
        x.total += i.subtotal;
        m.set(i.nombre_producto, x);
      }
    return [...m.entries()].sort((a, b) => (a[1].tipo === b[1].tipo ? b[1].cantidad - a[1].cantidad : a[1].tipo === "perro" ? -1 : 1));
  }, [ok]);
  const adicionales = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ok)
      for (const i of v.venta_items)
        for (const t of i.venta_item_toppings) if (t.precio_extra > 0) m.set(t.nombre_topping, (m.get(t.nombre_topping) ?? 0) + i.cantidad);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [ok]);
  const porMetodo = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ok) {
      if (v.metodo_pago === "credito") m.set("credito", (m.get("credito") ?? 0) + v.total);
      else if (v.venta_pagos.length) for (const p of v.venta_pagos) m.set(p.metodo, (m.get(p.metodo) ?? 0) + p.monto);
      else m.set(v.metodo_pago, (m.get(v.metodo_pago) ?? 0) + v.total);
    }
    return m;
  }, [ok]);
  const total = ok.reduce((s, v) => s + v.total, 0);

  return (
    <Modal abierto alCerrar={alCerrar} titulo={`Ventas del ${nombreLargo.format(deDia(dia))}`} ancho="max-w-3xl">
      {error && <MensajeError>{error}</MensajeError>}
      {!ventas && !error && (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-8 animate-spin text-cafe-300" />
        </div>
      )}
      {ventas && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Cifra etiqueta="Vendido" valor={cop(total)} nota={`${ok.length} ventas`} destacado />
            {["efectivo", "datafono", "nequi", "credito"].map((m) => (
              <Cifra key={m} etiqueta={NOMBRE_METODO[m]} valor={cop(porMetodo.get(m) ?? 0)} />
            ))}
          </div>

          <section>
            <h3 className="mb-2 font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">Lo que se vendió</h3>
            <ul className="divide-y divide-cafe-100 rounded-2xl ring-2 ring-cafe-100">
              {productos.map(([nombre, x]) => (
                <li key={nombre} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <span className="font-etiqueta font-semibold">
                    <span className="numeros mr-2 inline-block min-w-8 text-right text-rojo">{x.cantidad}×</span>
                    {nombre}
                  </span>
                  <span className="numeros">{cop(x.total)}</span>
                </li>
              ))}
            </ul>
            {adicionales.length > 0 && (
              <p className="mt-2 text-sm text-cafe-700">
                <strong>Adicionales:</strong> {adicionales.map(([n, c]) => `${n} ${c}`).join(" · ")}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">Cada venta</h3>
            <ul className="space-y-2">
              {ventas.map((v) => (
                <li key={v.id} className={`rounded-2xl p-3 ring-1 ring-cafe-100 ${v.estado === "anulada" ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-etiqueta font-semibold">
                      #{v.numero} · {horaBogota(v.vendida_en)} ·{" "}
                      {v.metodo_pago === "mixto" ? detallePagos(v.venta_pagos) : NOMBRE_METODO[v.metodo_pago]}
                      {v.cliente && ` · ${v.cliente}`}
                      {v.vendedor && <span className="font-normal text-cafe-300"> · {v.vendedor.nombre}</span>}
                    </p>
                    <span className="flex items-center gap-2">
                      {v.estado === "anulada" && <Insignia tono="peligro">ANULADA</Insignia>}
                      <span className={`numeros font-titulo text-lg font-extrabold ${v.estado === "anulada" ? "line-through" : ""}`}>
                        {cop(v.total)}
                      </span>
                    </span>
                  </div>
                  <ul className="mt-1 text-sm text-cafe-700">
                    {v.venta_items.map((i, n) => {
                      const extras = i.venta_item_toppings.filter((t) => t.precio_extra > 0);
                      return (
                        <li key={n}>
                          {i.cantidad}× {i.nombre_producto}
                          {extras.length > 0 && <span className="text-cafe-300"> + {extras.map((t) => t.nombre_topping).join(", ")}</span>}
                        </li>
                      );
                    })}
                  </ul>
                  {v.estado === "anulada" && v.motivo_anulacion && <p className="mt-1 text-xs text-rojo">Motivo: {v.motivo_anulacion}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}

function Cifra({ etiqueta, valor, nota, destacado }: { etiqueta: string; valor: string; nota?: string; destacado?: boolean }) {
  return (
    <div className="rounded-2xl bg-crema p-4 ring-2 ring-cafe-100">
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className={`numeros font-titulo text-2xl font-extrabold ${destacado ? "text-rojo" : ""}`}>{valor}</p>
      {nota && <p className="text-xs font-semibold text-cafe-300">{nota}</p>}
    </div>
  );
}
