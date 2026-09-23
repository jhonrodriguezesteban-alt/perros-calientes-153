import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PanelEnVivo } from "@/components/panel/panel-en-vivo";
import { exigirPerfil } from "@/lib/sesion";

export const metadata: Metadata = { title: "Panel · Bendito Perro Caliente" };

export default async function Panel() {
  const perfil = await exigirPerfil();
  if (perfil.rol !== "socio") redirect("/pos");
  return <PanelEnVivo nombre={perfil.nombre} />;
}
