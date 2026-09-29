import type { Metadata } from "next";
import { NominaAdmin } from "@/components/admin/nomina-admin";

export const metadata: Metadata = { title: "Nómina y préstamos · Bendito Perro Caliente" };

export default function Nomina() {
  return <NominaAdmin />;
}
