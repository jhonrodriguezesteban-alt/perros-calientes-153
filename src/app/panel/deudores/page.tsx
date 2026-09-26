import type { Metadata } from "next";
import { DeudoresAdmin } from "@/components/admin/deudores-admin";

export const metadata: Metadata = { title: "Deudores · Bendito Perro Caliente" };

export default function Deudores() {
  return <DeudoresAdmin />;
}
