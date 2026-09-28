import { redirect } from "next/navigation";
import { NavAdmin } from "@/components/admin/nav-admin";
import { exigirPerfil } from "@/lib/sesion";

export default async function LayoutPanel({ children }: LayoutProps<"/panel">) {
  const perfil = await exigirPerfil();
  if (perfil.rol !== "socio") redirect("/pos");
  return <NavAdmin nombre={perfil.nombre}>{children}</NavAdmin>;
}
