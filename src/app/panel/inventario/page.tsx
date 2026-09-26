import type { Metadata } from "next";
import { InventarioAdmin } from "@/components/admin/inventario-admin";

export const metadata: Metadata = { title: "Inventario · Bendito Perro Caliente" };

export default function Inventario() {
  return <InventarioAdmin />;
}
