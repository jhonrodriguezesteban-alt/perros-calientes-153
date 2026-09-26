import type { Metadata } from "next";
import { SolicitudesAdmin } from "@/components/admin/solicitudes-admin";

export const metadata: Metadata = { title: "Solicitudes · Bendito Perro Caliente" };

export default function Solicitudes() {
  return <SolicitudesAdmin />;
}
