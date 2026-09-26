import { redirect } from "next/navigation";
import { NavAdmin } from "@/components/admin/nav-admin";
import { exigirPerfil } from "@/lib/sesion";

export default async function LayoutPanel({ children }: LayoutProps<"/panel">) {
  const perfil = await exigirPerfil();
  if (perfil.rol !== "socio") redirect("/pos");
  return (
    <div className="min-h-dvh">
      <NavAdmin nombre={perfil.nombre} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
