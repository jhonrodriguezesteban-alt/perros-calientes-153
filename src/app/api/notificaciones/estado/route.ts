import { pushConfigurado } from "@/lib/push";
import { socioDeLaSesion } from "@/lib/sesion-api";

/** Si las notificaciones están configuradas y la llave pública para suscribirse. */
export async function GET() {
  if (!(await socioDeLaSesion())) return Response.json({ error: "Solo socios" }, { status: 403 });
  return Response.json({
    configurado: pushConfigurado() && !!process.env.NOTIFICACIONES_SECRETO,
    llavePublica: process.env.VAPID_PUBLIC_KEY ?? null,
  });
}
