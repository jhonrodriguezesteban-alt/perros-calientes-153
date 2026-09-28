"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { cop, horaBogota } from "@/lib/formato";
import type { ResumenDia } from "@/lib/tipos";

const fechaLarga = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });

/** Texto del cierre para mandarlo por WhatsApp. */
export function textoCierre(r: ResumenDia) {
  const dif = (n: number) => (n === 0 ? "cuadra ✅" : n > 0 ? `sobran ${cop(n)}` : `faltan ${cop(-n)}`);
  const lineas = [
    `🌭 *Cierre de caja · Bendito Perro Caliente*`,
    `${fechaLarga.format(new Date(r.hasta))} · ${horaBogota(r.abierto_en)} a ${horaBogota(r.hasta)}${r.cerrado_por ? ` · ${r.cerrado_por}` : ""}`,
    ``,
    `*Vendido*`,
    `Perros: ${r.perros}${r.adicionales ? ` (${r.adicionales} adicionales)` : ""}`,
    ...r.productos.filter((p) => p.tipo !== "perro").map((p) => `${p.nombre}: ${p.cantidad}`),
    `Ventas: ${r.ventas} · Total ${cop(r.total)}`,
    ``,
    `*Efectivo*`,
    `Base: ${cop(r.base_inicial)}`,
    `Ventas en efectivo: ${cop(r.efectivo)}`,
    ...(r.cobros_fiado.efectivo ? [`Fiado cobrado en efectivo: ${cop(r.cobros_fiado.efectivo)}`] : []),
    ...(r.retiros ? [`Retiros: −${cop(r.retiros)}`] : []),
    `Debería haber: ${cop(r.efectivo_esperado)}`,
    `Hay: ${cop(r.efectivo_contado)} → ${dif(r.diferencia_efectivo)}`,
    ``,
    `*Bancos*`,
    `Bold: sistema ${cop(r.bold_esperado)} · recibido ${cop(r.bold_declarado)}`,
    `Nequi: sistema ${cop(r.nequi_esperado)} · recibido ${cop(r.nequi_declarado)}`,
    `Total bancos → ${dif(r.diferencia_bancos)}`,
    ...(r.fiado ? [``, `*Fiado hoy:* ${r.fiados.map((f) => `${f.cliente} ${cop(f.total)}`).join(", ")}`] : []),
    ...(r.retiros_detalle.length
      ? [``, `*Retiros:* ${r.retiros_detalle.map((x) => `${x.tercero} ${cop(x.monto)}${x.motivo ? ` (${x.motivo})` : ""}`).join(", ")}`]
      : []),
    ...(r.notas ? [``, `Notas: ${r.notas}`] : []),
  ];
  return lineas.join("\n");
}

/** Cuadre del día: lo vendido, efectivo y bancos (sistema vs. declarado). */
export function ResumenCierre({ resumen: r, compartir }: { resumen: ResumenDia; compartir?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const texto = textoCierre(r);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Cifra etiqueta="Perros" valor={String(r.perros)} nota={r.adicionales ? `${r.adicionales} adicionales` : undefined} />
        <Cifra etiqueta="Bebidas" valor={String(r.bebidas)} />
        <Cifra etiqueta="Vendido" valor={cop(r.total)} nota={`${r.ventas} ventas`} />
      </div>

      {r.productos.some((p) => p.tipo !== "perro") && (
        <p className="rounded-2xl bg-crema-200 px-4 py-3 text-sm">
          {r.productos
            .filter((p) => p.tipo !== "perro")
            .map((p) => `${p.nombre}: ${p.cantidad}`)
            .join(" · ")}
        </p>
      )}

      <Bloque titulo="Efectivo" diferencia={r.diferencia_efectivo}>
        <Fila etiqueta="Base" valor={r.base_inicial} />
        <Fila etiqueta="Ventas en efectivo" valor={r.efectivo} />
        {r.cobros_fiado.efectivo > 0 && <Fila etiqueta="Fiado cobrado en efectivo" valor={r.cobros_fiado.efectivo} />}
        {r.retiros > 0 && <Fila etiqueta="Retiros" valor={-r.retiros} />}
        <Fila etiqueta="Debería haber" valor={r.efectivo_esperado} fuerte />
        <Fila etiqueta="Hay (contado)" valor={r.efectivo_contado} fuerte />
      </Bloque>

      <Bloque titulo="Bancos (Bold + Nequi)" diferencia={r.diferencia_bancos}>
        <Fila etiqueta="Bold · sistema" valor={r.bold_esperado} />
        <Fila etiqueta="Bold · recibido" valor={r.bold_declarado} />
        <Fila etiqueta="Nequi · sistema" valor={r.nequi_esperado} />
        <Fila etiqueta="Nequi · recibido" valor={r.nequi_declarado} />
        <Fila etiqueta="Debería haber" valor={r.bancos_esperado} fuerte />
        <Fila etiqueta="Recibido" valor={r.bancos_declarado} fuerte />
      </Bloque>

      {r.fiados.length > 0 && (
        <p className="text-sm">
          <strong>Fiado hoy ({cop(r.fiado)}):</strong> {r.fiados.map((f) => `${f.cliente} ${cop(f.total)}`).join(", ")}
        </p>
      )}
      {r.retiros_detalle.length > 0 && (
        <p className="text-sm">
          <strong>Retiros:</strong>{" "}
          {r.retiros_detalle.map((x) => `${x.tercero} ${cop(x.monto)}${x.motivo ? ` (${x.motivo})` : ""}`).join(", ")}
        </p>
      )}
      {r.notas && <p className="text-sm text-cafe-700">Notas: {r.notas}</p>}

      {compartir && (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-cafe font-etiqueta text-lg font-extrabold text-crema active:bg-cafe-700"
          >
            <MessageCircle className="size-5" /> Enviar por WhatsApp
          </a>
          <button
            onClick={() =>
              void navigator.clipboard?.writeText(texto).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              })
            }
            className="flex h-14 items-center justify-center gap-2 rounded-2xl font-etiqueta text-lg font-extrabold ring-2 ring-cafe-100 active:bg-cafe-100"
          >
            <Copy className="size-5" /> {copiado ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      )}
    </div>
  );
}

function Bloque({ titulo, diferencia, children }: { titulo: string; diferencia: number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 ring-2 ring-cafe-100">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-etiqueta font-extrabold uppercase tracking-wide text-cafe-700">{titulo}</h3>
        <span
          className={`rounded-full px-3 py-1 font-etiqueta text-sm font-extrabold ${
            diferencia === 0 ? "bg-cafe text-crema" : "bg-rojo/10 text-rojo"
          }`}
        >
          {diferencia === 0 ? "Cuadra" : diferencia > 0 ? `Sobran ${cop(diferencia)}` : `Faltan ${cop(-diferencia)}`}
        </span>
      </div>
      <dl className="space-y-1">{children}</dl>
    </section>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${fuerte ? "border-t border-cafe-100 pt-1" : ""}`}>
      <dt className={fuerte ? "font-semibold" : "text-cafe-700"}>{etiqueta}</dt>
      <dd className={`numeros ${fuerte ? "font-titulo text-xl font-extrabold" : ""}`}>
        {valor < 0 ? `−${cop(-valor)}` : cop(valor)}
      </dd>
    </div>
  );
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-2xl bg-crema-200 px-2 py-3">
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className="numeros font-titulo text-2xl font-extrabold">{valor}</p>
      {nota && <p className="text-xs text-cafe-700">{nota}</p>}
    </div>
  );
}
