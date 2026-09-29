"use client";

import { ArrowLeft, Banknote, Flag, Loader2, Store, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { ResumenCierre } from "@/components/resumen-cierre";
import { cop, horaBogota } from "@/lib/formato";
import { supabaseNavegador } from "@/lib/supabase/client";
import type { ResumenDia, RetiroCaja, Turno } from "@/lib/tipos";

export type Vista = "inicio" | "abrir" | "retiro" | "finalizar" | "base";

const MOTIVOS = ["Entrega a socio", "Pago a proveedor", "Compra de insumos", "Pago a empleada"];

async function obtenerRetiros() {
  const { data, error } = await supabaseNavegador().rpc("retiros_de_hoy");
  return error ? null : (data as RetiroCaja[]);
}

const mensajeDe = (error: { code?: string; message: string }) => (error.code ? error.message : "Sin conexión. Intenta de nuevo.");

/** Caja del día: abrir con base, retiros de efectivo y finalizar día con cuadre. */
export function ModalCaja({
  turno,
  pendientes,
  vistaInicial = "inicio",
  esSocio = false,
  alCerrar,
  alCambiar,
}: {
  turno: Turno | null;
  pendientes: number;
  /** Para abrir directo en "Abrir día" o "Finalizar día". */
  vistaInicial?: Vista;
  /** Los socios reciben un aviso antes de abrir la caja en nombre de la empleada. */
  esSocio?: boolean;
  alCerrar: () => void;
  alCambiar: (mensaje: string, detalle?: string) => void;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [retiros, setRetiros] = useState<RetiroCaja[] | null>(null);
  const [resumen, setResumen] = useState<ResumenDia | null>(null);

  const recargar = useCallback(() => void obtenerRetiros().then((r) => r && setRetiros(r)), []);
  useEffect(() => {
    let activo = true;
    void obtenerRetiros().then((r) => activo && r && setRetiros(r));
    return () => {
      activo = false;
    };
  }, []);

  if (resumen) {
    return (
      <Modal abierto alCerrar={alCerrar} titulo="Cierre de caja" ancho="max-w-2xl">
        <p className="mb-4 rounded-2xl bg-mostaza-100 px-4 py-3 font-semibold ring-2 ring-mostaza">
          Día finalizado. Envía este cierre por WhatsApp a los socios.
        </p>
        <ResumenCierre resumen={resumen} compartir />
      </Modal>
    );
  }

  if (vista === "abrir") {
    return (
      <FormAbrir
        esSocio={esSocio}
        alVolver={() => setVista("inicio")}
        alListo={(m) => {
          alCambiar(m);
          alCerrar();
        }}
      />
    );
  }
  if (vista === "retiro") {
    return (
      <FormRetiro
        alVolver={() => setVista("inicio")}
        alListo={(m, d) => {
          alCambiar(m, d);
          recargar();
          setVista("inicio");
        }}
      />
    );
  }
  if (vista === "base" && turno) {
    return (
      <FormBase
        turno={turno}
        alVolver={() => setVista("inicio")}
        alListo={(m) => {
          alCambiar(m);
          alCerrar();
        }}
      />
    );
  }
  if (vista === "finalizar") {
    return (
      <FormFinalizar
        pendientes={pendientes}
        alVolver={() => setVista("inicio")}
        alListo={(r) => {
          setResumen(r);
          alCambiar("Día finalizado");
        }}
      />
    );
  }

  const totalRetiros = (retiros ?? []).reduce((s, r) => s + r.monto, 0);

  return (
    <Modal abierto alCerrar={alCerrar} titulo="Caja">
      <p className="mb-4 text-cafe-700">
        {turno
          ? `Día abierto a las ${horaBogota(turno.abierto_en)} por ${turno.abierto_por} con base de ${cop(turno.base_inicial)}.`
          : "Todavía no has abierto el día. Si arrancaste con plata en la caja, ábrelo con la base."}
        {turno && (
          <button onClick={() => setVista("base")} className="ml-2 font-etiqueta font-semibold text-cafe underline underline-offset-4">
            Corregir apertura
          </button>
        )}
      </p>

      <div className="grid gap-3">
        {!turno && (
          <BotonGrande onClick={() => setVista("abrir")} Icono={Store} suave>
            Abrir día con base
          </BotonGrande>
        )}
        <BotonGrande onClick={() => setVista("retiro")} Icono={Banknote} suave>
          Retirar efectivo
        </BotonGrande>
        <BotonGrande onClick={() => setVista("finalizar")} Icono={Flag}>
          Finalizar día
        </BotonGrande>
      </div>

      {retiros && retiros.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-etiqueta font-semibold uppercase tracking-wide text-cafe-700">Retiros de hoy</h3>
            <span className="numeros font-titulo text-xl font-extrabold">{cop(totalRetiros)}</span>
          </div>
          <ul className="space-y-2">
            {retiros.map((r) => (
              <FilaRetiro key={r.id} retiro={r} alAnular={recargar} />
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}

function FilaRetiro({ retiro: r, alAnular }: { retiro: RetiroCaja; alAnular: () => void }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anular = async () => {
    if (!confirm(`¿Anular el retiro de ${cop(r.monto)} a nombre de ${r.tercero}?`)) return;
    setGuardando(true);
    const { error } = await supabaseNavegador().rpc("anular_retiro", { p_retiro_id: r.id });
    setGuardando(false);
    if (error) setError(mensajeDe(error));
    else alAnular();
  };
  return (
    <li className="rounded-2xl bg-crema-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-etiqueta font-semibold">
            {r.tercero} · {horaBogota(r.creado_en)}
          </p>
          <p className="truncate text-sm text-cafe-700">
            {r.motivo ?? "Sin motivo"} · registró {r.registrado_por}
          </p>
        </div>
        <span className="numeros font-titulo text-xl font-bold">{cop(r.monto)}</span>
        {r.puede_anular && (
          <button onClick={anular} disabled={guardando} aria-label="Anular retiro" className="rounded-full p-2 text-rojo active:bg-rojo/10">
            {guardando ? <Loader2 className="size-5 animate-spin" /> : <Trash2 className="size-5" />}
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-sm font-semibold text-rojo">{error}</p>}
    </li>
  );
}

function FormBase({ turno, alVolver, alListo }: { turno: Turno; alVolver: () => void; alListo: (mensaje: string) => void }) {
  const [base, setBase] = useState<number | null>(turno.base_inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ejecutar = async (accion: "corregir" | "deshacer") => {
    if (accion === "deshacer" && !confirm("¿Deshacer la apertura? La caja queda cerrada para que la abran de nuevo.")) return;
    setGuardando(true);
    setError(null);
    const supabase = supabaseNavegador();
    const { error } =
      accion === "corregir" ? await supabase.rpc("corregir_base", { p_base: base ?? 0 }) : await supabase.rpc("deshacer_apertura");
    setGuardando(false);
    if (error) setError(mensajeDe(error));
    else alListo(accion === "corregir" ? `Base corregida: ${cop(base ?? 0)}` : "Apertura deshecha. La caja quedó cerrada.");
  };

  return (
    <Modal
      abierto
      alCerrar={alVolver}
      titulo="Corregir apertura"
      pie={
        <BotonConfirmar onClick={() => void ejecutar("corregir")} disabled={guardando || base === null} guardando={guardando}>
          Guardar base
        </BotonConfirmar>
      }
    >
      <Volver onClick={alVolver} />
      <p className="mb-4 text-cafe-700">
        Abierta a las {horaBogota(turno.abierto_en)} por {turno.abierto_por} con base de {cop(turno.base_inicial)}.
      </p>
      <EntradaDinero etiqueta="¿Cuál es la base real con la que arrancó la caja?" valor={base} alCambiar={setBase} autoFocus />
      <div className="mt-6 rounded-2xl p-4 ring-2 ring-cafe-100">
        <p className="text-sm text-cafe-700">
          ¿La abrieron por error? Si todavía no hay ventas ni retiros, se puede deshacer para que la abra quien va a atender.
        </p>
        <button
          onClick={() => void ejecutar("deshacer")}
          disabled={guardando}
          className="mt-3 rounded-xl px-4 py-2 font-etiqueta font-semibold text-rojo ring-2 ring-rojo active:bg-rojo/10"
        >
          Deshacer apertura
        </button>
      </div>
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function FormAbrir({
  esSocio,
  alVolver,
  alListo,
}: {
  esSocio: boolean;
  alVolver: () => void;
  alListo: (mensaje: string) => void;
}) {
  const [base, setBase] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState<{ cerrado_en: string; efectivo_contado: number; cerrado_por: string | null } | null>(null);

  // Con cuánto quedó la caja en el último cierre: es con lo que debería arrancar hoy.
  useEffect(() => {
    let activo = true;
    void supabaseNavegador()
      .rpc("ultimo_cierre_caja")
      .then(({ data }) => {
        const u = (data as { cerrado_en: string; efectivo_contado: number; cerrado_por: string | null }[] | null)?.[0];
        if (activo && u) setUltimo(u);
      });
    return () => {
      activo = false;
    };
  }, []);
  const diferencia = ultimo && base !== null ? base - ultimo.efectivo_contado : null;

  const abrir = async () => {
    setGuardando(true);
    const { error } = await supabaseNavegador().rpc("abrir_turno", { p_base_inicial: base ?? 0 });
    setGuardando(false);
    if (error) setError(mensajeDe(error));
    else alListo("Día abierto. ¡A vender con cariño!");
  };
  return (
    <Modal
      abierto
      alCerrar={alVolver}
      titulo="Abrir día"
      pie={
        <BotonConfirmar onClick={abrir} disabled={guardando || base === null} guardando={guardando}>
          Abrir día
        </BotonConfirmar>
      }
    >
      <Volver onClick={alVolver} />
      {esSocio && (
        <p className="mb-4 rounded-2xl bg-mostaza-100 px-4 py-3 text-sm font-semibold ring-2 ring-mostaza">
          Vas a abrir la caja como socio. Si Andrea va a atender hoy, mejor que la abra ella desde la tablet con la base que recibe.
        </p>
      )}
      {ultimo && (
        <div className="mb-5 rounded-2xl bg-cafe p-4 text-crema">
          <p className="font-etiqueta text-sm font-semibold text-cafe-300">
            Caja actual según el último cierre ({fechaHora.format(new Date(ultimo.cerrado_en))}
            {ultimo.cerrado_por ? ` · ${ultimo.cerrado_por}` : ""})
          </p>
          <p className="numeros font-titulo text-4xl font-extrabold text-mostaza">{cop(ultimo.efectivo_contado)}</p>
          <button
            onClick={() => setBase(ultimo.efectivo_contado)}
            className="mt-2 rounded-xl bg-crema px-4 py-2 font-etiqueta text-sm font-extrabold text-cafe active:bg-mostaza"
          >
            Conté y está completo: usar {cop(ultimo.efectivo_contado)}
          </button>
        </div>
      )}
      <EntradaDinero etiqueta="Cuenta la caja: ¿con cuánto efectivo arrancas? (base)" valor={base} alCambiar={setBase} autoFocus />
      {diferencia !== null && diferencia !== 0 && (
        <p className="mt-3 rounded-2xl bg-mostaza-100 px-4 py-3 text-sm font-semibold ring-2 ring-mostaza">
          {diferencia < 0 ? `Hay ${cop(-diferencia)} menos` : `Hay ${cop(diferencia)} más`} que en el último cierre. Si sacaron o
          metieron plata, avísale a los socios.
        </p>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

const fechaHora = new Intl.DateTimeFormat("es-CO", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Bogota",
});

function FormRetiro({ alVolver, alListo }: { alVolver: () => void; alListo: (mensaje: string, detalle?: string) => void }) {
  const [monto, setMonto] = useState<number | null>(null);
  const [tercero, setTercero] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listo = !!monto && tercero.trim() !== "";

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    const { error } = await supabaseNavegador().rpc("registrar_retiro", {
      p_monto: monto,
      p_tercero: tercero.trim(),
      p_motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (error) setError(mensajeDe(error));
    else alListo(`Retiro de ${cop(monto!)} registrado`, `A nombre de ${tercero.trim()}`);
  };

  return (
    <Modal
      abierto
      alCerrar={alVolver}
      titulo="Retirar efectivo"
      pie={
        <BotonConfirmar onClick={guardar} disabled={guardando || !listo} guardando={guardando}>
          {monto ? `Sacar ${cop(monto)} de la caja` : "Registrar retiro"}
        </BotonConfirmar>
      }
    >
      <Volver onClick={alVolver} />
      <EntradaDinero etiqueta="¿Cuánto efectivo sale?" valor={monto} alCambiar={setMonto} autoFocus />
      <label htmlFor="retiro-tercero" className="mb-2 mt-5 block font-etiqueta font-semibold">
        ¿A nombre de quién?
      </label>
      <input
        id="retiro-tercero"
        value={tercero}
        onChange={(e) => setTercero(e.target.value)}
        placeholder="Ej. Jhon, proveedor de gaseosas…"
        autoComplete="off"
        className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
      />
      <p className="mb-2 mt-5 font-etiqueta font-semibold">¿Para qué? (opcional)</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            onClick={() => setMotivo(m)}
            className={`min-h-12 rounded-xl px-4 font-etiqueta text-sm font-semibold ${
              motivo === m ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="U otro motivo…"
        className="h-12 w-full rounded-2xl bg-crema px-4 ring-2 ring-cafe-100 outline-none focus:ring-cafe"
      />
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function FormFinalizar({
  pendientes,
  alVolver,
  alListo,
}: {
  pendientes: number;
  alVolver: () => void;
  alListo: (resumen: ResumenDia) => void;
}) {
  const [efectivo, setEfectivo] = useState<number | null>(null);
  const [bold, setBold] = useState<number | null>(null);
  const [nequi, setNequi] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bloqueado = pendientes > 0;

  const finalizar = async () => {
    if (!confirm("¿Finalizar el día? Después no se puede reabrir este cierre.")) return;
    setGuardando(true);
    setError(null);
    const { data, error } = await supabaseNavegador().rpc("finalizar_dia", {
      p_efectivo_contado: efectivo,
      p_bold_declarado: bold ?? 0,
      p_nequi_declarado: nequi ?? 0,
      p_notas: notas.trim() || null,
    });
    setGuardando(false);
    if (error) setError(mensajeDe(error));
    else alListo(data as ResumenDia);
  };

  return (
    <Modal
      abierto
      alCerrar={alVolver}
      titulo="Finalizar día"
      pie={
        <BotonConfirmar onClick={finalizar} disabled={guardando || bloqueado || efectivo === null} guardando={guardando}>
          Finalizar y ver cuadre
        </BotonConfirmar>
      }
    >
      <Volver onClick={alVolver} />
      {bloqueado ? (
        <p className="rounded-2xl bg-mostaza-100 p-4 font-semibold ring-2 ring-mostaza">
          Hay {pendientes} {pendientes === 1 ? "venta" : "ventas"} sin enviar. Espera a tener internet para finalizar, así el cuadre
          queda completo.
        </p>
      ) : (
        <div className="space-y-5">
          <EntradaDinero etiqueta="¿Cuánto efectivo hay en la caja? (cuenta billetes y monedas)" valor={efectivo} alCambiar={setEfectivo} autoFocus />
          <div className="grid gap-4 sm:grid-cols-2">
            <EntradaDinero etiqueta="¿Cuánto entró por Bold hoy?" valor={bold} alCambiar={setBold} pequeno />
            <EntradaDinero etiqueta="¿Cuánto entró por Nequi hoy?" valor={nequi} alCambiar={setNequi} pequeno />
          </div>
          <p className="text-sm text-cafe-700">Mira el total del día en la app de Bold y en Nequi. Si no hubo, déjalo vacío.</p>
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas (opcional)"
            className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
          />
        </div>
      )}
      {error && <p className="mt-3 font-semibold text-rojo">{error}</p>}
    </Modal>
  );
}

function EntradaDinero({
  etiqueta,
  valor,
  alCambiar,
  autoFocus,
  pequeno,
}: {
  etiqueta: string;
  valor: number | null;
  alCambiar: (v: number | null) => void;
  autoFocus?: boolean;
  pequeno?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block font-etiqueta font-semibold">{etiqueta}</span>
      <input
        inputMode="numeric"
        autoFocus={autoFocus}
        value={valor === null ? "" : cop(valor)}
        onChange={(e) => {
          const d = e.target.value.replace(/\D/g, "");
          alCambiar(d === "" ? null : Number(d));
        }}
        placeholder="$0"
        className={`numeros w-full rounded-2xl bg-crema px-5 font-titulo font-extrabold ring-2 ring-cafe-100 outline-none focus:ring-cafe ${
          pequeno ? "h-16 text-3xl" : "h-20 text-4xl"
        }`}
      />
    </label>
  );
}

function BotonGrande({
  children,
  onClick,
  Icono,
  suave,
}: {
  children: React.ReactNode;
  onClick: () => void;
  Icono: typeof Flag;
  suave?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-16 items-center justify-center gap-3 rounded-2xl font-etiqueta text-xl font-extrabold ${
        suave ? "text-cafe ring-2 ring-cafe-100 active:bg-cafe-100" : "bg-rojo text-white active:bg-rojo-700"
      }`}
    >
      <Icono className="size-6" /> {children}
    </button>
  );
}

function BotonConfirmar({
  children,
  onClick,
  disabled,
  guardando,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  guardando: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-xl font-extrabold text-white active:bg-rojo-700 disabled:bg-cafe-300"
    >
      {guardando && <Loader2 className="size-6 animate-spin" />}
      {children}
    </button>
  );
}

function Volver({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-4 flex items-center gap-2 font-etiqueta font-semibold text-cafe-700">
      <ArrowLeft className="size-5" /> Volver
    </button>
  );
}
