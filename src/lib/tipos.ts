export type Rol = "empleado" | "socio";
export type MetodoPago = "efectivo" | "datafono" | "nequi" | "credito" | "mixto";

/** Métodos con los que se recibe plata (un pago mixto combina varios). */
export type MetodoCobro = "efectivo" | "datafono" | "nequi";

export interface Pago {
  metodo: MetodoCobro;
  monto: number;
}
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
  /** Toppings con el mismo grupo son excluyentes (ej. "Papa": ripio | hojuela). */
  grupo: string | null;
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
  /** Solo en ventas fiadas: quién queda debiendo. */
  cliente?: string;
  /** Solo en pagos mixtos: cuánto por cada método. */
  pagos?: Pago[];
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
  cliente: string | null;
  cobrada: boolean;
  pagos: Pago[] | null;
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

/** Resumen que guarda "Finalizar día" (turnos.resumen). */
export interface ResumenDia {
  abierto_en: string;
  hasta: string;
  abierto_por?: string;
  cerrado_por?: string;
  base_inicial: number;
  ventas: number;
  anuladas: number;
  total: number;
  efectivo: number;
  bold: number;
  nequi: number;
  fiado: number;
  cobros_fiado: { efectivo: number; bold: number; nequi: number };
  perros: number;
  bebidas: number;
  adicionales: number;
  productos: { nombre: string; tipo: string; cantidad: number; total: number }[];
  fiados: { cliente: string; total: number }[];
  retiros: number;
  retiros_detalle: { tercero: string; motivo: string | null; monto: number; hora: string }[];
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia_efectivo: number;
  bold_esperado: number;
  nequi_esperado: number;
  bancos_esperado: number;
  bold_declarado: number;
  nequi_declarado: number;
  bancos_declarado: number;
  diferencia_bancos: number;
  notas: string | null;
}

export interface RetiroCaja {
  id: string;
  monto: number;
  tercero: string;
  motivo: string | null;
  creado_en: string;
  registrado_por: string;
  puede_anular: boolean;
}
