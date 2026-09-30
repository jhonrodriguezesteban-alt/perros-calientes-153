import webpush, { WebPushError } from "web-push";

/** Lo que llega a cada celular. */
export interface AvisoPush {
  tipo: string;
  titulo: string;
  cuerpo: string;
  url: string;
}

export interface SuscripcionPush {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushConfigurado = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

/** Manda el aviso a cada suscripción: cuántas llegaron y cuáles ya no existen. */
export async function enviarPush(suscripciones: SuscripcionPush[], aviso: AvisoPush) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "https://bendito-perro-caliente.vercel.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  const vencidas: string[] = [];
  let enviadas = 0;
  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(aviso), { TTL: 60 * 60 * 12, urgency: "high" });
        enviadas++;
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) vencidas.push(s.endpoint);
        else console.error("push", e);
      }
    }),
  );
  return { enviadas, vencidas };
}
