"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

/**
 * Carga datos de forma asíncrona. `cargar` debe ser estable (definida fuera
 * del componente o con useCallback). `recargar()` vuelve a pedirlos.
 */
export function useDatos<T>(cargar: () => Promise<T>) {
  const [estado, setEstado] = useState<{ data?: T; error?: string; cargando: boolean }>({ cargando: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let activo = true;
    cargar()
      .then((data) => activo && setEstado({ data, cargando: false }))
      .catch((e: unknown) => activo && setEstado({ error: mensajeError(e), cargando: false }));
    return () => {
      activo = false;
    };
  }, [cargar, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { ...estado, recargar };
}

export function mensajeError(e: unknown) {
  if (e && typeof e === "object" && "message" in e) {
    const m = String((e as { message: unknown }).message);
    if (/fetch|network/i.test(m)) return "Sin conexión. Revisa el internet e intenta de nuevo.";
    return m;
  }
  return "Algo salió mal. Intenta de nuevo.";
}

/** Lanza el error de Supabase para que useDatos / los formularios lo muestren. */
export function exigir<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

export function Encabezado({ titulo, descripcion, accion }: { titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-titulo text-3xl font-extrabold leading-tight sm:text-4xl">{titulo}</h1>
        {descripcion && <p className="mt-1 text-cafe-700">{descripcion}</p>}
      </div>
      {accion}
    </div>
  );
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-crema p-5 ring-2 ring-cafe-100 sm:p-6 ${className}`}>{children}</section>;
}

export function Subtitulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-etiqueta text-base font-extrabold uppercase tracking-wide text-cafe-700">{children}</h2>
      {accion}
    </div>
  );
}

type VarianteBoton = "primario" | "secundario" | "peligro" | "suave";
const estilosBoton: Record<VarianteBoton, string> = {
  primario: "bg-rojo text-white active:bg-rojo-700 disabled:bg-cafe-300",
  secundario: "bg-cafe text-crema active:bg-cafe-700 disabled:bg-cafe-300",
  peligro: "text-rojo ring-2 ring-rojo active:bg-rojo/10 disabled:opacity-50",
  suave: "text-cafe ring-2 ring-cafe-100 active:bg-cafe-100 disabled:opacity-50",
};

export function Boton({
  children,
  variante = "primario",
  cargando,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteBoton; cargando?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || cargando}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-etiqueta text-base font-extrabold ${estilosBoton[variante]} ${className}`}
    >
      {cargando && <Loader2 className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

export function Campo({
  etiqueta,
  ayuda,
  children,
  className = "",
}: {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block font-etiqueta text-sm font-semibold text-cafe-700">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-sm text-cafe-300">{ayuda}</span>}
    </label>
  );
}

export const claseInput =
  "h-12 w-full rounded-xl bg-white/70 px-3 text-base text-cafe ring-2 ring-cafe-100 outline-none focus:ring-cafe";

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

export function Selector(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${claseInput} ${props.className ?? ""}`} />;
}

/** Entrada de pesos: muestra $12.500 y entrega el número. */
export function EntradaPesos({
  valor,
  alCambiar,
  ...props
}: { valor: number | null; alCambiar: (v: number | null) => void } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange"
>) {
  return (
    <input
      {...props}
      inputMode="numeric"
      value={valor === null ? "" : "$" + valor.toLocaleString("es-CO")}
      onChange={(e) => {
        const d = e.target.value.replace(/\D/g, "");
        alCambiar(d === "" ? null : Number(d));
      }}
      className={`${claseInput} numeros ${props.className ?? ""}`}
    />
  );
}

/** Entrada numérica con decimales (acepta coma o punto). */
export function EntradaNumero({
  valor,
  alCambiar,
  ...props
}: { valor: string; alCambiar: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      inputMode="decimal"
      value={valor}
      onChange={(e) => alCambiar(e.target.value.replace(/[^\d.,-]/g, ""))}
      className={`${claseInput} numeros ${props.className ?? ""}`}
    />
  );
}

export function aNumero(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: "neutro" | "alerta" | "peligro" | "ok" }) {
  const t = {
    neutro: "bg-crema-200 text-cafe-700",
    alerta: "bg-mostaza-100 text-cafe ring-1 ring-mostaza",
    peligro: "bg-rojo/10 text-rojo-700",
    ok: "bg-cafe text-crema",
  }[tono];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-etiqueta text-xs font-semibold ${t}`}>{children}</span>;
}

export function Cargando() {
  return (
    <div className="grid place-items-center py-16">
      <Loader2 className="size-8 animate-spin text-cafe-300" />
    </div>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-rojo/10 px-4 py-3 font-semibold text-rojo-700">{children}</p>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-crema-200 px-4 py-6 text-center text-cafe-700">{children}</p>;
}
