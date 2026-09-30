import { enviarPush, pushConfigurado, type SuscripcionPush } from "@/lib/push";
import { socioDeLaSesion } from "@/lib/sesion-api";

/** Manda una notificación de prueba a este dispositivo. */
export async function POST(request: Request) {
  const socio = await socioDeLaSesion();
  if (!socio) return Response.json({ error: "Solo socios" }, { status: 403 });
  if (!pushConfigurado()) return Response.json({ error: "Faltan las llaves en Vercel" }, { status: 503 });
  const { suscripcion } = (await request.json()) as { suscripcion?: SuscripcionPush };
  if (!suscripcion?.endpoint || !suscripcion.keys) return Response.json({ error: "Falta la suscripción" }, { status: 400 });
  const { enviadas, vencidas } = await enviarPush([suscripcion], {
    tipo: "prueba",
    titulo: "🌭 ¡Listo, " + socio.nombre + "!",
    cuerpo: "Así te van a llegar las ventas, los cierres y las solicitudes.",
    url: "/panel/notificaciones",
  });
  if (vencidas.length) return Response.json({ error: "Este dispositivo ya no acepta notificaciones: desactívalas y actívalas de nuevo." }, { status: 410 });
  if (!enviadas) return Response.json({ error: "No se pudo entregar la notificación. Intenta de nuevo en un momento." }, { status: 502 });
  return Response.json({ ok: true });
}
