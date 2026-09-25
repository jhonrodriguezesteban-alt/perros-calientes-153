"use client";

import { Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/modal";
import { cop } from "@/lib/formato";
import { gruposDe, precioUnitario } from "@/lib/pedido";
import type { LineaPedido, Producto, ToppingDeProducto } from "@/lib/tipos";

/**
 * "Arma tu perro": toppings de la casa premarcados, adicionales con costo a
 * mano y, al agregar un perro nuevo, la bebida en el mismo paso.
 */
export function ModalPerro({
  producto,
  lineaEditada,
  bebidas = [],
  alCerrar,
  alConfirmar,
}: {
  producto: Producto;
  lineaEditada?: LineaPedido;
  bebidas?: Producto[];
  alCerrar: () => void;
  alConfirmar: (toppings: ToppingDeProducto[], cantidad: number, bebida: Producto | null) => void;
}) {
  const [elegidos, setElegidos] = useState<Set<number>>(
    () =>
      new Set(
        (lineaEditada?.toppings ?? producto.toppings.filter((t) => t.incluido_por_defecto)).map((t) => t.topping_id),
      ),
  );
  const [cantidad, setCantidad] = useState(lineaEditada?.cantidad ?? 1);
  const [bebida, setBebida] = useState<Producto | null>(null);
  const ofrecerBebida = !lineaEditada && bebidas.length > 0;

  const toppings = producto.toppings.filter((t) => elegidos.has(t.topping_id));
  const unitario = precioUnitario({ producto, toppings });
  const clasicos = producto.toppings.filter((t) => !t.es_premium && !t.grupo);
  const premium = producto.toppings.filter((t) => t.es_premium && !t.grupo);
  const preciosAdicionales = new Set(premium.map((t) => t.precio_extra));
  const precioUnicoAdicional = preciosAdicionales.size === 1 ? [...preciosAdicionales][0] : 0;
  const total = (unitario + (bebida?.precio ?? 0)) * cantidad;
  const grupos = gruposDe(producto);
  const deLaCasa = producto.toppings.filter((t) => !t.es_premium);

  /** En un grupo (papa, queso) solo va una variante; tocar la elegida la quita. */
  const alternar = (topping: ToppingDeProducto) =>
    setElegidos((s) => {
      const n = new Set(s);
      if (n.has(topping.topping_id)) {
        n.delete(topping.topping_id);
      } else {
        if (topping.grupo) {
          producto.toppings.filter((t) => t.grupo === topping.grupo).forEach((t) => n.delete(t.topping_id));
        }
        n.add(topping.topping_id);
      }
      return n;
    });

  const conTodo = () =>
    setElegidos((s) => {
      const n = new Set(s);
      clasicos.forEach((t) => n.add(t.topping_id));
      for (const { opciones } of grupos) {
        if (opciones.some((t) => n.has(t.topping_id))) continue;
        const porDefecto = opciones.find((t) => t.incluido_por_defecto) ?? opciones[0];
        n.add(porDefecto.topping_id);
      }
      return n;
    });

  const sinNada = () => setElegidos((s) => new Set([...s].filter((id) => !deLaCasa.some((t) => t.topping_id === id))));

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
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex shrink-0 items-center rounded-2xl bg-crema ring-2 ring-cafe-100">
            <button
              aria-label="Uno menos"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="grid size-14 place-items-center rounded-l-2xl active:bg-cafe-100 sm:size-16"
            >
              <Minus className="size-7" />
            </button>
            <span className="numeros w-9 text-center font-titulo text-3xl font-extrabold sm:w-12">{cantidad}</span>
            <button
              aria-label="Uno más"
              onClick={() => setCantidad((c) => c + 1)}
              className="grid size-14 place-items-center rounded-r-2xl active:bg-cafe-100 sm:size-16"
            >
              <Plus className="size-7" />
            </button>
          </div>
          <button
            onClick={() => alConfirmar(toppings, cantidad, bebida)}
            aria-label={lineaEditada ? "Guardar cambios" : "Agregar al pedido"}
            className="flex h-16 min-w-0 flex-1 items-center justify-between gap-2 rounded-2xl bg-rojo px-4 font-etiqueta text-lg font-extrabold text-white shadow-md active:bg-rojo-700 sm:px-6 sm:text-xl"
          >
            <Plus className="size-7 shrink-0 sm:hidden" strokeWidth={3} aria-hidden />
            <span className="hidden sm:inline">{lineaEditada ? "Guardar cambios" : "Agregar al pedido"}</span>
            <span className="numeros font-titulo text-2xl">{cop(total)}</span>
          </button>
        </div>
      }
    >
      {deLaCasa.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">
              Toppings de la casa <span className="normal-case tracking-normal text-cafe-300">· incluidos</span>
            </h3>
            <div className="flex gap-2">
              <BotonTexto onClick={conTodo}>Con todo</BotonTexto>
              <BotonTexto onClick={sinNada}>Sin nada</BotonTexto>
            </div>
          </div>

          {grupos.map(({ nombre, opciones }) => (
            <div key={nombre} className="mb-3 flex items-center gap-3">
              <span className="w-16 shrink-0 font-etiqueta text-base font-semibold">{nombre}</span>
              <div className="grid flex-1 grid-cols-2 gap-3">
                {opciones.map((t) => (
                  <ChipTopping
                    key={t.topping_id}
                    topping={t}
                    etiqueta={variante(t.nombre, nombre)}
                    redondo
                    activo={elegidos.has(t.topping_id)}
                    onClick={() => alternar(t)}
                  />
                ))}
              </div>
            </div>
          ))}

          {clasicos.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {clasicos.map((t) => (
                <ChipTopping key={t.topping_id} topping={t} activo={elegidos.has(t.topping_id)} onClick={() => alternar(t)} />
              ))}
            </div>
          )}
        </section>
      )}

      {premium.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-3 font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">
            Adicionales
            {precioUnicoAdicional > 0 && (
              <span className="normal-case tracking-normal text-rojo"> · +{cop(precioUnicoAdicional)} c/u</span>
            )}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {premium.map((t) => (
              <ChipTopping key={t.topping_id} topping={t} activo={elegidos.has(t.topping_id)} onClick={() => alternar(t)} />
            ))}
          </div>
        </section>
      )}

      {ofrecerBebida && (
        <section className="mt-6">
          <h3 className="mb-3 font-etiqueta text-base font-semibold uppercase tracking-wide text-cafe-700">
            ¿Con bebida?
            {bebida && cantidad > 1 && <span className="normal-case tracking-normal text-cafe-300"> · una por perro</span>}
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OpcionBebida activa={!bebida} onClick={() => setBebida(null)} nombre="Sin bebida" />
            {bebidas.map((b) => (
              <OpcionBebida
                key={b.id}
                activa={bebida?.id === b.id}
                onClick={() => setBebida(b)}
                nombre={b.nombre}
                precio={b.precio}
              />
            ))}
          </div>
        </section>
      )}
    </Modal>
  );
}

