import { supabaseServidor } from "@/lib/supabase/server";

/** Para rutas /api: el socio con sesión, o null. */
export async function socioDeLaSesion() {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: perfil } = await supabase.from("perfiles").select("id, nombre, rol, activo").eq("id", id).single();
  return perfil?.activo && perfil.rol === "socio" ? perfil : null;
}
