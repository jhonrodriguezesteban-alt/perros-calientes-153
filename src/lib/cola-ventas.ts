import type { SupabaseClient } from "@supabase/supabase-js";
import type { VentaPorEnviar } from "@/lib/tipos";

/**
 * Cola local de ventas por enviar.
 *
 * Cada venta se guarda aquí ANTES de intentar enviarla. Si no hay internet
 * queda guardada (sobrevive a recargar la página o cerrar el navegador) y se
 * reintenta sola. El id de la venta lo genera la tablet, así que un reintento
 * nunca la duplica en el servidor.
 */

const CLAVE = "bpc:cola-ventas:v1";

export interface VentaEnCola {
  venta: VentaPorEnviar;
  intentos: number;
  /** El servidor la rechazó (no es un problema de red): requiere revisión. */
  rechazo?: string;
}

export type ResultadoEnvio =
  | { tipo: "ok"; numero: number; total: number }
  | { tipo: "red" }
  | { tipo: "sesion" }
  | { tipo: "rechazo"; mensaje: string };

const VACIA: VentaEnCola[] = [];
const oyentes = new Set<() => void>();
let instantanea: { crudo: string | null; cola: VentaEnCola[] } = { crudo: null, cola: VACIA };

export function leerCola(): VentaEnCola[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo !== instantanea.crudo) {
      instantanea = { crudo, cola: crudo ? (JSON.parse(crudo) as VentaEnCola[]) : VACIA };
    }
    return instantanea.cola;
  } catch {
    return VACIA;
  }
}

function escribirCola(cola: VentaEnCola[]) {
  localStorage.setItem(CLAVE, JSON.stringify(cola));
  oyentes.forEach((o) => o());
}

/** Para useSyncExternalStore: avisa cuando cambia la cola (en esta pestaña o en otra). */
export function suscribirCola(oyente: () => void) {
  oyentes.add(oyente);
  const alCambiarOtraPestana = (e: StorageEvent) => e.key === CLAVE && oyente();
  window.addEventListener("storage", alCambiarOtraPestana);
  return () => {
    oyentes.delete(oyente);
    window.removeEventListener("storage", alCambiarOtraPestana);
  };
}

export function colaServidor(): VentaEnCola[] {
  return VACIA;
}

export function encolar(venta: VentaPorEnviar) {
  const cola = leerCola().filter((v) => v.venta.id !== venta.id);
  cola.push({ venta, intentos: 0 });
  escribirCola(cola);
}

export function quitarDeCola(id: string) {
  escribirCola(leerCola().filter((v) => v.venta.id !== id));
}

function actualizarEnCola(id: string, cambio: Partial<VentaEnCola>) {
  escribirCola(leerCola().map((v) => (v.venta.id === id ? { ...v, ...cambio } : v)));
}

export async function enviarVenta(supabase: SupabaseClient, venta: VentaPorEnviar): Promise<ResultadoEnvio> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { tipo: "red" };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { total_estimado, resumen, ...payload } = venta;
  try {
    const { data, error } = await supabase.rpc("registrar_venta", { p_venta: payload });
    if (!error) return { tipo: "ok", numero: data.numero, total: data.total };

    // Códigos de Postgres (5 caracteres, ej. 22023) = la base de datos la rechazó.
    if (error.code === "PGRST301" || (error.code === "42501" && /permiso/i.test(error.message))) {
      return { tipo: "sesion" };
    }
    if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) {
      return { tipo: "rechazo", mensaje: error.message };
    }
    return { tipo: "red" };
  } catch {
    return { tipo: "red" };
  }
}

/** Envía una venta que ya está en la cola y actualiza la cola según el resultado. */
export async function procesarDeCola(supabase: SupabaseClient, item: VentaEnCola): Promise<ResultadoEnvio> {
  const resultado = await enviarVenta(supabase, item.venta);
  if (resultado.tipo === "ok") {
    quitarDeCola(item.venta.id);
  } else if (resultado.tipo === "rechazo") {
    actualizarEnCola(item.venta.id, { intentos: item.intentos + 1, rechazo: resultado.mensaje });
  } else {
    actualizarEnCola(item.venta.id, { intentos: item.intentos + 1 });
  }
  return resultado;
}

export function nuevoIdVenta() {
  return crypto.randomUUID();
}
