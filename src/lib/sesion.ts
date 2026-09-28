import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/tipos";

/** Usuario con perfil activo, o redirige al login. */
export async function exigirPerfil(): Promise<Perfil> {
  const supabase = await supabaseServidor();
  const { data } = await supabase.auth.getClaims();
  const usuario = data?.claims?.sub;
  if (!usuario) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, nombre, rol, activo")
    .eq("id", usuario)
    .single<Perfil>();

  if (!perfil?.activo) redirect("/login?error=inactivo");
  return perfil;
}
