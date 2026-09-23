import type { LineaPedido, Producto, ToppingDeProducto } from "@/lib/tipos";

export function claveLinea(producto: Producto, toppings: ToppingDeProducto[]) {
  return `${producto.id}:${toppings.map((t) => t.topping_id).sort((a, b) => a - b).join(",")}`;
}

export function precioUnitario(linea: Pick<LineaPedido, "producto" | "toppings">) {
  return linea.producto.precio + linea.toppings.reduce((s, t) => s + t.precio_extra, 0);
}

export function totalPedido(lineas: LineaPedido[]) {
  return lineas.reduce((s, l) => s + precioUnitario(l) * l.cantidad, 0);
}

/** Agrega una línea; si ya existe una idéntica (mismo producto y toppings), suma cantidad. */
export function agregarLinea(lineas: LineaPedido[], producto: Producto, toppings: ToppingDeProducto[], cantidad = 1) {
  const clave = claveLinea(producto, toppings);
  const existente = lineas.find((l) => l.clave === clave);
  if (existente) {
    return lineas.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + cantidad } : l));
  }
  return [...lineas, { clave, producto, toppings, cantidad }];
}

/** Toppings que el cliente pidió quitar ("sin cebolla") respecto a los premarcados. */
export function toppingsQuitados(linea: LineaPedido) {
  const elegidos = new Set(linea.toppings.map((t) => t.topping_id));
  return linea.producto.toppings.filter((t) => t.incluido_por_defecto && !elegidos.has(t.topping_id));
}

/** Toppings agregados que no venían premarcados (premium, extras). */
export function toppingsAgregados(linea: LineaPedido) {
  return linea.toppings.filter((t) => !t.incluido_por_defecto);
}

export function resumenPedido(lineas: LineaPedido[]) {
  return lineas.map((l) => `${l.cantidad}× ${l.producto.nombre}`).join(", ");
}

export function describirLinea(linea: LineaPedido) {
  if (linea.producto.toppings.length === 0) return "";
  const partes: string[] = [];
  const quitados = toppingsQuitados(linea);
  const agregados = toppingsAgregados(linea);
  if (quitados.length === 0 && agregados.length === 0) return "Con todo";
  if (linea.toppings.length === 0) return "Sin toppings";
  if (quitados.length) partes.push("sin " + quitados.map((t) => t.nombre.toLowerCase()).join(", "));
  if (agregados.length) partes.push("+ " + agregados.map((t) => t.nombre.toLowerCase()).join(", "));
  return partes.join(" · ");
}
