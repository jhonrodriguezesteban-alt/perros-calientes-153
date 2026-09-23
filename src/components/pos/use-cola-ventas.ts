"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";
import {
  colaServidor,
  encolar,
  leerCola,
  procesarDeCola,
  quitarDeCola,
  suscribirCola,
  type ResultadoEnvio,
} from "@/lib/cola-ventas";
import type { VentaPorEnviar } from "@/lib/tipos";

const REINTENTO_MS = 15_000;

function suscribirConexion(oyente: () => void) {
  window.addEventListener("online", oyente);
  window.addEventListener("offline", oyente);
  return () => {
    window.removeEventListener("online", oyente);
    window.removeEventListener("offline", oyente);
  };
}

/** Estado de la cola local + envío y reintentos automáticos. */
export function useColaVentas(alSincronizar?: () => void) {
  const cola = useSyncExternalStore(suscribirCola, leerCola, colaServidor);
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const enviando = useRef(false);
  const alSincronizarRef = useRef(alSincronizar);
  useEffect(() => {
    alSincronizarRef.current = alSincronizar;
  }, [alSincronizar]);

  /** Reintenta todo lo pendiente (menos lo rechazado por el servidor). */
  const sincronizar = useCallback(async () => {
    if (enviando.current) return;
    enviando.current = true;
    let alguna = false;
    try {
      for (const item of leerCola()) {
        if (item.rechazo) continue;
        const r = await procesarDeCola(supabaseNavegador(), item);
        if (r.tipo === "ok") alguna = true;
        if (r.tipo === "red" || r.tipo === "sesion") break;
      }
    } finally {
      enviando.current = false;
      if (alguna) alSincronizarRef.current?.();
    }
  }, []);

  /** Guarda la venta en la cola y la intenta enviar de inmediato. */
  const registrar = useCallback(async (venta: VentaPorEnviar): Promise<ResultadoEnvio> => {
    encolar(venta);
    // Espera a que termine un reintento en curso para no enviarla dos veces a la vez.
    while (enviando.current) await new Promise((r) => setTimeout(r, 100));
    enviando.current = true;
    try {
      const item = leerCola().find((v) => v.venta.id === venta.id);
      if (!item) return { tipo: "red" };
      return await procesarDeCola(supabaseNavegador(), item);
    } finally {
      enviando.current = false;
    }
  }, []);

  // Al volver internet, y al abrir el POS, enviar lo pendiente.
  useEffect(() => {
    const alConectar = () => void sincronizar();
    window.addEventListener("online", alConectar);
    const inicial = setTimeout(alConectar, 0);
    return () => {
      clearTimeout(inicial);
      window.removeEventListener("online", alConectar);
    };
  }, [sincronizar]);

  const pendientes = cola.filter((v) => !v.rechazo).length;
  useEffect(() => {
    if (pendientes === 0) return;
    const t = setInterval(() => void sincronizar(), REINTENTO_MS);
    return () => clearInterval(t);
  }, [pendientes, sincronizar]);

  return { cola, pendientes, enLinea, registrar, sincronizar, descartar: quitarDeCola };
}
