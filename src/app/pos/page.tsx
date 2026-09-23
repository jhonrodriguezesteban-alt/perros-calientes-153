import type { Metadata } from "next";
import { PosCliente } from "@/components/pos/pos-cliente";
import { cargarCatalogo } from "@/lib/catalogo";
import { exigirPerfil } from "@/lib/sesion";
import { supabaseServidor } from "@/lib/supabase/server";
import type { Catalogo } from "@/lib/tipos";

export const metadata: Metadata = { title: "Ventas · Bendito Perro Caliente" };

export default async function Pos() {
  const perfil = await exigirPerfil();
  let catalogo: Catalogo | null = null;
  try {
    catalogo = await cargarCatalogo(await supabaseServidor());
  } catch {
    // Sin catálogo del servidor: el POS usa el último guardado en la tablet.
  }
  return <PosCliente perfil={perfil} catalogoInicial={catalogo} />;
}