function ChipTopping({
  topping,
  activo,
  onClick,
  etiqueta,
  redondo,
}: {
  topping: ToppingDeProducto;
  activo: boolean;
  onClick: () => void;
  etiqueta?: string;
  /** Opción de un grupo excluyente: indicador redondo (radio) en vez de check. */
  redondo?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      aria-label={topping.nombre}
      className={`relative flex min-h-20 flex-col items-start justify-center rounded-2xl px-4 py-3 text-left transition-colors ${
        activo ? "bg-cafe text-crema shadow-md" : "bg-crema text-cafe ring-2 ring-cafe-100 active:bg-cafe-100"
      }`}
    >
      <span className="pr-8 font-etiqueta text-lg font-semibold leading-tight">{etiqueta ?? topping.nombre}</span>
      {topping.precio_extra > 0 && (
        <span className={`numeros text-base font-semibold ${activo ? "text-mostaza" : "text-rojo"}`}>+{cop(topping.precio_extra)}</span>
      )}
      <span
        className={`absolute right-3 top-3 grid size-7 place-items-center rounded-full ${
          activo ? "bg-mostaza text-cafe" : "ring-2 ring-cafe-100"
        }`}
      >
        {activo && (redondo ? <span className="size-3 rounded-full bg-cafe" /> : <Check className="size-5" strokeWidth={3} />)}
      </span>
    </button>
  );
}

function OpcionBebida({
  nombre,
  precio,
  activa,
  onClick,
}: {
  nombre: string;
  precio?: number;
  activa: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activa}
      className={`flex min-h-20 flex-col items-start justify-center rounded-2xl px-4 py-3 text-left transition-colors ${
        activa ? "bg-mostaza text-cafe shadow-md" : "bg-crema text-cafe ring-2 ring-cafe-100 active:bg-cafe-100"
      }`}
    >
      <span className="font-etiqueta text-lg font-semibold leading-tight">{nombre}</span>
      {precio !== undefined && <span className="numeros text-base font-semibold text-rojo">+{cop(precio)}</span>}
    </button>
  );
}

/** "Papa hojuela" en el grupo "Papa" → "Hojuela". */
function variante(nombre: string, grupo: string) {
  const sinGrupo = nombre.toLowerCase().startsWith(grupo.toLowerCase() + " ") ? nombre.slice(grupo.length + 1) : nombre;
  return sinGrupo.charAt(0).toUpperCase() + sinGrupo.slice(1);
}

function BotonTexto({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-full px-4 py-2 font-etiqueta text-sm font-semibold text-cafe-700 ring-2 ring-cafe-100 active:bg-cafe-100">
      {children}
    </button>
  );
}
