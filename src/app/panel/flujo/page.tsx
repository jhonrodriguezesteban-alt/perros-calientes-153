import type { Metadata } from "next";
import { FlujoAdmin } from "@/components/admin/flujo-admin";

export const metadata: Metadata = { title: "Flujo de caja · Bendito Perro Caliente" };

export default function Flujo() {
  return <FlujoAdmin />;
}
