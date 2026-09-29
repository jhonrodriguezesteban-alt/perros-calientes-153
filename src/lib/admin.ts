import { supabaseNavegador } from "@/lib/supabase/client";
import type { MetodoPago, TipoProducto } from "@/lib/tipos";

export type Unidad = "g" | "ml" | "und";

export type Familia = "perro" | "bebidas" | "utensilios" | "otros";

/** Familias de insumos, en el orden en que se muestran. */
export const FAMILIAS: { id: Familia; nombre: string; ayuda: string }[] = [
  { id: "perro", nombre: "Para el perro", ayuda: "Pan, salchicha, quesos, papas, salsas y toppings" },
  { id: "bebidas", nombre: "Bebidas", ayuda: "Gaseosas y aguas" },
  { id: "utensilios", nombre: "Utensilios y empaques", ayuda: "Bandejas, servilletas, bolsas, cajitas" },
  { id: "otros", nombre: "Otros", ayuda: "Lo que no encaje en las anteriores" },
];

export interface Insumo {
  id: number;
  nombre: string;
  unidad: Unidad;
  costo_unitario: number;
  stock_actual: number;
  stock_minimo: number;
  activo: boolean;
  es_estimado: boolean;
  nota: string | null;
  familia: Familia;
}

export interface Solicitud {
  id: string;
  insumo_id: number | null;
  descripcion: string;
  cantidad: number | null;
  unidad: Unidad | null;
  nota: string | null;
  estado: "pendiente" | "comprada" | "descartada";
  creado_en: string;
  atendido_en: string | null;
  respuesta: string | null;
  solicitante: { nombre: string } | null;
}

export type PagoCompra = "caja" | "efectivo" | "tarjeta" | "transferencia" | "socio" | "fondo";

export const PAGOS_COMPRA: { id: PagoCompra; nombre: string }[] = [
  { id: "caja", nombre: "Efectivo de la caja" },
  { id: "efectivo", nombre: "Efectivo (otro)" },
  { id: "tarjeta", nombre: "Tarjeta" },
  { id: "transferencia", nombre: "Transferencia / Nequi" },
  { id: "socio", nombre: "Lo pagó un socio" },
  { id: "fondo", nombre: "Fondo de inversión" },
];

export interface Compra {
  id: string;
  fecha: string;
  proveedor: string | null;
  gasto_id: string | null;
  pagado_con: PagoCompra | null;
  socio: { nombre: string } | null;
  compra_items: { cantidad: number; costo_total: number; insumos: { nombre: string; unidad: Unidad } | null }[];
  /** Equipos y utensilios de la compra (gastos de inversión, no inventario). */
  equipos: { monto: number; descripcion: string | null }[];
}

export interface CategoriaGasto {
  id: number;
  nombre: string;
  tipo: "fijo" | "variable" | "inversion";
}

export interface Gasto {
  id: string;
  fecha: string;
  monto: number;
  descripcion: string | null;
  categorias_gasto: { nombre: string; tipo: CategoriaGasto["tipo"] } | null;
  compras: { id: string }[];
  pagado_con: PagoCompra | null;
}

export interface ResumenMes {
  mes: string;
  ventas: number;
  perros: number;
  ingresos: number;
  costo_insumos: number;
  comisiones: number;
  margen: number;
  gastos_fijos: number;
  gastos_variables: number;
  compras_insumos: number;
  inversion: number;
  utilidad_operativa: number;
  flujo_caja: number;
}

export interface ProductoAdmin {
  id: number;
  categoria_id: number;
  nombre: string;
  tipo: TipoProducto;
  precio: number;
  orden: number;
  activo: boolean;
  receta_items: { insumo_id: number; cantidad: number }[];
  producto_toppings: { topping_id: number; incluido_por_defecto: boolean; precio_extra: number }[];
}

export interface ToppingAdmin {
  id: number;
  nombre: string;
  es_premium: boolean;
  grupo: string | null;
  orden: number;
  activo: boolean;
  topping_insumos: { insumo_id: number; cantidad: number }[];
}

export type { MetodoPago };

export const nombreUnidad: Record<Unidad, string> = { g: "gramos", ml: "mililitros", und: "unidades" };

export function db() {
  return supabaseNavegador();
}

/** Costo de una lista de insumos (receta o porción) con los costos actuales. */
export function costoDe(items: { insumo_id: number; cantidad: number }[], insumos: Map<number, Insumo>) {
  return items.reduce((s, it) => s + it.cantidad * (insumos.get(it.insumo_id)?.costo_unitario ?? 0), 0);
}

export function hoyBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

export function fechaCorta(fecha: string) {
  const f = fecha.length === 10 ? new Date(fecha + "T12:00:00-05:00") : new Date(fecha);
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" }).format(f);
}

export function mesLargo(fecha: string) {
  const f = new Date(fecha.slice(0, 10) + "T12:00:00-05:00");
  const t = new Intl.DateTimeFormat("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" }).format(f);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
