import type { Familia, Unidad } from "@/lib/admin";

/** Lo que devuelve /api/compras/leer-factura después de leer la foto. */
export interface FacturaLeida {
  proveedor: string | null;
  fecha: string | null;
  medio_pago: "efectivo" | "tarjeta" | "transferencia" | "desconocido";
  total_factura: number | null;
  observaciones: string | null;
  items: ItemLeido[];
}

export interface ItemLeido {
  /** insumo = va al inventario; equipo = utensilio o equipo que no se gasta. */
  tipo: "insumo" | "equipo";
  /** Tal como aparece en la factura. */
  descripcion: string;
  /** Presentación y gramaje, p. ej. "2 × paquete 8 und" o "bolsa 1.000 g". */
  presentacion: string;
  /** Insumo existente al que corresponde, o null si no hay uno parecido. */
  insumo_id: number | null;
  /** Si no hay insumo: cómo se llamaría el nuevo. */
  nombre_sugerido: string | null;
  unidad: Unidad;
  familia_sugerida: Familia;
  /** Cantidad total en la unidad base del insumo (g, ml o und). */
  cantidad: number;
  /** Lo que se pagó por el renglón, ya con descuentos, en pesos. */
  costo_total: number;
  confianza: "alta" | "media" | "baja";
  nota: string | null;
}

export const NOMBRE_MEDIO_FACTURA: Record<FacturaLeida["medio_pago"], string> = {
  efectivo: "pago en efectivo",
  tarjeta: "pago con tarjeta",
  transferencia: "pago por transferencia",
  desconocido: "no dice cómo se pagó",
};

/**
 * Reduce la foto antes de subirla: las fotos del celular pesan varios MB y
 * para leer la factura basta con ~2000 px en el lado largo.
 */
export async function prepararFoto(archivo: File): Promise<{ data: string; media_type: "image/jpeg" }> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.round(bitmap.width * escala);
  lienzo.height = Math.round(bitmap.height * escala);
  lienzo.getContext("2d")!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  const url = lienzo.toDataURL("image/jpeg", 0.85);
  return { data: url.slice(url.indexOf(",") + 1), media_type: "image/jpeg" };
}
