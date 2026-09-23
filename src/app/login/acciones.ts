"use server";

import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

export interface EstadoLogin {
  error: string | null;
  email: string;
}

export async function iniciarSesion(_previo: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const email = String(datos.get("email") ?? "").trim();
  const clave = String(datos.get("clave") ?? "");
  if (!email || !clave) return { error: "Escribe tu correo y tu contraseña.", email };

  const supabase = await supabaseServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password: clave });
  if (error) {
    return {
      error: error.status === 400 ? "Correo o contraseña incorrectos." : "No pudimos conectarnos. Revisa el internet e intenta otra vez.",
      email,
    };
  }
  redirect("/");
}
