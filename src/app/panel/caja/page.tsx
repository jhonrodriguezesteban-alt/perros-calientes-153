import type { Metadata } from "next";
import { CajaAdmin } from "@/components/admin/caja-admin";

export const metadata: Metadata = { title: "Caja · Bendito Perro Caliente" };

export default function Caja() {
  return <CajaAdmin />;
}
