"use client";

import { MessageCircle, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { db, fechaCorta } from "@/lib/admin";
import { cop, NOMBRE_METODO } from "@/lib/formato";
import { Boton, Cargando, Encabezado, Entrada, exigir, Insignia, mensajeError, MensajeError, Subtitulo, Tarjeta, useDatos, Vacio } from "./ui";

interface VentaFiada {
  id: string;
  numero: number;
  cliente: string;
  total: number;
  vendida_en: string;
  cobrada_en: string | null;
  cobrada_metodo: string | null;
  venta_items: { cantidad: number; nombre_producto: string }[];
}

interface Deudor {
  clave: string;
  nombre: string;
  pendientes: VentaFiada[];
  debe: number;
  pagado: number;
  desde: string | null;
}

const METODOS_COBRO = ["efectivo", "datafono", "nequi"] as const;
type MetodoCobro = (typeof METODOS_COBRO)[number];

async function cargarFiados() {
  return exigir(
    await db()
      .from("ventas")
      .select("id, numero, cliente, total, vendida_en, cobrada_en, cobrada_metodo, venta_items(cantidad, nombre_producto)")
      .eq("metodo_pago", "credito")
      .eq("estado", "completada")
      .order("vendida_en", { ascending: false }),
  ) as VentaFiada[];
}

const claveDe = (nombre: string) => nombre.trim().toLocaleLowerCase("es");
const resumen = (v: VentaFiada) => v.venta_items.map((i) => `${i.cantidad}× ${i.nombre_producto}`).join(", ");
const diaBogota = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" });
/** Días de calendario (hora Colombia) entre la fecha y hoy. */
const diasDesde = (fecha: string) =>
  Math.round((Date.parse(diaBogota.format(new Date())) - Date.parse(diaBogota.format(new Date(fecha)))) / 86_400_000);

function agrupar(ventas: VentaFiada[]): Deudor[] {
  const mapa = new Map<string, Deudor>();
  for (const v of ventas) {
    const clave = claveDe(v.cliente);
    const d = mapa.get(clave) ?? { clave, nombre: v.cliente.trim(), pendientes: [], debe: 0, pagado: 0, desde: null };
    if (v.cobrada_en) d.pagado += v.total;
    else {
      d.pendientes.push(v);
      d.debe += v.total;
      if (!d.desde || v.vendida_en < d.desde) d.desde = v.vendida_en;
    }
    mapa.set(clave, d);
  }
  return [...mapa.values()].sort((a, b) => b.debe - a.debe || a.nombre.localeCompare(b.nombre));
}

/** Gestión de cobro: quién debe, cuánto y desde cuándo; cobrar y recordar por WhatsApp. */
export function DeudoresAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarFiados);
  const [aviso, setAviso] = useState<string | null>(null);
  const deudores = useMemo(() => agrupar(data ?? []), [data]);
  const conDeuda = deudores.filter((d) => d.debe > 0);
  const totalDebe = conDeuda.reduce((s, d) => s + d.debe, 0);
  const masAntigua = conDeuda.reduce<string | null>((m, d) => (d.desde && (!m || d.desde < m) ? d.desde : m), null);
  const pagos = (data ?? [])
    .filter((v) => v.cobrada_en)
    .sort((a, b) => (b.cobrada_en! > a.cobrada_en! ? 1 : -1))
    .slice(0, 30);
  const cobrado30 = pagos.filter((v) => diasDesde(v.cobrada_en!) <= 30).reduce((s, v) => s + v.total, 0);

  const alCambiar = (mensaje: string) => {
    setAviso(mensaje);
    recargar();
  };

  return (
    <div className="space-y-6">
      <Encabezado titulo="Deudores" descripcion="Lo que se ha fiado: quién debe, cuánto y desde cuándo. Cobra aquí o desde el POS." />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}
      {aviso && <p className="rounded-2xl bg-cafe px-4 py-3 font-etiqueta font-semibold text-crema">{aviso}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra etiqueta="Por cobrar" valor={cop(totalDebe)} destacado />
            <Cifra etiqueta="Personas que deben" valor={String(conDeuda.length)} />
            <Cifra etiqueta="Deuda más antigua" valor={masAntigua ? `${diasDesde(masAntigua)} días` : "—"} />
            <Cifra etiqueta="Cobrado (30 días)" valor={cop(cobrado30)} />
          </div>

          {conDeuda.length === 0 ? (
            <Vacio>Nadie debe nada. 🎉</Vacio>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {conDeuda.map((d) => (
                <TarjetaDeudor key={d.clave} deudor={d} alCambiar={alCambiar} />
              ))}
            </div>
          )}

          <Tarjeta>
            <Subtitulo>Pagos recibidos</Subtitulo>
            {pagos.length === 0 ? (
              <p className="text-cafe-300">Todavía no hay pagos de deudas.</p>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {pagos.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="font-etiqueta font-semibold">
                        {v.cliente} <span className="text-cafe-300">· #{v.numero}</span>
                      </p>
                      <p className="truncate text-sm text-cafe-700">
                        Fiado el {fechaCorta(v.vendida_en)} · pagó el {fechaCorta(v.cobrada_en!)} por {NOMBRE_METODO[v.cobrada_metodo ?? ""] ?? "—"}
                      </p>
                    </div>
                    <span className="numeros font-titulo text-lg font-bold">{cop(v.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  );
}

function TarjetaDeudor({ deudor, alCambiar }: { deudor: Deudor; alCambiar: (mensaje: string) => void }) {
  const [cobrando, setCobrando] = useState<string | "todo" | null>(null);
  const [renombrando, setRenombrando] = useState(false);
  const [nombre, setNombre] = useState(deudor.nombre);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dias = deudor.desde ? diasDesde(deudor.desde) : 0;

  const correr = async (accion: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, mensaje: string) => {
    setGuardando(true);
    setError(null);
    try {
      exigir(await accion());
      setCobrando(null);
      setRenombrando(false);
      alCambiar(mensaje);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const cobrar = (metodo: MetodoCobro) => {
    if (cobrando === "todo") {
      void correr(
        () => db().rpc("cobrar_cliente", { p_cliente: deudor.nombre, p_metodo: metodo }),
        `${deudor.nombre} pagó todo: ${cop(deudor.debe)} (${NOMBRE_METODO[metodo]})`,
      );
    } else if (cobrando) {
      const v = deudor.pendientes.find((p) => p.id === cobrando)!;
      void correr(
        () => db().rpc("cobrar_venta", { p_venta_id: v.id, p_metodo: metodo }),
        `${deudor.nombre} pagó ${cop(v.total)} (${NOMBRE_METODO[metodo]})`,
      );
    }
  };

  const recordatorio =
    `Hola ${deudor.nombre.split(" ")[0]}, te saludamos de Bendito Perro Caliente 🌭. ` +
    `Te recordamos que tienes pendiente ${cop(deudor.debe)} ` +
    `(${deudor.pendientes.map((v) => `${fechaCorta(v.vendida_en)}: ${cop(v.total)}`).join("; ")}). ¡Gracias!`;

  return (
    <Tarjeta className={dias >= 8 ? "ring-rojo" : dias >= 3 ? "ring-mostaza" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {renombrando ? (
            <div className="flex flex-wrap items-center gap-2">
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} className="w-56" aria-label="Nombre del deudor" />
              <Boton
                variante="secundario"
                cargando={guardando}
                disabled={!nombre.trim() || nombre.trim() === deudor.nombre}
                onClick={() => void correr(() => db().rpc("renombrar_deudor", { p_actual: deudor.nombre, p_nuevo: nombre }), `Ahora se llama ${nombre.trim()}`)}
              >
                Guardar
              </Boton>
              <Boton variante="suave" onClick={() => setRenombrando(false)}>
                Cancelar
              </Boton>
            </div>
          ) : (
            <h3 className="flex items-center gap-2 font-titulo text-2xl font-extrabold">
              {deudor.nombre}
              <button aria-label={`Cambiar nombre de ${deudor.nombre}`} onClick={() => setRenombrando(true)} className="rounded-full p-1 text-cafe-300 active:bg-cafe-100">
                <Pencil className="size-4" />
              </button>
            </h3>
          )}
          <p className="mt-1 flex flex-wrap gap-2">
            <Insignia tono={dias >= 8 ? "peligro" : dias >= 3 ? "alerta" : "neutro"}>{dias === 0 ? "Desde hoy" : `Hace ${dias} ${dias === 1 ? "día" : "días"}`}</Insignia>
            {deudor.pagado > 0 && <Insignia>Ya ha pagado {cop(deudor.pagado)}</Insignia>}
          </p>
        </div>
        <p className="numeros font-titulo text-3xl font-extrabold text-rojo">{cop(deudor.debe)}</p>
      </div>

      <ul className="mt-4 space-y-2">
        {deudor.pendientes.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 rounded-2xl bg-crema-200 px-4 py-3">
            <div className="min-w-0">
              <p className="font-etiqueta text-sm font-semibold">
                {fechaCorta(v.vendida_en)} · #{v.numero}
              </p>
              <p className="truncate text-sm text-cafe-700">{resumen(v)}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="numeros font-titulo text-lg font-bold">{cop(v.total)}</span>
              {deudor.pendientes.length > 1 && (
                <button onClick={() => setCobrando(v.id)} className="rounded-xl px-3 py-2 font-etiqueta text-sm font-semibold ring-2 ring-cafe-100 active:bg-cafe-100">
                  Cobrar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {cobrando ? (
        <div className="mt-4 rounded-2xl bg-cafe p-4 text-crema">
          <p className="font-etiqueta font-semibold">
            ¿Cómo pagó {cobrando === "todo" ? cop(deudor.debe) : cop(deudor.pendientes.find((p) => p.id === cobrando)?.total ?? 0)}?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {METODOS_COBRO.map((m) => (
              <button
                key={m}
                disabled={guardando}
                onClick={() => cobrar(m)}
                className="min-h-12 rounded-xl bg-crema px-5 font-etiqueta font-extrabold text-cafe active:bg-mostaza disabled:opacity-50"
              >
                {NOMBRE_METODO[m]}
              </button>
            ))}
            <button disabled={guardando} onClick={() => setCobrando(null)} className="min-h-12 rounded-xl px-4 font-etiqueta font-semibold ring-2 ring-cafe-300">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Boton onClick={() => setCobrando("todo")}>Cobrar {cop(deudor.debe)}</Boton>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(recordatorio)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-2xl px-5 font-etiqueta font-extrabold text-cafe ring-2 ring-cafe-100 active:bg-cafe-100"
          >
            <MessageCircle className="size-5" /> Recordar por WhatsApp
          </a>
        </div>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Tarjeta>
  );
}

function Cifra({ etiqueta, valor, destacado }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className="rounded-2xl bg-crema p-4 ring-2 ring-cafe-100">
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className={`numeros font-titulo text-2xl font-extrabold sm:text-3xl ${destacado ? "text-rojo" : ""}`}>{valor}</p>
    </div>
  );
}
