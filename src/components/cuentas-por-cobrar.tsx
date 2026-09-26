"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cop, NOMBRE_METODO } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";

interface Cuenta {
  id: string;
  numero: number;
  cliente: string;
  total: number;
  vendida_en: string;
  resumen: string | null;
}

const METODOS_COBRO = ["efectivo", "datafono", "nequi"] as const;

const fecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

async function obtenerCuentas() {
  const { data, error } = await supabaseNavegador().rpc("cuentas_por_cobrar");
  return { error: !!error, cuentas: (data ?? []) as Cuenta[] };
}

/** Ventas fiadas que siguen pendientes, con botón para cobrarlas. Sirve en el POS y en el panel. */
export function CuentasPorCobrar({ alCobrar, soloSiHay }: { alCobrar?: (mensaje: string) => void; soloSiHay?: boolean }) {
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const aplicar = useCallback((r: Awaited<ReturnType<typeof obtenerCuentas>>) => {
    if (r.error) setError("No pudimos traer las cuentas por cobrar.");
    else {
      setError(null);
      setCuentas(r.cuentas);
    }
  }, []);

  useEffect(() => {
    let activo = true;
    void obtenerCuentas().then((r) => activo && aplicar(r));
    return () => {
      activo = false;
    };
  }, [aplicar]);

  const cobrar = async (c: Cuenta, metodo: (typeof METODOS_COBRO)[number]) => {
    setGuardando(true);
    const { error } = await supabaseNavegador().rpc("cobrar_venta", { p_venta_id: c.id, p_metodo: metodo });
    setGuardando(false);
    if (error) {
      setError(error.code ? error.message : "Sin conexión. Intenta de nuevo en un momento.");
      return;
    }
    setAbierta(null);
    alCobrar?.(`${c.cliente} pagó ${cop(c.total)} (${NOMBRE_METODO[metodo]})`);
    aplicar(await obtenerCuentas());
  };

  if (soloSiHay && (!cuentas || cuentas.length === 0) && !error) return null;

  const total = (cuentas ?? []).reduce((s, c) => s + c.total, 0);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">Por cobrar (fiado)</h3>
        {cuentas && cuentas.length > 0 && <span className="numeros font-titulo text-xl font-extrabold text-rojo">{cop(total)}</span>}
      </div>
      {error && <p className="mb-2 font-semibold text-rojo">{error}</p>}
      {!cuentas && !error && <Loader2 className="size-6 animate-spin text-cafe-300" />}
      {cuentas?.length === 0 && <p className="text-cafe-300">Nadie debe nada.</p>}
      <ul className="space-y-2">
        {cuentas?.map((c) => (
          <li key={c.id} className="rounded-2xl bg-crema p-4 ring-2 ring-mostaza">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-etiqueta font-semibold">
                  {c.cliente} · #{c.numero} · {fecha.format(new Date(c.vendida_en))}
                </p>
                <p className="truncate text-cafe-700">{c.resumen}</p>
              </div>
              <span className="numeros font-titulo text-2xl font-bold">{cop(c.total)}</span>
            </div>
            {abierta === c.id ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="font-etiqueta text-sm font-semibold text-cafe-700">Pagó con:</span>
                {METODOS_COBRO.map((m) => (
                  <button
                    key={m}
                    disabled={guardando}
                    onClick={() => void cobrar(c, m)}
                    className="min-h-12 rounded-xl bg-cafe px-4 font-etiqueta text-sm font-semibold text-crema active:bg-cafe-700 disabled:bg-cafe-300"
                  >
                    {NOMBRE_METODO[m]}
                  </button>
                ))}
                <button
                  disabled={guardando}
                  onClick={() => setAbierta(null)}
                  className="min-h-12 rounded-xl px-4 font-etiqueta text-sm font-semibold ring-2 ring-cafe-100"
                >
                  Cancelar
                </button>
                {guardando && <Loader2 className="size-5 animate-spin" />}
              </div>
            ) : (
              <button
                onClick={() => setAbierta(c.id)}
                className="mt-3 rounded-xl px-4 py-2 font-etiqueta text-sm font-semibold text-cafe ring-2 ring-cafe active:bg-cafe-100"
              >
                Cobrar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
