import type { Metadata } from "next";
import { VentasAdmin } from "@/components/admin/ventas-admin";

export const metadata: Metadata = { title: "Ventas · Bendito Perro Caliente" };

export default function Ventas() {
  return <VentasAdmin />;
}
