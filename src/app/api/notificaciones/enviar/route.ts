import { createClient } from "@supabase/supabase-js";
import { enviarPush, pushConfigurado, type AvisoPush, type SuscripcionPush } from "@/lib/push";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/config";

/**
 * La base de datos llama aquí (pg_net) cuando pasa algo: venta, cierre,
 * solicitud… con la clave compartida en el encabezado x-secreto.
 */
export async function POST(request: Request) {
  const secreto = process.env.NOTIFICACIONES_SECRETO;
  if (!secreto || request.headers.get("x-secreto") !== secreto) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!pushConfigurado()) return Response.json({ error: "Faltan las llaves VAPID" }, { status: 503 });

  const cuerpo = (await request.json()) as AvisoPush & { suscripciones?: SuscripcionPush[] };
  const { suscripciones = [], ...aviso } = cuerpo;
  const { enviadas, vencidas } = await enviarPush(suscripciones, aviso);

  if (vencidas.length > 0) {
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    const { error } = await supabase.rpc("quitar_suscripciones_vencidas", { p_secreto: secreto, p_endpoints: vencidas });
    if (error) console.error("quitar_suscripciones_vencidas", error.message);
  }
  return Response.json({ enviadas, vencidas: vencidas.length, fallidas: suscripciones.length - enviadas - vencidas.length });
}
