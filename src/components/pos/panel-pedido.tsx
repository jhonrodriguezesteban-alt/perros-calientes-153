"use client";

import { Banknote, CupSoda, Minus, Plus, QrCode, Trash2 } from "lucide-react";
import { cop } from "@/lib/formato";
import { describirLinea, precioUnitario, totalPedido } from "@/lib/pedido";
import type { LineaPedido, MetodoPago, Producto } from "@/lib/tipos";

export function PanelPedido({
  lineas,
  bebidas,
  alCambiarCantidad,
  alEditar,
  alAgregarBebida,
  alVaciar,
  alCobrar,
}: {
  lineas: LineaPedido[];
  bebidas: Producto[];
  alCambiarCantidad: (clave: string, delta: number) => void;
  alEditar: (linea: LineaPedido) => void;
  alAgregarBebida: (bebida: Producto) => void;
  alVaciar: () => void;
  alCobrar: (metodo: MetodoPago) => void;
}) {
  const total = totalPedido(lineas);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const tienePerro = lineas.some((l) => l.producto.tipo === "perro");
  const tieneBebida = lineas.some((l) => l.producto.tipo === "bebida");

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <h2 className="font-titulo text-3xl font-extrabold">
          Pedido {unidades > 0 && <span className="text-cafe-300">· {unidades}</span>}
        </h2>
        {lineas.length > 0 && (
          <button onClick={alVaciar} className="flex items-center gap-2 rounded-full px-4 py-2 font-etiqueta text-sm font-semibold text-cafe-700 active:bg-cafe-100">
            <Trash2 className="size-5" /> Vaciar
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        {lineas.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center text-cafe-300">
            <p className="font-etiqueta text-lg font-semibold">Toca un producto para empezar el pedido</p>
          </div>
        ) : (
          <ul className="space-y-2 pb-3">
            {lineas.map((l) => {
              const detalle = describirLinea(l);
              const editable = l.producto.toppings.length > 0;
              return (
                <li key={l.clave} className="flex items-center gap-2 rounded-2xl bg-crema p-2 ring-1 ring-cafe-100">
                  <button
                    disabled={!editable}
                    onClick={() => alEditar(l)}
                    className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left enabled:active:bg-cafe-100"
                  >
                    <p className="truncate font-titulo text-xl font-bold leading-tight">{l.producto.nombre}</p>
                    {detalle && <p className="line-clamp-2 text-sm leading-snug text-cafe-700">{detalle}</p>}
                    <p className="numeros font-etiqueta text-base font-semibold text-rojo">{cop(precioUnitario(l) * l.cantidad)}</p>
                  </button>
                  <div className="flex shrink-0 items-center">
                    <BotonCantidad etiqueta="Uno menos" onClick={() => alCambiarCantidad(l.clave, -1)}>
                      <Minus className="size-6" />
                    </BotonCantidad>
                    <span className="numeros w-9 text-center font-titulo text-2xl font-extrabold">{l.cantidad}</span>
                    <BotonCantidad etiqueta="Uno más" onClick={() => alCambiarCantidad(l.clave, 1)}>
                      <Plus className="size-6" />
                    </BotonCantidad>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {tienePerro && !tieneBebida && bebidas.length > 0 && (
        <div className="mx-3 mb-3 rounded-2xl border-2 border-dashed border-mostaza bg-mostaza-100/50 p-3">
          <p className="mb-2 flex items-center gap-2 font-etiqueta text-sm font-semibold">
            <CupSoda className="size-5 text-cafe-700" /> ¿Lo acompañamos con algo de tomar?
          </p>
          <div className="flex flex-wrap gap-2">
            {bebidas.map((b) => (
              <button
                key={b.id}
                onClick={() => alAgregarBebida(b)}
                className="min-h-12 rounded-xl bg-crema px-4 font-etiqueta text-sm font-semibold ring-2 ring-mostaza active:bg-mostaza-100"
              >
                {b.nombre} <span className="numeros text-rojo">{cop(b.precio)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t-2 border-cafe-100 bg-crema-200/70 px-5 pb-5 pt-4">
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-etiqueta text-lg font-semibold uppercase tracking-wide text-cafe-700">Total</span>
          <span className="numeros font-titulo text-5xl font-extrabold text-rojo">{cop(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <BotonPago disabled={lineas.length === 0} onClick={() => alCobrar("efectivo")} Icono={Banknote}>
            Efectivo
          </BotonPago>
          <BotonPago disabled={lineas.length === 0} onClick={() => alCobrar("datafono")} Icono={QrCode}>
            Datáfono
          </BotonPago>
        </div>
      </div>
    </div>
  );
}

function BotonCantidad({ children, onClick, etiqueta }: { children: React.ReactNode; onClick: () => void; etiqueta: string }) {
  return (
    <button aria-label={etiqueta} onClick={onClick} className="grid size-14 place-items-center rounded-xl bg-crema-200 active:bg-cafe-100">
      {children}
    </button>
  );
}

function BotonPago({
  children,
  onClick,
  disabled,
  Icono,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  Icono: typeof Banknote;
}) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="flex h-20 flex-col items-center justify-center gap-1 rounded-2xl bg-cafe font-etiqueta text-lg font-extrabold text-crema shadow-md active:bg-cafe-700 disabled:bg-cafe-300 disabled:shadow-none"
    >
      <Icono className="size-7 text-mostaza" />
      {children}
    </button>
  );
}
