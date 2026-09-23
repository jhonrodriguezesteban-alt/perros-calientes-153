"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cop } from "@/lib/formato";
import { precioUnitario } from "@/lib/pedido";
import type { LineaPedido, Producto, ToppingDeProducto } from "@/lib/tipos";

/** "Arma tu perro": toppings clásicos premarcados, premium a mano. */
export function ModalPerro({
  producto,
  lineaEditada,
  alCerrar,
  alConfirmar,
}: {
  producto: Producto;
  lineaEditada?: LineaPedido;
  alCerrar: () => void;
  alConfirmar: (toppings: ToppingDeProducto[], cantidad: number) => void;
}) {
  const [elegidos, setElegidos] = useState<Set<number>>(
    () =>
      new Set(
        (lineaEditada?.toppings ?? producto.toppings.filter((t) => t.incluido_por_defecto)).map((t) => t.topping_id),
      ),
  );
  const [cantidad, setCantidad] = useState(lineaEditada?.cantidad ?? 1);

  const toppings = producto.toppings.filter((t) => elegidos.has(t.topping_id));
  const unitario = precioUnitario({ producto, toppings });
  const clasicos = producto.toppings.filter((t) => !t.es_premium);
  const premium = producto.toppings.filter((t) => t.es_premium);

  const alternar = (id: number) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
      titulo={
        <>
          {producto.nombre} <span className="text-rojo">{cop(producto.precio)}</span>
        </>
      }
      pie={
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-2xl bg-crema ring-2 ring-cafe-100">
            <button
              aria-label="Uno menos"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="grid size-16 place-items-center rounded-l-2xl active:bg-cafe-100"
            >
              <Minus className="size-7" />
            </button>
            <span className="numeros w-12 text-center font-titulo text-3xl font-extrabold">{cantidad}</span>
            <button
              aria-label="Uno más"
              onClick={() => setCantidad((c) => c + 1)}
              className="grid size-16 place-items-center rounded-r-2xl active:bg-cafe-100"
            >
              <Plus className="size-7" />
            </button>
          </div>
          <button
            onClick={() => alConfirmar(toppings, cantidad)}
            className="flex h-16 flex-1 items-center justify-between rounded-2xl bg-rojo px-6 font-etiqueta text-xl font-extrabold text-white shadow-md active:bg-rojo-700"
          >
            <span>{lineaEditada ? "Guardar cambios" : "Agregar al pedido"}</span>
            <span className="numeros font-titulo text-2xl">{cop(unitario * cantidad)}</span>
          </button>
        </div>
      }
    >
      {clasicos.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">Toppings de la casa</h3>
            <div className="flex gap-2">
              <BotonTexto onClick={() => setElegidos((s) => new Set([...s, ...clasicos.map((t) => t.topping_id)]))}>
                Con todo
              </BotonTexto>
              <BotonTexto
                onClick={() =>
                  setElegidos((s) => new Set([...s].filter((id) => !clasicos.some((t) => t.topping_id === id))))
                }
              >
                Sin nada
              </BotonTexto>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {clasicos.map((t) => (
              <ChipTopping key={t.topping_id} topping={t} activo={elegidos.has(t.topping_id)} onClick={() => alternar(t.topping_id)} />
            ))}
          </div>
        </section>
      )}

      {premium.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">
            Premium <span className="normal-case tracking-normal text-cafe-300">· se agregan a mano</span>
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {premium.map((t) => (
              <ChipTopping key={t.topping_id} topping={t} activo={elegidos.has(t.topping_id)} onClick={() => alternar(t.topping_id)} />
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}

function ChipTopping({ topping, activo, onClick }: { topping: ToppingDeProducto; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`relative flex min-h-20 flex-col items-start justify-center rounded-2xl px-4 py-3 text-left transition-colors ${
        activo ? "bg-cafe text-crema shadow-md" : "bg-crema text-cafe ring-2 ring-cafe-100 active:bg-cafe-100"
      }`}
    >
      <span className="pr-8 font-etiqueta text-lg font-semibold leading-tight">{topping.nombre}</span>
      {topping.precio_extra > 0 && (
        <span className={`numeros text-base font-semibold ${activo ? "text-mostaza" : "text-rojo"}`}>+{cop(topping.precio_extra)}</span>
      )}
      <span
        className={`absolute right-3 top-3 grid size-7 place-items-center rounded-full ${
          activo ? "bg-mostaza text-cafe" : "ring-2 ring-cafe-100"
        }`}
      >
        {activo && <Check className="size-5" strokeWidth={3} />}
      </span>
    </button>
  );
}

function BotonTexto({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full px-4 py-2 font-etiqueta text-sm font-semibold text-cafe-700 ring-2 ring-cafe-100 active:bg-cafe-100">
      {children}
    </button>
  );
}
