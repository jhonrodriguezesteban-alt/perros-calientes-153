"use client";

import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { costoDe, db, type Insumo, type ProductoAdmin, type ToppingAdmin } from "@/lib/admin";
import { cop } from "@/lib/formato";
import type { Categoria, TipoProducto } from "@/lib/tipos";
import { costoLineas, EditorReceta, lineasValidas, nuevaLinea, type LineaReceta } from "./editor-receta";
import {
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Entrada,
  EntradaPesos,
  exigir,
  Insignia,
  mensajeError,
  MensajeError,
  Selector,
  Subtitulo,
  Tarjeta,
  useDatos,
  Vacio,
} from "./ui";

async function cargarCatalogo() {
  const [categorias, productos, toppings, insumos] = await Promise.all([
    db().from("categorias").select("id, nombre, orden").order("orden").returns<Categoria[]>(),
    db()
      .from("productos")
      .select("id, categoria_id, nombre, tipo, precio, orden, activo, receta_items(insumo_id, cantidad), producto_toppings(topping_id, incluido_por_defecto, precio_extra)")
      .order("orden")
      .returns<ProductoAdmin[]>(),
    db().from("toppings").select("id, nombre, es_premium, grupo, orden, activo, topping_insumos(insumo_id, cantidad)").order("orden").returns<ToppingAdmin[]>(),
    db().from("insumos").select("*").eq("activo", true).order("nombre").returns<Insumo[]>(),
  ]);
  return { categorias: exigir(categorias), productos: exigir(productos), toppings: exigir(toppings), insumos: exigir(insumos) };
}

type Datos = Awaited<ReturnType<typeof cargarCatalogo>>;

/** Costo de un producto: receta + toppings que vienen marcados. */
function costoProducto(p: ProductoAdmin, toppings: Map<number, ToppingAdmin>, insumos: Map<number, Insumo>) {
  const base = costoDe(p.receta_items, insumos);
  const tops = p.producto_toppings
    .filter((pt) => pt.incluido_por_defecto && toppings.get(pt.topping_id)?.activo)
    .reduce((s, pt) => s + costoDe(toppings.get(pt.topping_id)?.topping_insumos ?? [], insumos), 0);
  return base + tops;
}

