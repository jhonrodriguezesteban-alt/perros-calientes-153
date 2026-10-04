"use client";

import { Modal } from "@/components/modal";
import { cop } from "@/lib/formato";
import { gruposDe } from "@/lib/pedido";
import type { LineaPedido, Producto, ToppingDeProducto } from "@/lib/tipos";

/** "Gaseosa personal · Pepsi" → "Pepsi". */
export function nombreSabor(t: { nombre: string }) {
  const i = t.nombre.lastIndexOf(" · ");
  return i >= 0 ? t.nombre.slice(i + 3) : t.nombre;
}

/** Bebida con sabores: un toque en el sabor la suma al pedido (descuenta ese sabor del inventario). */
export function ModalSabor({
  producto,
  cantidad,
  lineaEditada,
  alCerrar,
  alElegir,
}: {
  producto: Producto;
  cantidad: number;
  lineaEditada?: LineaPedido;
  alCerrar: () => void;
  alElegir: (sabor: ToppingDeProducto) => void;
}) {
  const opciones = gruposDe(producto)[0]?.opciones ?? [];
  const actual = lineaEditada?.toppings[0]?.topping_id;
  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo={
        <>
          {producto.nombre}
          {cantidad > 1 && <span className="text-cafe-700"> × {cantidad}</span>}
          <span className="numeros ml-2 text-rojo">{cop(producto.precio * cantidad)}</span>
        </>
      }
    >
      <p className="mb-3 font-etiqueta text-sm font-semibold text-cafe-700">¿De qué sabor?</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {opciones.map((t) => (
          <button
            key={t.topping_id}
            onClick={() => alElegir(t)}
            className={`min-h-16 rounded-2xl px-3 font-titulo text-lg font-extrabold leading-tight transition-transform active:scale-[0.97] ${
              t.topping_id === actual ? "bg-cafe text-crema" : "bg-crema ring-2 ring-cafe-100 active:bg-crema-200"
            }`}
          >
            {nombreSabor(t)}
          </button>
        ))}
      </div>
    </Modal>
  );
}
