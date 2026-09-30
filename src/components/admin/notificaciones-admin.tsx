"use client";

import { Bell, BellOff, Check, Copy, KeyRound, Send, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { db } from "@/lib/admin";
import { Boton, Cargando, Encabezado, exigir, mensajeError, MensajeError, Subtitulo, Tarjeta, useDatos } from "./ui";

interface Dispositivo {
  id: string;
  endpoint: string;
  dispositivo: string | null;
  ventas: boolean;
  cierres: boolean;
  solicitudes: boolean;
  caja: boolean;
  creado_en: string;
}

type Preferencia = "ventas" | "cierres" | "solicitudes" | "caja";
const PREFERENCIAS: { id: Preferencia; nombre: string; ayuda: string }[] = [
  { id: "ventas", nombre: "Cada venta", ayuda: "Número, valor, cómo pagó y qué se llevó" },
  { id: "cierres", nombre: "Cierre de caja", ayuda: "Lo vendido y si cuadró el efectivo y los bancos" },
  { id: "solicitudes", nombre: "Solicitudes de insumos", ayuda: "Cuando Andrea pide algo" },
  { id: "caja", nombre: "Movimientos de caja", ayuda: "Apertura, retiros y ventas anuladas" },
];

async function cargar() {
  const [estado, filas] = await Promise.all([
    fetch("/api/notificaciones/estado").then((r) => r.json() as Promise<{ configurado: boolean; llavePublica: string | null; error?: string }>),
    db().from("suscripciones_push").select("id, endpoint, dispositivo, ventas, cierres, solicitudes, caja, creado_en").order("creado_en"),
  ]);
  if (estado.error) throw new Error(estado.error);
  return { estado, dispositivos: exigir(filas) as Dispositivo[] };
}

function aBytes(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const crudo = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
}

function nombreDispositivo() {
  const ua = navigator.userAgent;
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computador";
  const nav = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Safari/.test(ua) ? "Safari" : "";
  return [so, nav].filter(Boolean).join(" · ");
}

type Soporte = "cargando" | "si" | "no" | "ios-instalar";

/** Activar notificaciones en este celular o computador y elegir qué avisos llegan. */
export function NotificacionesAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargar);
  const [soporte, setSoporte] = useState<Soporte>("cargando");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    void (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setSoporte(ios && !instalada ? "ios-instalar" : "no");
        return;
      }
      setSoporte("si");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setEndpoint(sub?.endpoint ?? null);
    })();
  }, []);

  const mio = data?.dispositivos.find((d) => d.endpoint === endpoint) ?? null;

  const activar = async () => {
    if (!data?.estado.llavePublica) return;
    setTrabajando("activar");
    setAviso(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        throw new Error("El permiso quedó bloqueado. Actívalo en los ajustes del navegador (candado junto a la dirección → Notificaciones → Permitir) y vuelve a intentar.");
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(data.estado.llavePublica) }));
      const j = sub.toJSON();
      exigir(
        await db()
          .from("suscripciones_push")
          .upsert({ endpoint: sub.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth, dispositivo: nombreDispositivo() }, { onConflict: "endpoint" }),
      );
      setEndpoint(sub.endpoint);
      await probar(sub);
      recargar();
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) });
    } finally {
      setTrabajando(null);
    }
  };

  const probar = async (sub?: PushSubscription | null) => {
    setTrabajando((t) => t ?? "probar");
    try {
      sub ??= await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (!sub) throw new Error("Este dispositivo no tiene las notificaciones activas.");
      const r = await fetch("/api/notificaciones/prueba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suscripcion: sub.toJSON() }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? "No se pudo enviar la prueba.");
      setAviso({ ok: true, texto: "Te mandamos una notificación de prueba. Si no la ves, revisa que el celular no esté en modo No molestar." });
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) });
    } finally {
      setTrabajando((t) => (t === "probar" ? null : t));
    }
  };

  const desactivar = async () => {
    setTrabajando("desactivar");
    setAviso(null);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription();
      if (sub) {
        exigir(await db().from("suscripciones_push").delete().eq("endpoint", sub.endpoint));
        await sub.unsubscribe();
      }
      setEndpoint(null);
      recargar();
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) });
    } finally {
      setTrabajando(null);
    }
  };

  const cambiar = async (d: Dispositivo, p: Preferencia) => {
    try {
      exigir(await db().from("suscripciones_push").update({ [p]: !d[p] }).eq("id", d.id));
      recargar();
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) });
    }
  };

  const quitar = async (d: Dispositivo) => {
    try {
      exigir(await db().from("suscripciones_push").delete().eq("id", d.id));
      recargar();
    } catch (e) {
      setAviso({ ok: false, texto: mensajeError(e) });
    }
  };

  return (
    <div className="space-y-6">
      <Encabezado titulo="Notificaciones" descripcion="Avisos en tu celular o computador cuando hay ventas, cierres de caja o solicitudes de insumos, aunque la app esté cerrada." />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}
      {aviso &&
        (aviso.ok ? (
          <p className="rounded-2xl bg-cafe px-4 py-3 font-semibold text-crema">{aviso.texto}</p>
        ) : (
          <MensajeError>{aviso.texto}</MensajeError>
        ))}

      {data && !data.estado.configurado && <Configurar alListo={recargar} />}

      {data?.estado.configurado && (
        <Tarjeta>
          <Subtitulo>Este dispositivo</Subtitulo>
          {soporte === "ios-instalar" && (
            <div className="space-y-2 rounded-2xl bg-mostaza-100/60 p-4 ring-2 ring-mostaza">
              <p className="font-etiqueta font-extrabold">En iPhone primero instala la app</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                <li>Abre esta página en <strong>Safari</strong>.</li>
                <li>Toca <strong>Compartir</strong> (el cuadro con la flecha) → <strong>Agregar a inicio</strong>.</li>
                <li>Abre Bendito desde el ícono de la salchicha y vuelve a esta pantalla.</li>
              </ol>
            </div>
          )}
          {soporte === "no" && <p className="text-cafe-700">Este navegador no permite notificaciones. Usa Chrome (Android o computador) o Safari (Mac / iPhone con la app instalada).</p>}
          {soporte === "si" &&
            (mio ? (
              <div className="space-y-4">
                <p className="flex items-center gap-2 font-etiqueta font-semibold">
                  <Check className="size-5 text-exito" /> Activas en este dispositivo ({mio.dispositivo})
                </p>
                <Preferencias d={mio} alCambiar={cambiar} />
                <div className="flex flex-wrap gap-2">
                  <Boton variante="secundario" onClick={() => void probar()} cargando={trabajando === "probar"}>
                    <Send className="size-5" /> Enviar prueba
                  </Boton>
                  <Boton variante="suave" onClick={desactivar} cargando={trabajando === "desactivar"}>
                    <BellOff className="size-5" /> Desactivar aquí
                  </Boton>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-cafe-700">Todavía no llegan notificaciones a este dispositivo.</p>
                <Boton onClick={activar} cargando={trabajando === "activar"}>
                  <Bell className="size-5" /> Activar notificaciones aquí
                </Boton>
                <p className="text-sm text-cafe-700">El navegador te va a preguntar si permites notificaciones: toca Permitir.</p>
              </div>
            ))}
        </Tarjeta>
      )}

      {data && data.dispositivos.filter((d) => d.endpoint !== endpoint).length > 0 && (
        <Tarjeta>
          <Subtitulo>Tus otros dispositivos</Subtitulo>
          <ul className="divide-y divide-cafe-100">
            {data.dispositivos
              .filter((d) => d.endpoint !== endpoint)
              .map((d) => (
                <li key={d.id} className="space-y-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="flex items-center gap-2 font-etiqueta font-semibold">
                      <Smartphone className="size-5" /> {d.dispositivo ?? "Dispositivo"}
                    </p>
                    <button onClick={() => void quitar(d)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-rojo ring-1 ring-rojo/40">
                      <Trash2 className="size-4" /> Quitar
                    </button>
                  </div>
                  <Preferencias d={d} alCambiar={cambiar} />
                </li>
              ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

function Preferencias({ d, alCambiar }: { d: Dispositivo; alCambiar: (d: Dispositivo, p: Preferencia) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {PREFERENCIAS.map((p) => (
        <li key={p.id}>
          <label className="flex min-h-14 items-center gap-3 rounded-2xl bg-crema-200/60 px-3 py-2">
            <input type="checkbox" className="size-5 accent-cafe" checked={d[p.id]} onChange={() => alCambiar(d, p.id)} />
            <span>
              <span className="block font-etiqueta text-sm font-semibold">{p.nombre}</span>
              <span className="block text-xs text-cafe-700">{p.ayuda}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Configuración de una sola vez: llaves en Vercel y en Supabase. */
function Configurar({ alListo }: { alListo: () => void }) {
  const [llaves, setLlaves] = useState<{ publica: string; privada: string; secreto: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const generar = async () => {
    setGenerando(true);
    setError(null);
    try {
      const r = await fetch("/api/notificaciones/llaves", { method: "POST" });
      if (!r.ok) throw new Error("No se pudieron generar las llaves.");
      setLlaves(await r.json());
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGenerando(false);
    }
  };

  const sql = llaves
    ? `insert into ajustes_privados (clave, valor) values\n  ('notificaciones_url', '${window.location.origin}/api/notificaciones/enviar'),\n  ('notificaciones_secreto', '${llaves.secreto}')\non conflict (clave) do update set valor = excluded.valor;`
    : "";

  return (
    <Tarjeta>
      <Subtitulo>Configurar (una sola vez)</Subtitulo>
      <p className="mb-4 text-cafe-700">
        Para mandar notificaciones la app necesita unas llaves propias. Se generan aquí y tú las pegas en Vercel y en Supabase.{" "}
        <strong>No se las compartas a nadie.</strong>
      </p>
      {!llaves ? (
        <Boton onClick={generar} cargando={generando}>
          <KeyRound className="size-5" /> Generar llaves
        </Boton>
      ) : (
        <ol className="space-y-5">
          <li>
            <p className="font-etiqueta font-extrabold">1. En Vercel → tu proyecto → Settings → Environment Variables, agrega estas 3:</p>
            <div className="mt-2 space-y-2">
              <Valor nombre="VAPID_PUBLIC_KEY" valor={llaves.publica} />
              <Valor nombre="VAPID_PRIVATE_KEY" valor={llaves.privada} />
              <Valor nombre="NOTIFICACIONES_SECRETO" valor={llaves.secreto} />
            </div>
            <p className="mt-2 text-sm text-cafe-700">Luego Deployments → el último → ⋯ → Redeploy.</p>
          </li>
          <li>
            <p className="font-etiqueta font-extrabold">2. En Supabase → SQL Editor → New query, corre esto:</p>
            <Valor valor={sql} bloque />
          </li>
          <li>
            <p className="font-etiqueta font-extrabold">3. Cuando termine el Redeploy, recarga esta página y activa las notificaciones.</p>
            <Boton variante="suave" className="mt-2" onClick={alListo}>
              Ya lo hice, revisar
            </Boton>
          </li>
        </ol>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Tarjeta>
  );
}

function Valor({ nombre, valor, bloque }: { nombre?: string; valor: string; bloque?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(valor);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };
  return (
    <div className="rounded-2xl bg-crema-200/60 p-3">
      <div className="flex items-center justify-between gap-2">
        {nombre && <span className="font-mono text-sm font-bold">{nombre}</span>}
        <button onClick={() => void copiar()} className="ml-auto flex items-center gap-1 rounded-lg bg-cafe px-3 py-1.5 text-sm font-semibold text-crema">
          {copiado ? <Check className="size-4" /> : <Copy className="size-4" />} {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className={`mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs text-cafe-700 ${bloque ? "" : "line-clamp-2"}`}>{valor}</pre>
    </div>
  );
}
