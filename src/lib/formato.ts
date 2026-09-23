const pesos = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function cop(valor: number) {
  return pesos.format(Math.round(valor)).replace(/\s/g, "");
}

const hora = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

export function horaBogota(fecha: string | Date) {
  return hora.format(new Date(fecha));
}

export function cantidadInsumo(valor: number, unidad: "g" | "ml" | "und") {
  if (unidad === "und") return `${Math.round(valor)} und`;
  if (Math.abs(valor) >= 1000) return `${(valor / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} ${unidad === "g" ? "kg" : "L"}`;
  return `${Math.round(valor)} ${unidad}`;
}