export function CatalogoAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarCatalogo);
  const [producto, setProducto] = useState<ProductoAdmin | "nuevo" | null>(null);
  const [topping, setTopping] = useState<ToppingAdmin | "nuevo" | null>(null);
  const [verInactivos, setVerInactivos] = useState(false);

  const mapas = useMemo(
    () => ({
      insumos: new Map((data?.insumos ?? []).map((i) => [i.id, i])),
      toppings: new Map((data?.toppings ?? []).map((t) => [t.id, t])),
    }),
    [data],
  );

  return (
    <div className="space-y-6">
      <Encabezado
        titulo="Menú"
        descripcion="Productos y toppings que ve Andrea en la tablet. Cada uno con su receta, para saber cuánto cuesta y cuánto deja."
        accion={
          <label className="flex items-center gap-2 font-etiqueta text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-cafe" checked={verInactivos} onChange={(e) => setVerInactivos(e.target.checked)} />
            Ver inactivos
          </label>
        }
      />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {data && (
        <>
          <Tarjeta>
            <Subtitulo
              accion={
                <Boton onClick={() => setProducto("nuevo")}>
                  <Plus className="size-5" /> Nuevo producto
                </Boton>
              }
            >
              Productos
            </Subtitulo>
            {data.categorias.map((c) => {
              const productos = data.productos.filter((p) => p.categoria_id === c.id && (verInactivos || p.activo));
              if (productos.length === 0) return null;
              return (
                <div key={c.id} className="mb-4">
                  <p className="mb-1 font-etiqueta text-sm font-semibold text-cafe-300">{c.nombre}</p>
                  <ul className="divide-y divide-cafe-100">
                    {productos.map((p) => {
                      const costo = costoProducto(p, mapas.toppings, mapas.insumos);
                      const margen = p.precio > 0 ? (p.precio - costo) / p.precio : 0;
                      const sinReceta = p.receta_items.length === 0;
                      return (
                        <li key={p.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${p.activo ? "" : "opacity-50"}`}>
                          <div>
                            <p className="font-titulo text-xl font-extrabold">{p.nombre}</p>
                            <div className="flex flex-wrap gap-1">
                              {sinReceta && <Insignia tono="peligro">Sin receta: costo desconocido</Insignia>}
                              {!p.activo && <Insignia>Inactivo</Insignia>}
                              {p.tipo === "perro" && (
                                <Insignia>{p.producto_toppings.filter((pt) => mapas.toppings.get(pt.topping_id)?.activo).length} toppings</Insignia>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-5">
                            <div className="text-right">
                              <p className="numeros font-titulo text-2xl font-extrabold text-rojo">{cop(p.precio)}</p>
                              <p className="numeros text-sm text-cafe-700">
                                cuesta {cop(costo)} · deja {cop(p.precio - costo)} ({Math.round(margen * 100)}%)
                              </p>
                            </div>
                            <Boton variante="suave" onClick={() => setProducto(p)} aria-label={`Editar ${p.nombre}`}>
                              <Pencil className="size-4" /> Editar
                            </Boton>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </Tarjeta>

          <Tarjeta>
            <Subtitulo
              accion={
                <Boton onClick={() => setTopping("nuevo")}>
                  <Plus className="size-5" /> Nuevo topping
                </Boton>
              }
            >
              Toppings
            </Subtitulo>
            {data.toppings.filter((t) => verInactivos || t.activo).length === 0 ? (
              <Vacio>No hay toppings.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.toppings
                  .filter((t) => verInactivos || t.activo)
                  .map((t) => {
                    const costo = costoDe(t.topping_insumos, mapas.insumos);
                    const extra = data.productos.flatMap((p) => p.producto_toppings).find((pt) => pt.topping_id === t.id)?.precio_extra ?? 0;
                    return (
                      <li key={t.id} className={`flex flex-wrap items-center justify-between gap-3 py-3 ${t.activo ? "" : "opacity-50"}`}>
                        <div>
                          <p className="font-etiqueta text-lg font-semibold">{t.nombre}</p>
                          <div className="flex flex-wrap gap-1">
                            <Insignia tono={t.es_premium ? "alerta" : "neutro"}>{t.es_premium ? `Adicional +${cop(extra)}` : "Incluido"}</Insignia>
                            {t.grupo && <Insignia>Opción de {t.grupo}</Insignia>}
                            {t.topping_insumos.length === 0 && <Insignia tono="peligro">Sin porción: costo desconocido</Insignia>}
                            {!t.activo && <Insignia>Inactivo</Insignia>}
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <p className="numeros text-right text-sm text-cafe-700">
                            porción cuesta <strong>{cop(costo)}</strong>
                            {t.es_premium && extra > 0 && <> · deja {cop(extra - costo)}</>}
                          </p>
                          <Boton variante="suave" onClick={() => setTopping(t)} aria-label={`Editar ${t.nombre}`}>
                            <Pencil className="size-4" /> Editar
                          </Boton>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Tarjeta>
        </>
      )}

      {data && producto && (
        <ModalProducto
          producto={producto === "nuevo" ? undefined : producto}
          datos={data}
          alCerrar={() => setProducto(null)}
          alGuardar={() => {
            setProducto(null);
            recargar();
          }}
        />
      )}
      {data && topping && (
        <ModalTopping
          topping={topping === "nuevo" ? undefined : topping}
          datos={data}
          alCerrar={() => setTopping(null)}
          alGuardar={() => {
            setTopping(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Producto
// ---------------------------------------------------------------------
interface OfertaTopping {
  ofrecer: boolean;
  incluido: boolean;
  precio_extra: number | null;
}

function ModalProducto({
  producto,
  datos,
  alCerrar,
  alGuardar,
}: {
  producto?: ProductoAdmin;
  datos: Datos;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const [insumos, setInsumos] = useState(datos.insumos);
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [tipo, setTipo] = useState<TipoProducto>(producto?.tipo ?? "perro");
  const [categoria, setCategoria] = useState<number>(
    producto?.categoria_id ?? datos.categorias.find((c) => c.nombre === "Perros")?.id ?? datos.categorias[0]?.id,
  );
  const [precio, setPrecio] = useState<number | null>(producto?.precio ?? null);
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [reventa, setReventa] = useState(false);
  const [costoReventa, setCostoReventa] = useState<number | null>(null);
  const [receta, setReceta] = useState<LineaReceta[]>(
    producto?.receta_items.length ? producto.receta_items.map((r) => nuevaLinea(r.insumo_id, String(r.cantidad))) : [nuevaLinea()],
  );
  const [ofertas, setOfertas] = useState<Record<number, OfertaTopping>>(() => {
    const base: Record<number, OfertaTopping> = {};
    for (const t of datos.toppings.filter((x) => x.activo)) {
      const pt = producto?.producto_toppings.find((x) => x.topping_id === t.id);
      base[t.id] = pt
        ? { ofrecer: true, incluido: pt.incluido_por_defecto, precio_extra: pt.precio_extra }
        : { ofrecer: !producto && tipo === "perro", incluido: !producto && !t.es_premium, precio_extra: t.es_premium ? 2000 : 0 };
    }
    return base;
  });
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const mapaInsumos = new Map(insumos.map((i) => [i.id, i]));
  const costoReceta = reventa ? costoReventa ?? 0 : costoLineas(receta, mapaInsumos);
  const costoToppings =
    tipo === "perro"
      ? datos.toppings
          .filter((t) => ofertas[t.id]?.ofrecer && ofertas[t.id]?.incluido)
          .reduce((s, t) => s + costoDe(t.topping_insumos, mapaInsumos), 0)
      : 0;
  const costo = costoReceta + costoToppings;

  const cambiarTipo = (t: TipoProducto) => {
    setTipo(t);
    const cat = datos.categorias.find((c) => c.nombre === (t === "perro" ? "Perros" : t === "bebida" ? "Bebidas" : ""));
    if (cat) setCategoria(cat.id);
  };

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) return setError("Escribe el nombre.");
    if (precio === null || precio <= 0) return setError("Escribe el precio de venta.");
    let filas: { insumo_id: number; cantidad: number }[] = [];
    if (reventa) {
      if (costoReventa === null) return setError("Escribe cuánto te cuesta comprar cada unidad.");
    } else {
      const v = lineasValidas(receta);
      if (v.error) return setError(v.error);
      filas = v.filas;
    }
    setGuardando(true);
    try {
      if (reventa) {
        const existente = insumos.find((i) => i.nombre.toLowerCase() === nombre.trim().toLowerCase());
        const insumo =
          existente ??
          exigir(
            await db()
              .from("insumos")
              .insert({ nombre: nombre.trim(), unidad: "und", costo_unitario: costoReventa, stock_minimo: 12 })
              .select("*")
              .single<Insumo>(),
          );
        filas = [{ insumo_id: insumo.id, cantidad: 1 }];
      }

      const campos = { nombre: nombre.trim(), tipo, categoria_id: categoria, precio, activo };
      const id = producto
        ? (exigir(await db().from("productos").update(campos).eq("id", producto.id).select("id").single<{ id: number }>())).id
        : (exigir(
            await db()
              .from("productos")
              .insert({ ...campos, orden: datos.productos.filter((p) => p.categoria_id === categoria).length + 1 })
              .select("id")
              .single<{ id: number }>(),
          )).id;

      exigir(await db().from("receta_items").delete().eq("producto_id", id));
      exigir(await db().from("receta_items").insert(filas.map((f) => ({ ...f, producto_id: id }))));

      if (tipo === "perro") {
        exigir(await db().from("producto_toppings").delete().eq("producto_id", id));
        const filasT = Object.entries(ofertas)
          .filter(([, o]) => o.ofrecer)
          .map(([tid, o]) => ({
            producto_id: id,
            topping_id: Number(tid),
            incluido_por_defecto: o.incluido,
            precio_extra: o.precio_extra ?? 0,
          }));
        if (filasT.length) exigir(await db().from("producto_toppings").insert(filasT));
      }
      alGuardar();
    } catch (e) {
      const m = mensajeError(e);
      setError(/duplicate|unique/i.test(m) ? "Ya existe un producto con ese nombre." : m);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho="max-w-3xl"
      titulo={producto ? `Editar ${producto.nombre}` : "Nuevo producto"}
      pie={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="numeros text-sm">
            Cuesta <strong>{cop(costo)}</strong>
            {precio ? (
              <>
                {" "}
                · deja <strong className={precio - costo < 0 ? "text-rojo" : ""}>{cop(precio - costo)}</strong> ({Math.round(((precio - costo) / precio) * 100)}%)
              </>
            ) : null}
          </p>
          <Boton onClick={guardar} cargando={guardando}>
            Guardar producto
          </Boton>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" className="sm:col-span-2">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Perro especial, Jugo natural" />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector value={tipo} onChange={(e) => cambiarTipo(e.target.value as TipoProducto)}>
            <option value="perro">Perro (lleva toppings)</option>
            <option value="bebida">Bebida</option>
            <option value="acompanamiento">Acompañamiento</option>
          </Selector>
        </Campo>
        <Campo etiqueta="Sale en la pestaña">
          <Selector value={categoria} onChange={(e) => setCategoria(Number(e.target.value))}>
            {datos.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Precio de venta">
          <EntradaPesos valor={precio} alCambiar={setPrecio} placeholder="$0" />
        </Campo>
        {producto && (
          <label className="flex items-center gap-3 self-end pb-3 font-etiqueta text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-cafe" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo (se ve en la tablet)
          </label>
        )}
      </div>

      {!producto && tipo !== "perro" && (
        <label className="mt-5 flex items-center gap-3 rounded-2xl bg-crema-200 p-4 font-etiqueta text-sm font-semibold">
          <input type="checkbox" className="size-5 accent-cafe" checked={reventa} onChange={(e) => setReventa(e.target.checked)} />
          Se compra y se vende igual (ej. una gaseosa): el insumo es el mismo producto
        </label>
      )}

      <div className="mt-5">
        {reventa ? (
          <Campo etiqueta="¿Cuánto te cuesta comprar cada unidad?">
            <EntradaPesos valor={costoReventa} alCambiar={setCostoReventa} placeholder="$0" />
          </Campo>
        ) : (
          <EditorReceta
            titulo={tipo === "perro" ? "Base del perro (sin toppings): pan, salchicha, empaque…" : "Receta (qué insumos gasta cada unidad)"}
            lineas={receta}
            alCambiar={setReceta}
            insumos={insumos}
            alCrearInsumo={(i) => setInsumos((xs) => [...xs, i].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
          />
        )}
      </div>

      {tipo === "perro" && (
        <div className="mt-6">
          <p className="mb-2 font-etiqueta text-sm font-semibold text-cafe-700">Toppings que ofrece este perro</p>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                <tr>
                  <th className="px-2 py-1">Topping</th>
                  <th className="px-2 py-1">Lo ofrece</th>
                  <th className="px-2 py-1">Viene marcado</th>
                  <th className="px-2 py-1">Cobra extra</th>
                </tr>
              </thead>
              <tbody>
                {datos.toppings
                  .filter((t) => t.activo)
                  .map((t) => {
                    const o = ofertas[t.id];
                    const set = (c: Partial<OfertaTopping>) => setOfertas((s) => ({ ...s, [t.id]: { ...s[t.id], ...c } }));
                    return (
                      <tr key={t.id} className="border-t border-cafe-100">
                        <td className="px-2 py-2 font-etiqueta font-semibold">{t.nombre}</td>
                        <td className="px-2 py-2">
                          <input type="checkbox" className="size-5 accent-cafe" checked={o.ofrecer} onChange={(e) => set({ ofrecer: e.target.checked })} />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            className="size-5 accent-cafe"
                            disabled={!o.ofrecer}
                            checked={o.incluido}
                            onChange={(e) => set({ incluido: e.target.checked })}
                          />
                        </td>
                        <td className="w-36 px-2 py-2">
                          <EntradaPesos valor={o.precio_extra} alCambiar={(v) => set({ precio_extra: v })} disabled={!o.ofrecer} className="h-10" />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------
// Topping
// ---------------------------------------------------------------------
function ModalTopping({
  topping,
  datos,
  alCerrar,
  alGuardar,
}: {
  topping?: ToppingAdmin;
  datos: Datos;
  alCerrar: () => void;
  alGuardar: () => void;
}) {
  const perros = datos.productos.filter((p) => p.tipo === "perro" && p.activo);
  const precioActual = datos.productos.flatMap((p) => p.producto_toppings).find((pt) => pt.topping_id === topping?.id)?.precio_extra;
  const [insumos, setInsumos] = useState(datos.insumos);
  const [nombre, setNombre] = useState(topping?.nombre ?? "");
  const [adicional, setAdicional] = useState(topping?.es_premium ?? true);
  const [precioExtra, setPrecioExtra] = useState<number | null>(precioActual ?? 2000);
  const [grupo, setGrupo] = useState(topping?.grupo ?? "");
  const [activo, setActivo] = useState(topping?.activo ?? true);
  const [porcion, setPorcion] = useState<LineaReceta[]>(
    topping?.topping_insumos.length ? topping.topping_insumos.map((r) => nuevaLinea(r.insumo_id, String(r.cantidad))) : [nuevaLinea()],
  );
  const [enPerros, setEnPerros] = useState<Set<number>>(
    () =>
      new Set(
        topping ? perros.filter((p) => p.producto_toppings.some((pt) => pt.topping_id === topping.id)).map((p) => p.id) : perros.map((p) => p.id),
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const costo = costoLineas(porcion, new Map(insumos.map((i) => [i.id, i])));
  const grupos = [...new Set(datos.toppings.map((t) => t.grupo).filter(Boolean) as string[])];

  const guardar = async () => {
    setError(null);
    if (!nombre.trim()) return setError("Escribe el nombre.");
    if (adicional && (precioExtra === null || precioExtra <= 0)) return setError("Escribe cuánto se cobra de más.");
    const v = lineasValidas(porcion);
    if (v.error) return setError(v.error);
    setGuardando(true);
    try {
      const campos = { nombre: nombre.trim(), es_premium: adicional, grupo: grupo.trim() || null, activo };
      const id = topping
        ? (exigir(await db().from("toppings").update(campos).eq("id", topping.id).select("id").single<{ id: number }>())).id
        : (exigir(
            await db()
              .from("toppings")
              .insert({ ...campos, orden: Math.max(0, ...datos.toppings.map((t) => t.orden)) + 1 })
              .select("id")
              .single<{ id: number }>(),
          )).id;

      exigir(await db().from("topping_insumos").delete().eq("topping_id", id));
      exigir(await db().from("topping_insumos").insert(v.filas.map((f) => ({ ...f, topping_id: id }))));

      for (const p of perros) {
        const existente = p.producto_toppings.find((pt) => pt.topping_id === id);
        if (enPerros.has(p.id)) {
          exigir(
            await db()
              .from("producto_toppings")
              .upsert({
                producto_id: p.id,
                topping_id: id,
                incluido_por_defecto: existente ? existente.incluido_por_defecto && !adicional : !adicional,
                precio_extra: adicional ? precioExtra ?? 0 : 0,
              }),
          );
        } else if (existente) {
          exigir(await db().from("producto_toppings").delete().eq("producto_id", p.id).eq("topping_id", id));
        }
      }
      alGuardar();
    } catch (e) {
      const m = mensajeError(e);
      setError(/duplicate|unique/i.test(m) ? "Ya existe un topping con ese nombre." : m);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      ancho="max-w-2xl"
      titulo={topping ? `Editar ${topping.nombre}` : "Nuevo topping"}
      pie={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="numeros text-sm">
            La porción cuesta <strong>{cop(costo)}</strong>
            {adicional && precioExtra ? (
              <>
                {" "}
                · deja <strong className={precioExtra - costo < 0 ? "text-rojo" : ""}>{cop(precioExtra - costo)}</strong>
              </>
            ) : null}
          </p>
          <Boton onClick={guardar} cargando={guardando}>
            Guardar topping
          </Boton>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Nombre" className="sm:col-span-2">
          <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Maíz tierno" />
        </Campo>
        <div className="sm:col-span-2">
          <p className="mb-1 font-etiqueta text-sm font-semibold text-cafe-700">¿Cómo se vende?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAdicional(false)}
              className={`min-h-14 rounded-2xl font-etiqueta text-sm font-semibold ${!adicional ? "bg-cafe text-crema" : "ring-2 ring-cafe-100"}`}
            >
              Incluido en el precio
            </button>
            <button
              onClick={() => setAdicional(true)}
              className={`min-h-14 rounded-2xl font-etiqueta text-sm font-semibold ${adicional ? "bg-cafe text-crema" : "ring-2 ring-cafe-100"}`}
            >
              Adicional con costo
            </button>
          </div>
        </div>
        {adicional && (
          <Campo etiqueta="Se cobra de más">
            <EntradaPesos valor={precioExtra} alCambiar={setPrecioExtra} />
          </Campo>
        )}
        <Campo etiqueta="Grupo de opciones (opcional)" ayuda="Si el cliente elige solo una, ej. “Papa”: ripio o hojuela.">
          <Entrada list="grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)} />
          <datalist id="grupos">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Campo>
        {topping && (
          <label className="flex items-center gap-3 self-end pb-3 font-etiqueta text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-cafe" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activo
          </label>
        )}
      </div>

      <div className="mt-5">
        <EditorReceta
          titulo="Porción: qué gasta cada vez que se pone"
          lineas={porcion}
          alCambiar={setPorcion}
          insumos={insumos}
          alCrearInsumo={(i) => setInsumos((xs) => [...xs, i].sort((a, b) => a.nombre.localeCompare(b.nombre)))}
        />
      </div>

      {perros.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-etiqueta text-sm font-semibold text-cafe-700">Se ofrece en</p>
          <div className="flex flex-wrap gap-2">
            {perros.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-2 rounded-xl px-3 ring-2 ring-cafe-100">
                <input
                  type="checkbox"
                  className="size-5 accent-cafe"
                  checked={enPerros.has(p.id)}
                  onChange={() =>
                    setEnPerros((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    })
                  }
                />
                <span className="font-etiqueta text-sm font-semibold">{p.nombre}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}
