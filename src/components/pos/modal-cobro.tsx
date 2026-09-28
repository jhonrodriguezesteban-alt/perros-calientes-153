"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { cop } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { MetodoCobro, MetodoPago, Pago } from "@/lib/tipos";

const BILLETES = [10_000, 20_000, 50_000, 100_000];

const TITULOS: Record<MetodoPago, string> = {
  efectivo: "Cobro en efectivo",
  datafono: "Cobro con Bold",
  nequi: "Cobro por Nequi",
  credito: "Fiado",
  mixto: "Pago con varios métodos",
};

const PARTES: { metodo: MetodoCobro; nombre: string }[] = [
  { metodo: "efectivo", nombre: "Efectivo" },
  { metodo: "datafono", nombre: "Bold" },
  { metodo: "nequi", nombre: "Nequi" },
];

/** Nombres de quienes hoy deben algo, para no escribir dos veces a la misma persona distinto. */
async function obtenerDeudores() {
  const { data } = await supabaseNavegador().rpc("cuentas_por_cobrar");
  return [...new Set(((data ?? []) as { cliente: string }[]).map((d) => d.cliente))];
}

export function ModalCobro({
  metodo,
  total,
  alCerrar,
  alConfirmar,
}: {
  metodo: MetodoPago;
  total: number;
  alCerrar: () => void;
  alConfirmar: (cliente?: string, pagos?: Pago[]) => Promise<void>;
}) {
  const [partes, setPartes] = useState<Record<MetodoCobro, number | null>>({ efectivo: null, datafono: null, nequi: null });
  const mixto = metodo === "mixto";
  const pagos: Pago[] = PARTES.filter((p) => (partes[p.metodo] ?? 0) > 0).map((p) => ({ metodo: p.metodo, monto: partes[p.metodo]! }));
  const falta = total - pagos.reduce((s, p) => s + p.monto, 0);
  const [recibido, setRecibido] = useState<number | null>(null);
  const [cliente, setCliente] = useState("");
  const [deudores, setDeudores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const vuelto = recibido !== null ? recibido - total : null;
  const fiado = metodo === "credito";

  useEffect(() => {
    if (!fiado) return;
    let activo = true;
    void obtenerDeudores().then((d) => activo && setDeudores(d));
    return () => {
      activo = false;
    };
  }, [fiado]);

  const confirmar = async () => {
    if (guardando || (fiado && !cliente.trim()) || (mixto && falta !== 0)) return;
    setGuardando(true);
    try {
      await alConfirmar(fiado ? cliente.trim() : undefined, mixto ? pagos : undefined);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={guardando ? () => {} : alCerrar}
      titulo={TITULOS[metodo]}
      pie={
        <button
          onClick={confirmar}
          disabled={guardando || (vuelto !== null && vuelto < 0) || (fiado && !cliente.trim()) || (mixto && (falta !== 0 || pagos.length === 0))}
          className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-2xl font-extrabold text-white shadow-md active:bg-rojo-700 disabled:bg-cafe-300"
        >
          {guardando && <Loader2 className="size-7 animate-spin" />}
          {metodo === "efectivo" ? "Confirmar venta" : fiado ? "Dejar fiado" : mixto ? (falta === 0 ? "Pagos recibidos · Confirmar" : falta > 0 ? `Faltan ${cop(falta)}` : `Sobran ${cop(-falta)}`) : "Pago recibido · Confirmar"}
        </button>
      }
    >
      <div className="text-center">
        <p className="font-etiqueta text-lg font-semibold uppercase tracking-wide text-cafe-700">{fiado ? "Queda debiendo" : "Total a cobrar"}</p>
        <p className="numeros font-titulo text-7xl font-extrabold text-rojo">{cop(total)}</p>
      </div>

      {metodo === "efectivo" ? (
        <div className="mt-6">
          <p className="mb-3 font-etiqueta text-base font-semibold text-cafe-700">¿Con cuánto paga? (opcional, para el vuelto)</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            <BotonBillete activo={recibido === total} onClick={() => setRecibido(total)}>
              Exacto
            </BotonBillete>
            {BILLETES.filter((b) => b > total || BILLETES.every((x) => x <= total)).map((b) => (
              <BotonBillete key={b} activo={recibido === b} onClick={() => setRecibido(b)}>
                {cop(b)}
              </BotonBillete>
            ))}
          </div>
          {vuelto !== null && (
            <div className="mt-5 flex items-baseline justify-between rounded-2xl bg-cafe px-6 py-4 text-crema">
              <span className="font-etiqueta text-xl font-semibold">{vuelto >= 0 ? "Vuelto" : "Falta"}</span>
              <span className={`numeros font-titulo text-5xl font-extrabold ${vuelto >= 0 ? "text-mostaza" : "text-rojo"}`}>
                {cop(Math.abs(vuelto))}
              </span>
            </div>
          )}
        </div>
      ) : mixto ? (
        <div className="mt-6">
          <p className="mb-3 font-etiqueta text-base font-semibold text-cafe-700">¿Cuánto paga con cada uno?</p>
          <div className="space-y-3">
            {PARTES.map(({ metodo: m, nombre }) => (
              <div key={m} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-etiqueta text-lg font-extrabold">{nombre}</span>
                <input
                  inputMode="numeric"
                  aria-label={`Monto en ${nombre}`}
                  value={partes[m] === null ? "" : cop(partes[m]!)}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, "");
                    setPartes((p) => ({ ...p, [m]: d === "" ? null : Number(d) }));
                  }}
                  placeholder="$0"
                  className="numeros h-16 min-w-0 flex-1 rounded-2xl bg-crema px-4 font-titulo text-3xl font-extrabold ring-2 ring-cafe-100 outline-none focus:ring-cafe"
                />
                <button
                  onClick={() => setPartes((p) => ({ ...p, [m]: Math.max(0, (p[m] ?? 0) + falta) || null }))}
                  disabled={falta <= 0}
                  className="h-16 shrink-0 rounded-2xl px-3 font-etiqueta text-sm font-semibold ring-2 ring-cafe-100 active:bg-cafe-100 disabled:opacity-40"
                >
                  El resto
                </button>
              </div>
            ))}
          </div>
          <div
            className={`mt-5 flex items-baseline justify-between rounded-2xl px-6 py-4 ${
              falta === 0 ? "bg-cafe text-crema" : "bg-crema ring-2 ring-rojo"
            }`}
          >
            <span className="font-etiqueta text-xl font-semibold">{falta === 0 ? "¡Completo!" : falta > 0 ? "Falta" : "Sobra"}</span>
            {falta !== 0 && <span className="numeros font-titulo text-4xl font-extrabold text-rojo">{cop(Math.abs(falta))}</span>}
          </div>
          <p className="mt-3 text-sm text-cafe-700">Escribe lo que paga por un medio y toca “El resto” en el otro.</p>
        </div>
      ) : fiado ? (
        <div className="mt-6">
          <label htmlFor="cliente-fiado" className="mb-2 block font-etiqueta text-base font-semibold text-cafe-700">
            ¿Quién queda debiendo?
          </label>
          <input
            id="cliente-fiado"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre"
            autoComplete="off"
            className="h-16 w-full rounded-2xl bg-crema px-4 text-xl ring-2 ring-cafe-100 outline-none focus:ring-cafe"
          />
          {deudores.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {deudores.map((d) => (
                <button
                  key={d}
                  onClick={() => setCliente(d)}
                  className={`min-h-12 rounded-xl px-4 font-etiqueta text-sm font-semibold ${
                    cliente.trim() === d ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-sm text-cafe-700">Cuando pague, se cobra desde “Ventas de hoy” → Por cobrar.</p>
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-crema-200 px-5 py-4 text-center text-lg">
          {metodo === "nequi" ? (
            <>
              Recibe <strong className="numeros">{cop(total)}</strong> por Nequi y confirma cuando veas la <strong>notificación</strong>.
            </>
          ) : (
            <>
              Cobra <strong className="numeros">{cop(total)}</strong> en el Bold QR y confirma cuando salga <strong>aprobado</strong>.
            </>
          )}
        </p>
      )}
    </Modal>
  );
}

function BotonBillete({ children, activo, onClick }: { children: React.ReactNode; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`numeros h-16 rounded-2xl font-etiqueta text-lg font-semibold ${
        activo ? "bg-cafe text-crema" : "bg-crema ring-2 ring-cafe-100 active:bg-cafe-100"
      }`}
    >
      {children}
    </button>
  );
}
