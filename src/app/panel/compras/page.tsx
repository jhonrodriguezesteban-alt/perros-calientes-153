import type { Metadata } from "next";
import { ComprasAdmin } from "@/components/admin/compras-admin";

export const metadata: Metadata = { title: "Compras · Bendito Perro Caliente" };

export default async function Compras({ searchParams }: PageProps<"/panel/compras">) {
  const { solicitud } = await searchParams;
  return <ComprasAdmin solicitudInicial={typeof solicitud === "string" ? solicitud : undefined} />;
}
