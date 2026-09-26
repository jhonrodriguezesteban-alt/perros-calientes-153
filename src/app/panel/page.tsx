import type { Metadata } from "next";
import { PanelEnVivo } from "@/components/panel/panel-en-vivo";

export const metadata: Metadata = { title: "Panel · Bendito Perro Caliente" };

export default function Panel() {
  return <PanelEnVivo />;
}
