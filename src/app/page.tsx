import { redirect } from "next/navigation";
import { exigirPerfil } from "@/lib/sesion";

export default async function Inicio() {
  const perfil = await exigirPerfil();
  redirect(perfil.rol === "socio" ? "/panel" : "/pos");
}
