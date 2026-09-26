import type { Metadata } from "next";
import { FinanzasAdmin } from "@/components/admin/finanzas-admin";

export const metadata: Metadata = { title: "Finanzas · Bendito Perro Caliente" };

export default function Finanzas() {
  return <FinanzasAdmin />;
}
