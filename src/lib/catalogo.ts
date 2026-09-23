import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalogo, Producto } from "@/lib/tipos";

interface FilaProducto extends Omit<Producto, "toppings"> {
  producto_toppings: {
    incluido_por_defecto: boolean;
    precio_extra: number;
    toppings: { id: number; nombre: string; es_premium: boolean; orden: number; activo: boolean } | null;
  }[];
}

/** Catálogo activo del POS: categorías, productos y sus toppings. */
export async function cargarCatalogo(supabase: SupabaseClient): Promise<Catalogo> {
  const [categorias, productos] = await Promise.all([
    supabase.from("categorias").select("id, nombre, orden").eq("activo", true).order("orden"),
    supabase
      .from("productos")
      .select(
        "id, categoria_id, nombre, descripcion, tipo, precio, orden, " +
          "producto_toppings(incluido_por_defecto, precio_extra, toppings(id, nombre, es_premium, orden, activo))",
      )
      .eq("activo", true)
      .order("orden")
      .returns<FilaProducto[]>(),
  ]);
  if (categorias.error) throw categorias.error;
  if (productos.error) throw productos.error;

  return {
    categorias: categorias.data,
    productos: productos.data.map(({ producto_toppings, ...p }) => ({
      ...p,
      precio: Number(p.precio),
      toppings: producto_toppings
        .filter((pt) => pt.toppings?.activo)
        .map((pt) => ({
          topping_id: pt.toppings!.id,
          nombre: pt.toppings!.nombre,
          es_premium: pt.toppings!.es_premium,
          orden: pt.toppings!.orden,
          incluido_por_defecto: pt.incluido_por_defecto,
          precio_extra: Number(pt.precio_extra),
        }))
        .sort((a, b) => Number(a.es_premium) - Number(b.es_premium) || a.orden - b.orden),
    })),
  };
}
