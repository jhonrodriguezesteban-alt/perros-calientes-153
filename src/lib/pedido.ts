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

/** Grupos de variantes excluyentes del producto, en orden (ej. Papa, Queso). */
export function gruposDe(producto: Producto) {
  const grupos = new Map<string, ToppingDeProducto[]>();
  for (const t of producto.toppings) {
    if (!t.grupo) continue;
    grupos.set(t.grupo, [...(grupos.get(t.grupo) ?? []), t]);
  }
  return [...grupos.entries()].map(([nombre, opciones]) => ({ nombre, opciones }));
}

export function resumenPedido(lineas: LineaPedido[]) {
  return lineas.map((l) => `${l.cantidad}× ${l.producto.nombre}`).join(", ");
}

/** Qué cambió respecto al perro "con todo": "sin mostaza · papa hojuela · + guacamole". */
export function describirLinea(linea: LineaPedido) {
  const { producto } = linea;
  if (producto.toppings.length === 0) return "";
  if (linea.toppings.length === 0) return "Sin toppings";

  const elegidos = new Set(linea.toppings.map((t) => t.topping_id));
  const minus = (t: { nombre: string }) => t.nombre.toLowerCase();
  const cambios: string[] = [];

  for (const { nombre, opciones } of gruposDe(producto)) {
    const elegida = opciones.find((t) => elegidos.has(t.topping_id));
    const porDefecto = opciones.find((t) => t.incluido_por_defecto);
    if (!elegida && porDefecto) cambios.push(`sin ${nombre.toLowerCase()}`);
    else if (elegida && elegida.topping_id !== porDefecto?.topping_id) cambios.push(minus(elegida));
  }

  const sueltos = producto.toppings.filter((t) => !t.grupo);
  const quitados = sueltos.filter((t) => t.incluido_por_defecto && !elegidos.has(t.topping_id));
  const agregados = sueltos.filter((t) => !t.incluido_por_defecto && elegidos.has(t.topping_id));
  if (quitados.length) cambios.push("sin " + quitados.map(minus).join(", "));
  if (agregados.length) cambios.push("+ " + agregados.map(minus).join(", "));

  return cambios.length ? cambios.join(" · ") : "Con todo";
}
