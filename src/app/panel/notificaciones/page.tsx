import type { Metadata } from "next";
import { NotificacionesAdmin } from "@/components/admin/notificaciones-admin";

export const metadata: Metadata = { title: "Notificaciones · Bendito Perro Caliente" };

export default function Notificaciones() {
  return <NotificacionesAdmin />;
}
