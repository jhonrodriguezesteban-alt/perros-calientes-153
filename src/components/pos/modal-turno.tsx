"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cop, horaBogota } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { Turno } from "@/lib/tipos";

interface Cuadre {
  base_inicial: number;
  ventas_efectivo: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
}

export function ModalTurno({
  turno,
  pendientes,
  alCerrar,
  alCambiar,
}: {
  turno: Turno | null;
  pendientes: number;
  alCerrar: () => void;
  alCambiar: (mensaje: string) => void;
}) {
  const [monto, setMonto] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cuadre, setCuadre] = useState<Cuadre | null>(null);
  const valor = Number(monto.replace(/\D/g, ""));

  const ejecutar = async () => {
    setGuardando(true);
    setError(null);
    const supabase = supabaseNavegador();
    if (turno) {
      const { data, error } = await supabase.rpc("cerrar_turno", { p_efectivo_contado: valor, p_notas: notas });
      if (error) setError(error.code ? error.message : "Sin conexión. Intenta de nuevo.");
      else {
        setCuadre((data as Cuadre[])[0]);
        alCambiar("Turno cerrado");
      }
    } else {
      const { error } = await supabase.rpc("abrir_turno", { p_base_inicial: valor });
      if (error) setError(error.code ? error.message : "Sin conexión. Intenta de nuevo.");
      else {
        alCambiar("Turno abierto. ¡A vender con cariño!");
        alCerrar();
      }
    }
    setGuardando(false);
  };

  if (cuadre) {
    const d = cuadre.diferencia;
    return (
      <Modal abierto alCerrar={alCerrar} titulo="Cuadre de caja">
        <dl className="space-y-3 text-lg">
          <Fila etiqueta="Base inicial" valor={cop(cuadre.base_inicial)} />
          <Fila etiqueta="Ventas en efectivo" valor={cop(cuadre.ventas_efectivo)} />
          <Fila etiqueta="Debería haber" valor={cop(cuadre.efectivo_esperado)} fuerte />
          <Fila etiqueta="Contaste" valor={cop(cuadre.efectivo_contado)} fuerte />
        </dl>
        <div className={`mt-5 rounded-2xl px-6 py-5 text-center ${d === 0 ? "bg-cafe text-crema" : "bg-crema ring-2 ring-rojo"}`}>
          <p className="font-etiqueta text-lg font-semibold">
            {d === 0 ? "¡Caja cuadrada!" : d > 0 ? "Sobra" : "Falta"}
          </p>
          {d !== 0 && <p className="numeros font-titulo text-5xl font-extrabold text-rojo">{cop(Math.abs(d))}</p>}
        </div>
      </Modal>
    );
  }

  const bloqueado = !!turno && pendientes > 0;
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={turno ? "Cerrar turno" : "Abrir turno"}
      pie={
        <button
          onClick={ejecutar}
          disabled={guardando || bloqueado || monto === ""}
          className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-xl font-extrabold text-white active:bg-rojo-700 disabled:bg-cafe-300"
        >
          {guardando && <Loader2 className="size-6 animate-spin" />}
          {turno ? "Cerrar y cuadrar caja" : "Abrir turno"}
        </button>
      }
    >
      {turno && (
        <p className="mb-4 text-cafe-700">
          Abierto a las {horaBogota(turno.abierto_en)} por {turno.abierto_por} con base de {cop(turno.base_inicial)}.
        </p>
      )}
      {bloqueado ? (
        <p className="rounded-2xl bg-mostaza-100 p-4 font-semibold ring-2 ring-mostaza">
          Hay {pendientes} {pendientes === 1 ? "venta" : "ventas"} sin enviar. Espera a tener internet para cerrar, así el cuadre queda completo.
        </p>
      ) : (
        <>
          <label className="mb-2 block font-etiqueta font-semibold">
            {turno ? "¿Cuánto efectivo hay en la caja? (cuenta billetes y monedas)" : "Base de caja con la que arrancas"}
          </label>
          <input
            inputMode="numeric"
            autoFocus
            value={monto ? cop(valor) : ""}
            onChange={(e) => setMonto(e.target.value.replace(/\D/g, ""))}
            placeholder="$0"
            className="numeros h-20 w-full rounded-2xl bg-crema px-5 font-titulo text-4xl font-extrabold ring-2 ring-cafe-100 outline-none focus:ring-cafe"
          />
          {turno && (
            <input
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas (opcional)"
              className="mt-3 h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
            />
          )}
        </>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-baseline justify-between border-b border-cafe-100 pb-2">
      <dt className={fuerte ? "font-semibold" : "text-cafe-700"}>{etiqueta}</dt>
      <dd className={`numeros ${fuerte ? "font-titulo text-2xl font-extrabold" : ""}`}>{valor}</dd>
    </div>
  );
}
