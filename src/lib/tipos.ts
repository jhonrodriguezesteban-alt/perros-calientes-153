export type Rol = "empleado" | "socio";
export type MetodoPago = "efectivo" | "datafono";
export type TipoProducto = "perro" | "bebida" | "acompanamiento";

export interface Perfil {
  id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export interface Categoria {
  id: number;
  nombre: string;
  orden: number;
}

export interface ToppingDeProducto {
  topping_id: number;
  nombre: string;
  es_premium: boolean;
  orden: number;
  incluido_por_defecto: boolean;
  precio_extra: number;
}

export interface Producto {
  id: number;
  categoria_id: number;
  nombre: string;
  descripcion: string | null;
  tipo: TipoProducto;
  precio: number;
  orden: number;
  toppings: ToppingDeProducto[];
}

export interface Catalogo {
  categorias: Categoria[];
  productos: Producto[];
}

/** Línea del pedido en pantalla. */
export interface LineaPedido {
  clave: string;
  producto: Producto;
  cantidad: number;
  toppings: ToppingDeProducto[];
}

/** Lo que se envía a registrar_venta (y se guarda en la cola si no hay internet). */
export interface VentaPorEnviar {
  id: string;
  vendida_en: string;
  metodo_pago: MetodoPago;
  notas?: string;
  items: { producto_id: number; cantidad: number; toppings: number[] }[];
  /** Solo para mostrar mientras está pendiente; el servidor recalcula el total. */
  total_estimado: number;
  resumen: string;
}

export interface VentaDeHoy {
  id: string;
  numero: number;
  vendida_en: string;
  metodo_pago: MetodoPago;
  total: number;
  estado: "completada" | "anulada";
  resumen: string;
  puede_anular: boolean;
}

export interface Turno {
  id: string;
  abierto_en: string;
  abierto_por: string;
  base_inicial: number;
}

export interface AlertaStock {
  insumo_id: number;
  nombre: string;
  unidad: "g" | "ml" | "und";
  stock_actual: number;
  stock_minimo: number;
}
