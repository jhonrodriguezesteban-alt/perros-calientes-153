"use client";

import { CloudOff, Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CuentasPorCobrar } from "@/components/cuentas-por-cobrar";
import { Modal } from "@/components/modal";
import type { VentaEnCola } from "@/lib/cola-ventas";
import { cop, horaBogota, NOMBRE_METODO } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { VentaDeHoy } from "@/lib/tipos";

async function obtenerVentasDeHoy() {
  const { data, error } = await supabaseNavegador().rpc("ventas_de_hoy");
  return { error: !!error, ventas: (data ?? []) as VentaDeHoy[] };
}

const MOTIVOS = ["Error al digitar", "Cliente cambió de opinión", "Cobrada dos veces"];

export function ModalVentasHoy({
  cola,
  alCerrar,
  alReintentar,
  alDescartar,
  alAnular,
  alCobrar,
}: {
  cola: VentaEnCola[];
  alCerrar: () => void;
  alReintentar: () => void;
  alDescartar: (id: string) => void;
  alAnular: (mensaje: string) => void;
  alCobrar: (mensaje: string) => void;
}) {
  const [ventas, setVentas] = useState<VentaDeHoy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState<VentaDeHoy | null>(null);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof obtenerVentasDeHoy>>) => {
    if (r.error) setError("No pudimos traer las ventas. Revisa la conexión.");
    else {
      setError(null);
      setVentas(r.ventas);
    }
  }, []);
  const cargar = useCallback(async () => aplicar(await obtenerVentasDeHoy()), [aplicar]);

  useEffect(() => {
    let activo = true;
    void obtenerVentasDeHoy().then((r) => activo && aplicar(r));
    return () => {
      activo = false;
    };
  }, [aplicar]);

  const completadas = (ventas ?? []).filter((v) => v.estado === "completada");
  const suma = (m: string) => completadas.filter((v) => v.metodo_pago === m).reduce((s, v) => s + v.total, 0);
  const totalNequi = suma("nequi");
  const totalFiado = suma("credito");

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Ventas de hoy" ancho="max-w-2xl">
      <div className="mb-5 grid grid-cols-3 gap-3 text-center">
        <Cifra etiqueta="Ventas" valor={String(completadas.length)} />
        <Cifra etiqueta="Efectivo" valor={cop(suma("efectivo"))} />
        <Cifra etiqueta="Datáfono" valor={cop(suma("datafono"))} />
        {(totalNequi > 0 || totalFiado > 0) && (
          <>
            <Cifra etiqueta="Nequi" valor={cop(totalNequi)} />
            <Cifra etiqueta="Fiado" valor={cop(totalFiado)} />
          </>
        )}
      </div>

      <div className="mb-5">
        <CuentasPorCobrar
          soloSiHay
          alCobrar={(m) => {
            alCobrar(m);
            void cargar();
          }}
        />
      </div>

      {cola.length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">Por enviar</h3>
            <button onClick={alReintentar} className="flex items-center gap-2 rounded-full px-4 py-2 font-etiqueta text-sm font-semibold ring-2 ring-cafe-100 active:bg-cafe-100">
              <RotateCw className="size-4" /> Reintentar ya
            </button>
          </div>
          <ul className="space-y-2">
            {cola.map(({ venta, rechazo }) => (
              <li key={venta.id} className={`rounded-2xl p-4 ${rechazo ? "bg-crema ring-2 ring-rojo" : "bg-mostaza-100/60 ring-2 ring-mostaza"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-etiqueta font-semibold">
                      {rechazo ? <TriangleAlert className="size-5 text-rojo" /> : <CloudOff className="size-5" />}
                      {horaBogota(venta.vendida_en)} · {NOMBRE_METODO[venta.metodo_pago]}
                      {venta.cliente && ` · ${venta.cliente}`}
                    </p>
                    <p className="truncate text-cafe-700">{venta.resumen}</p>
                    {rechazo && <p className="mt-1 text-sm font-semibold text-rojo">No se pudo registrar: {rechazo}</p>}
                  </div>
                  <span className="numeros font-titulo text-2xl font-bold">{cop(venta.total_estimado)}</span>
                </div>
                {rechazo && (
                  <button
                    onClick={() => confirm("¿Descartar esta venta? No quedará registrada.") && alDescartar(venta.id)}
                    className="mt-3 rounded-xl px-4 py-2 font-etiqueta text-sm font-semibold text-rojo ring-2 ring-rojo active:bg-rojo/10"
                  >
                    Descartar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="rounded-2xl bg-crema-200 p-4 text-center">{error}</p>}
      {!ventas && !error && (
        <div className="grid place-items-center py-10">
          <Loader2 className="size-8 animate-spin text-cafe-300" />
        </div>
      )}
      {ventas?.length === 0 && <p className="py-8 text-center text-cafe-300">Todavía no hay ventas hoy. ¡Que empiece el antojo!</p>}

      <ul className="space-y-2">
        {ventas?.map((v) => (
          <li key={v.id} className={`rounded-2xl p-4 ring-1 ring-cafe-100 ${v.estado === "anulada" ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-etiqueta font-semibold">
                  #{v.numero} · {horaBogota(v.vendida_en)} · {NOMBRE_METODO[v.metodo_pago]}
                  {v.cliente && ` · ${v.cliente}`}
                  {v.metodo_pago === "credito" && v.estado === "completada" && (
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${v.cobrada ? "bg-cafe-100" : "bg-mostaza text-cafe"}`}>
                      {v.cobrada ? "PAGADA" : "DEBE"}
                    </span>
                  )}
                  {v.estado === "anulada" && <span className="ml-2 rounded-full bg-cafe px-2 py-0.5 text-xs text-crema">ANULADA</span>}
                </p>
                <p className="truncate text-cafe-700">{v.resumen}</p>
              </div>
              <span className={`numeros font-titulo text-2xl font-bold ${v.estado === "anulada" ? "line-through" : ""}`}>{cop(v.total)}</span>
            </div>
            {v.puede_anular && (
              <button
                onClick={() => setAnulando(v)}
                className="mt-3 rounded-xl px-4 py-2 font-etiqueta text-sm font-semibold text-cafe-700 ring-2 ring-cafe-100 active:bg-cafe-100"
              >
                Anular
              </button>
            )}
          </li>
        ))}
      </ul>

      {anulando && (
        <ModalAnular
          venta={anulando}
          alCerrar={() => setAnulando(null)}
          alAnulada={() => {
            alAnular(`Venta #${anulando.numero} anulada`);
            setAnulando(null);
            void cargar();
          }}
        />
      )}
    </Modal>
  );
}

function ModalAnular({ venta, alCerrar, alAnulada }: { venta: VentaDeHoy; alCerrar: () => void; alAnulada: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const anular = async () => {
    setGuardando(true);
    const { error } = await supabaseNavegador().rpc("anular_venta", { p_venta_id: venta.id, p_motivo: motivo.trim() });
    setGuardando(false);
    if (error) setError(error.code ? error.message : "Sin conexión. Intenta de nuevo en un momento.");
    else alAnulada();
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={`Anular venta #${venta.numero}`}
      pie={
        <button
          onClick={anular}
          disabled={!motivo.trim() || guardando}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-xl font-extrabold text-white active:bg-rojo-700 disabled:bg-cafe-300"
        >
          {guardando && <Loader2 className="size-6 animate-spin" />}
          Anular {cop(venta.total)}
        </button>
      }
    >
      <p className="mb-3 font-etiqueta font-semibold">¿Por qué se anula?</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            onClick={() => setMotivo(m)}
            className={`min-h-12 rounded-xl px-4 font-etiqueta text-sm font-semibold ${motivo === m ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="U otro motivo…"
        className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
      />
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="rounded-2xl bg-crema-200 px-2 py-3">
      <p className="font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-700">{etiqueta}</p>
      <p className="numeros font-titulo text-2xl font-extrabold">{valor}</p>
    </div>
  );
}
