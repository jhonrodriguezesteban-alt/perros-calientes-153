import { randomBytes } from "node:crypto";
import webpush from "web-push";
import { socioDeLaSesion } from "@/lib/sesion-api";

/**
 * Genera las llaves para configurar las notificaciones (se hace una sola vez).
 * Se muestran solo al socio para copiarlas a Vercel y a Supabase; no se guardan.
 */
export async function POST() {
  if (!(await socioDeLaSesion())) return Response.json({ error: "Solo socios" }, { status: 403 });
  const { publicKey, privateKey } = webpush.generateVAPIDKeys();
  return Response.json({ publica: publicKey, privada: privateKey, secreto: randomBytes(24).toString("base64url") });
}
