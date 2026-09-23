"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Modal({
  abierto,
  alCerrar,
  titulo,
  children,
  pie,
  ancho = "max-w-xl",
}: {
  abierto: boolean;
  alCerrar: () => void;
  titulo: ReactNode;
  children: ReactNode;
  pie?: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto, alCerrar]);

  if (!abierto) return null;
  return (
    <div className="tactil fixed inset-0 z-40 flex items-end justify-center bg-cafe/50 sm:items-center sm:p-6" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92dvh] w-full ${ancho} flex-col overflow-hidden rounded-t-3xl bg-crema shadow-2xl sm:rounded-3xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-cafe-100 px-6 py-4">
          <h2 className="font-titulo text-2xl font-extrabold leading-tight">{titulo}</h2>
          <button
            onClick={alCerrar}
            aria-label="Cerrar"
            className="grid size-12 shrink-0 place-items-center rounded-full text-cafe-700 active:bg-cafe-100"
          >
            <X className="size-7" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {pie && <footer className="border-t border-cafe-100 bg-crema-200/60 px-6 py-4">{pie}</footer>}
      </div>
    </div>
  );
}
