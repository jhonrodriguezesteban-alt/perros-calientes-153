"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cop } from "@/lib/formato";
import type { MetodoPago } from "@/lib/tipos";

const BILLETES = [10_000, 20_000, 50_000, 100_000];

export function ModalCobro({
  metodo,
  total,
  alCerrar,
  alConfirmar,
}: {
  metodo: MetodoPago;
  total: number;
  alCerrar: () => void;
  alConfirmar: () => Promise<void>;
}) {
  const [recibido, setRecibido] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const vuelto = recibido !== null ? recibido - total : null;

  const confirmar = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      await alConfirmar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={guardando ? () => {} : alCerrar}
      titulo={metodo === "efectivo" ? "Cobro en efectivo" : "Cobro con datáfono"}
      pie={
        <button
          onClick={confirmar}
          disabled={guardando || (vuelto !== null && vuelto < 0)}
          className="flex h-20 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-2xl font-extrabold text-white shadow-md active:bg-rojo-700 disabled:bg-cafe-300"
        >
          {guardando && <Loader2 className="size-7 animate-spin" />}
          {metodo === "efectivo" ? "Confirmar venta" : "Pago aprobado · Confirmar"}
        </button>
      }
    >
      <div className="text-center">
        <p className="font-etiqueta text-lg font-semibold uppercase tracking-wide text-cafe-700">Total a cobrar</p>
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
      ) : (
        <p className="mt-6 rounded-2xl bg-crema-200 px-5 py-4 text-center text-lg">
          Cobra <strong className="numeros">{cop(total)}</strong> en el Bold QR y confirma cuando salga <strong>aprobado</strong>.
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
