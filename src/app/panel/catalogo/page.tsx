import type { Metadata } from "next";
import { CatalogoAdmin } from "@/components/admin/catalogo-admin";

export const metadata: Metadata = { title: "Menú · Bendito Perro Caliente" };

export default function Catalogo() {
  return <CatalogoAdmin />;
}
