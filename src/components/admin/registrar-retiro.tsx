"use client";

import { Link2, Receipt, ShoppingCart, UserRound, Ban } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { db, fechaCorta } from "@/lib/admin";
import { cop } from "@/lib/formato";
import { Boton, Campo, Entrada, EntradaPesos, exigir, Insignia, mensajeError, MensajeError, Selector } from "./ui";

export interface RetiroCaja {
  id: string;
  monto: number;
  tercero: string;
  motivo: string | null;
  creado_en: string;
}

interface Candidato {
  tipo: "compra" | "gasto" | "pago";
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  pagado_con: string | null;
  otro_retiro: boolean;
}

type Opcion = "compra" | "gasto" | "pago" | "ya" | "no";

const OPCIONES: { id: Opcion; nombre: string; icono: typeof Receipt }[] = [
  { id: "compra", nombre: "Compra de insumos", icono: ShoppingCart },
  { id: "gasto", nombre: "Otro gasto", icono: Receipt },
  { id: "pago", nombre: "Vale o préstamo", icono: UserRound },
  { id: "ya", nombre: "Ya lo registré", icono: Link2 },
  { id: "no", nombre: "No es un gasto", icono: Ban },
];

/** Clasificar un retiro de caja: queda como compra, gasto o vale usando ese mismo retiro (sin duplicar el efectivo). */
export function ModalRegistrarRetiro({ retiro, alCerrar, alGuardar }: { retiro: RetiroCaja; alCerrar: () => void; alGuardar: (texto: string) => void }) {
  const [opcion, setOpcion] = useState<Opcion | null>(null);
  const [categorias, setCategorias] = useState<{ id: number; nombre: string }[]>([]);
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState(retiro.motivo ?? "");
  const [monto, setMonto] = useState<number | null>(retiro.monto);
  const [tipoPago, setTipoPago] = useState<"vale" | "prestamo">("vale");
  const [persona, setPersona] = useState(retiro.tercero);
  const [motivo, setMotivo] = useState("");
  const [candidatos, setCandidatos] = useState<Candidato[] | null>(null);
  const [elegido, setElegido] = useState<Candidato | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (opcion === "gasto" && categorias.length === 0) {
      void db()
        .from("categorias_gasto")
        .select("id, nombre")
        .order("nombre")
        .then((r) => setCategorias((r.data ?? []).filter((c) => !["Insumos", "Nómina", "Cuota recuperación a socios"].includes(c.nombre))));
    }
    if (opcion === "ya" && candidatos === null) {
      void db()
        .rpc("candidatos_retiro", { p_retiro_id: retiro.id })
        .then((r) => setCandidatos((r.data ?? []) as Candidato[]));
    }
  }, [opcion, categorias.length, candidatos, retiro.id]);

  const guardar = async () => {
    setError(null);
    setGuardando(true);
    try {
      if (opcion === "gasto") {
        if (!categoria) throw new Error("Elige la categoría del gasto.");
        exigir(
          await db().rpc("registrar_gasto_de_retiro", {
            p_retiro_id: retiro.id,
            p_categoria_id: Number(categoria),
            p_descripcion: descripcion,
            p_monto: monto,
          }),
        );
        alGuardar(`Retiro de ${cop(retiro.monto)} registrado como gasto.`);
      } else if (opcion === "pago") {
        if (!persona.trim()) throw new Error("Escribe a quién se le dio la plata.");
        exigir(
          await db().rpc("registrar_pago_de_retiro", {
            p_retiro_id: retiro.id,
            p: { tipo: tipoPago, persona: persona.trim(), monto, nota: descripcion || null },
          }),
        );
        alGuardar(`Retiro de ${cop(retiro.monto)} registrado como ${tipoPago === "vale" ? "vale" : "préstamo"} de ${persona.trim()}.`);
      } else if (opcion === "ya") {
        if (!elegido) throw new Error("Elige cuál registro es.");
        exigir(await db().rpc("vincular_retiro", { p_retiro_id: retiro.id, p_tipo: elegido.tipo, p_id: elegido.id }));
        alGuardar(
          elegido.otro_retiro
            ? `Unido con “${elegido.descripcion}”. El retiro repetido se anuló y su cierre se recalculó.`
            : `Unido con “${elegido.descripcion}”.`,
        );
      } else if (opcion === "no") {
        exigir(await db().rpc("marcar_retiro_sin_gasto", { p_retiro_id: retiro.id, p_motivo: motivo }));
        alGuardar("Retiro marcado como que no es gasto.");
      }
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      abierto
      alCerrar={alCerrar}
      titulo="¿En qué se usó este retiro?"
      pie={
        opcion && opcion !== "compra" ? (
          <Boton onClick={guardar} cargando={guardando} className="w-full">
            Guardar
          </Boton>
        ) : undefined
      }
    >
      <div className="rounded-2xl bg-crema-200 p-4">
        <p className="numeros font-titulo text-2xl font-extrabold">{cop(retiro.monto)}</p>
        <p className="text-sm text-cafe-700">
          {fechaCorta(retiro.creado_en)} · {retiro.tercero}
          {retiro.motivo && ` · ${retiro.motivo}`}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {OPCIONES.map((o) => (
          <button
            key={o.id}
            onClick={() => setOpcion(o.id)}
            className={`flex min-h-12 items-center gap-2 rounded-xl px-3 text-left font-etiqueta text-sm font-semibold ${
              opcion === o.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
            }`}
          >
            <o.icono className="size-5 shrink-0" /> {o.nombre}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {opcion === "compra" && (
          <div className="space-y-3">
            <p className="text-sm text-cafe-700">
              Se abre Compras con este retiro: eliges los insumos (o tomas la foto de la factura) y queda pagada con este efectivo, sin
              descontarlo otra vez de la caja.
            </p>
            <Link
              href={`/panel/compras?retiro=${retiro.id}`}
              className="flex min-h-12 items-center justify-center rounded-2xl bg-rojo px-5 font-etiqueta font-extrabold text-crema"
            >
              Registrar la compra
            </Link>
          </div>
        )}

        {opcion === "gasto" && (
          <>
            <Campo etiqueta="Categoría">
              <Selector value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Elige…</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="¿Qué se compró o pagó?">
              <Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Bolsas de basura y jabón" />
            </Campo>
            <Campo etiqueta="Valor" ayuda="Si sobró plata y se devolvió a la caja, pon solo lo que se gastó.">
              <EntradaPesos valor={monto} alCambiar={setMonto} />
            </Campo>
          </>
        )}

        {opcion === "pago" && (
          <>
            <div className="flex gap-2">
              {(["vale", "prestamo"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTipoPago(t)}
                  className={`min-h-11 rounded-xl px-4 font-etiqueta text-sm font-semibold ${
                    tipoPago === t ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                  }`}
                >
                  {t === "vale" ? "Vale (adelanto de sueldo)" : "Préstamo"}
                </button>
              ))}
            </div>
            <Campo etiqueta="¿A quién?">
              <Entrada value={persona} onChange={(e) => setPersona(e.target.value)} />
            </Campo>
            <Campo etiqueta="Valor">
              <EntradaPesos valor={monto} alCambiar={setMonto} />
            </Campo>
            <p className="text-sm text-cafe-700">Queda en Nómina y préstamos{tipoPago === "vale" ? " y se descuenta en la próxima nómina" : ""}.</p>
          </>
        )}

        {opcion === "ya" && (
          <div className="space-y-2">
            <p className="text-sm text-cafe-700">Registros de esos días que podrían ser este mismo retiro. Elige el que corresponde:</p>
            {candidatos === null ? (
              <p className="text-sm text-cafe-300">Buscando…</p>
            ) : candidatos.length === 0 ? (
              <p className="text-sm text-cafe-700">No hay compras, gastos ni pagos cercanos sin retiro. Usa otra opción.</p>
            ) : (
              candidatos.map((c) => (
                <button
                  key={`${c.tipo}${c.id}`}
                  onClick={() => setElegido(c)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${
                    elegido?.id === c.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-etiqueta text-sm font-semibold">{c.descripcion}</span>
                    <span className="text-xs opacity-80">
                      {fechaCorta(c.fecha)}
                      {c.otro_retiro && " · ya había descontado su propio retiro de la caja (se anula el repetido)"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {c.monto === retiro.monto && <Insignia tono="ok">Mismo valor</Insignia>}
                    <span className="numeros font-bold">{cop(c.monto)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        {opcion === "no" && (
          <Campo etiqueta="¿Qué se hizo con la plata?">
            <Entrada value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Se le entregó a Jhon para consignar" />
          </Campo>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Modal>
  );
}
