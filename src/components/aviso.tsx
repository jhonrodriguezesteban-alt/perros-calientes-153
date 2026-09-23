"use client";

import { CheckCircle2, CloudOff, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type TipoAviso = "exito" | "pendiente" | "error";
interface Aviso {
  id: number;
  tipo: TipoAviso;
  titulo: string;
  detalle?: string;
}

const estilos: Record<TipoAviso, { caja: string; Icono: typeof CheckCircle2; icono: string }> = {
  exito: { caja: "bg-cafe text-crema", Icono: CheckCircle2, icono: "text-mostaza" },
  pendiente: { caja: "bg-mostaza-100 text-cafe ring-2 ring-mostaza", Icono: CloudOff, icono: "text-cafe" },
  error: { caja: "bg-crema text-cafe ring-2 ring-rojo", Icono: TriangleAlert, icono: "text-rojo" },
};

export function useAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(0);

  const avisar = useCallback((tipo: TipoAviso, titulo: string, detalle?: string) => {
    const id = ++siguiente.current;
    setAvisos((a) => [...a.slice(-2), { id, tipo, titulo, detalle }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), tipo === "error" ? 7000 : 3500);
  }, []);

  return { avisos, avisar };
}

export function Avisos({ avisos }: { avisos: Aviso[] }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-3 px-4">
      {avisos.map((a) => (
        <AvisoCaja key={a.id} aviso={a} />
      ))}
    </div>
  );
}

function AvisoCaja({ aviso }: { aviso: Aviso }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const { caja, Icono, icono } = estilos[aviso.tipo];
  return (
    <div
      className={`flex max-w-lg items-center gap-4 rounded-2xl px-6 py-4 shadow-xl transition-all duration-200 ${caja} ${
        visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      }`}
    >
      <Icono className={`size-8 shrink-0 ${icono}`} />
      <div>
        <p className="font-etiqueta text-lg font-semibold">{aviso.titulo}</p>
        {aviso.detalle && <p className="text-base opacity-80">{aviso.detalle}</p>}
      </div>
    </div>
  );
}
