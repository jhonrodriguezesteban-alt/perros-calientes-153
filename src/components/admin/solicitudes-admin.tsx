"use client";

import { ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { db, fechaCorta, type Solicitud } from "@/lib/admin";
import { cantidadInsumo, horaBogota } from "@/lib/formato";
import { Boton, Cargando, Encabezado, Entrada, exigir, Insignia, mensajeError, MensajeError, Subtitulo, Tarjeta, useDatos, Vacio } from "./ui";

const CAMPOS =
  "id, insumo_id, descripcion, cantidad, unidad, nota, estado, creado_en, atendido_en, respuesta, solicitante:perfiles!solicitado_por(nombre)";

async function cargarSolicitudes() {
  const [pendientes, atendidas] = await Promise.all([
    db().from("solicitudes_pedido").select(CAMPOS).eq("estado", "pendiente").order("creado_en").returns<Solicitud[]>(),
    db()
      .from("solicitudes_pedido")
      .select(CAMPOS)
      .neq("estado", "pendiente")
      .order("atendido_en", { ascending: false })
      .limit(30)
      .returns<Solicitud[]>(),
  ]);
  return { pendientes: exigir(pendientes), atendidas: exigir(atendidas) };
}

export function SolicitudesAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarSolicitudes);
  const [descartando, setDescartando] = useState<string | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  // En vivo: cuando Andrea pide algo, aparece aquí sin recargar.
  useEffect(() => {
    const supabase = db();
    const canal = supabase
      .channel("admin-solicitudes")
      .on("postgres_changes", { event: "*", schema: "public", table: "solicitudes_pedido" }, recargar)
      .subscribe();
    return () => {
      void supabase.removeChannel(canal);
    };
  }, [recargar]);

  const descartar = async (id: string) => {
    setErrorAccion(null);
    try {
      const { data: u } = await db().auth.getUser();
      exigir(
        await db()
          .from("solicitudes_pedido")
          .update({ estado: "descartada", respuesta: respuesta.trim() || null, atendido_en: new Date().toISOString(), atendido_por: u.user?.id })
          .eq("id", id),
      );
      setDescartando(null);
      setRespuesta("");
      recargar();
    } catch (e) {
      setErrorAccion(mensajeError(e));
    }
  };

  return (
    <div className="space-y-6">
      <Encabezado titulo="Solicitudes" descripcion="Lo que Andrea pide desde la tablet. Cómpralo o descártalo; ella ve la respuesta." />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}
      {errorAccion && <MensajeError>{errorAccion}</MensajeError>}

      {data && (
        <>
          <Tarjeta>
            <Subtitulo>Pendientes</Subtitulo>
            {data.pendientes.length === 0 ? (
              <Vacio>No hay solicitudes pendientes. Todo en orden.</Vacio>
            ) : (
              <ul className="space-y-3">
                {data.pendientes.map((s) => (
                  <li key={s.id} className="rounded-2xl bg-mostaza-100/50 p-4 ring-2 ring-mostaza">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-titulo text-2xl font-extrabold leading-tight">
                          {s.descripcion}
                          {s.cantidad && s.unidad && (
                            <span className="numeros text-cafe-700"> · {cantidadInsumo(s.cantidad, s.unidad)}</span>
                          )}
                        </p>
                        <p className="text-sm text-cafe-700">
                          {s.solicitante?.nombre ?? "Alguien"} · {fechaCorta(s.creado_en)} {horaBogota(s.creado_en)}
                        </p>
                        {s.nota && <p className="mt-1">“{s.nota}”</p>}
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/panel/compras?solicitud=${s.id}`}
                          className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-rojo px-5 font-etiqueta font-extrabold text-white active:bg-rojo-700"
                        >
                          <ShoppingCart className="size-5" /> Registrar compra
                        </Link>
                        <Boton variante="suave" onClick={() => setDescartando(descartando === s.id ? null : s.id)}>
                          <X className="size-5" /> Descartar
                        </Boton>
                      </div>
                    </div>
                    {descartando === s.id && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Entrada
                          value={respuesta}
                          onChange={(e) => setRespuesta(e.target.value)}
                          placeholder="Motivo para Andrea (opcional): ya hay, llega mañana…"
                          className="min-w-64 flex-1"
                        />
                        <Boton variante="peligro" onClick={() => descartar(s.id)}>
                          Confirmar descarte
                        </Boton>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>

          <Tarjeta>
            <Subtitulo>Atendidas recientemente</Subtitulo>
            {data.atendidas.length === 0 ? (
              <Vacio>Aún no hay solicitudes atendidas.</Vacio>
            ) : (
              <ul className="divide-y divide-cafe-100">
                {data.atendidas.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                    <span>
                      <span className="font-etiqueta font-semibold">{s.descripcion}</span>
                      {s.cantidad && s.unidad && <span className="text-cafe-700"> · {cantidadInsumo(s.cantidad, s.unidad)}</span>}
                      {s.respuesta && <span className="text-cafe-300"> · {s.respuesta}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <Insignia tono={s.estado === "comprada" ? "ok" : "neutro"}>{s.estado === "comprada" ? "Comprada" : "Descartada"}</Insignia>
                      {s.atendido_en && <span className="text-sm text-cafe-300">{fechaCorta(s.atendido_en)}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        </>
      )}
    </div>
  );
}
