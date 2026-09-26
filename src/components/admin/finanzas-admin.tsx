"use client";

import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { CuentasPorCobrar } from "@/components/cuentas-por-cobrar";
import { db, fechaCorta, hoyBogota, mesLargo, type CategoriaGasto, type Gasto, type ResumenMes } from "@/lib/admin";
import { cop } from "@/lib/formato";
import {
  aNumero,
  Boton,
  Campo,
  Cargando,
  Encabezado,
  Entrada,
  EntradaNumero,
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

interface PE {
  fuente: string;
  precio_perro: number;
  insumos_por_perro: number;
  costo_por_perro: number;
  margen_por_perro: number;
  margen_bebida_por_perro: number;
  margen_combinado_por_perro: number;
  pct_datafono: number;
  tasa_adjuncion: number;
  merma_pct: number;
  comision_datafono_pct: number;
  nomina: number;
  arriendo: number;
  cuota_recuperacion: number;
  costos_fijos: number;
  pe_unidades_mes: number | null;
  pe_unidades_dia: number | null;
  pe_pesos_mes: number | null;
  perros_vendidos_mes: number;
  margen_contribucion_mes: number;
  avance_pct: number | null;
}

interface Plan {
  id: number;
  descripcion: string;
  monto_total: number;
  meses: number;
  inicia_en: string | null;
  plan_recuperacion_items: { id: number; concepto: string; monto: number }[];
}

interface Parametro {
  clave: string;
  valor: number;
  vigente_desde: string;
}

const PARAMETROS: { clave: string; nombre: string; tipo: "pesos" | "pct" | "num"; ayuda?: string }[] = [
  { clave: "nomina_mensual", nombre: "Nómina mensual", tipo: "pesos", ayuda: "Salario + prestaciones + parafiscales" },
  { clave: "arriendo_mensual", nombre: "Arriendo mensual", tipo: "pesos" },
  { clave: "merma_pct", nombre: "Merma", tipo: "pct", ayuda: "% que se pierde de los insumos" },
  { clave: "comision_datafono_pct", nombre: "Comisión datáfono", tipo: "pct" },
  { clave: "dias_operacion_mes", nombre: "Días de operación al mes", tipo: "num" },
  { clave: "pct_ventas_datafono_estimado", nombre: "% ventas por datáfono (estimado)", tipo: "pct", ayuda: "Solo si el mes aún no tiene ventas" },
  { clave: "tasa_adjuncion_estimada", nombre: "% ventas con bebida (estimado)", tipo: "pct", ayuda: "Solo si el mes aún no tiene ventas" },
];

function primeroDelMes(fecha: string) {
  return fecha.slice(0, 8) + "01";
}

async function cargarFinanzas() {
  const [resumen, categorias, gastos, planes, parametros, socios] = await Promise.all([
    db().rpc("resumen_mensual", { p_meses: 6 }),
    db().from("categorias_gasto").select("id, nombre, tipo").eq("activo", true).order("tipo").order("nombre").returns<CategoriaGasto[]>(),
    db()
      .from("gastos")
      .select("id, fecha, monto, descripcion, categorias_gasto(nombre, tipo), compras!compras_gasto_id_fkey(id)")
      .gte("fecha", (() => {
        const d = new Date(hoyBogota() + "T12:00:00-05:00");
        d.setMonth(d.getMonth() - 5);
        return d.toISOString().slice(0, 8) + "01";
      })())
      .order("fecha", { ascending: false })
      .returns<Gasto[]>(),
    db().from("planes_recuperacion").select("id, descripcion, monto_total, meses, inicia_en, plan_recuperacion_items(id, concepto, monto)").order("id").returns<Plan[]>(),
    db().from("parametros").select("clave, valor, vigente_desde").order("vigente_desde", { ascending: false }).returns<Parametro[]>(),
    db().from("perfiles").select("id, nombre").eq("rol", "socio").eq("activo", true).returns<{ id: string; nombre: string }[]>(),
  ]);
  const vigentes = new Map<string, Parametro>();
  for (const p of exigir(parametros)) if (!vigentes.has(p.clave) && p.vigente_desde <= hoyBogota()) vigentes.set(p.clave, p);
  return {
    resumen: exigir(resumen) as ResumenMes[],
    categorias: exigir(categorias),
    gastos: exigir(gastos),
    planes: exigir(planes),
    parametros: vigentes,
    socios: exigir(socios),
  };
}

export function FinanzasAdmin() {
  const { data, error, cargando, recargar } = useDatos(cargarFinanzas);
  const [mes, setMes] = useState(primeroDelMes(hoyBogota()));
  const cargarPE = useCallback(async () => exigir(await db().rpc("punto_equilibrio", { p_mes: mes })) as PE, [mes]);
  const pe = useDatos(cargarPE);

  const resumenMes = data?.resumen.find((r) => r.mes === mes);
  const gastosMes = (data?.gastos ?? []).filter((g) => primeroDelMes(g.fecha) === mes);

  return (
    <div className="space-y-6">
      <Encabezado
        titulo="Finanzas"
        descripcion="Ingresos, costos y gastos mes a mes, y el punto de equilibrio con un simulador."
        accion={
          data && (
            <Selector value={mes} onChange={(e) => setMes(e.target.value)} className="w-auto min-w-52">
              {data.resumen.map((r) => (
                <option key={r.mes} value={r.mes}>
                  {mesLargo(r.mes)}
                </option>
              ))}
            </Selector>
          )
        }
      />
      {cargando && !data && <Cargando />}
      {error && <MensajeError>{error}</MensajeError>}

      {data && resumenMes && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi etiqueta="Ingresos" valor={resumenMes.ingresos} nota={`${resumenMes.ventas} ventas · ${resumenMes.perros} perros`} />
            <Kpi etiqueta="Margen de contribución" valor={resumenMes.margen} nota="Ingresos − insumos − comisión" />
            <Kpi etiqueta="Gastos fijos + otros" valor={resumenMes.gastos_fijos + resumenMes.gastos_variables} />
            <Kpi etiqueta="Utilidad operativa" valor={resumenMes.utilidad_operativa} destacado />
            <Kpi etiqueta="Flujo de caja" valor={resumenMes.flujo_caja} nota="Lo que entró − todo lo que salió" />
          </div>

          <SimuladorPE pe={pe.data} cargando={pe.cargando} dias={data.parametros.get("dias_operacion_mes")?.valor ?? 30} mes={mes} />

          <Tarjeta>
            <Subtitulo>Mes a mes</Subtitulo>
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[860px] text-right">
                <thead className="font-etiqueta text-xs uppercase tracking-wide text-cafe-700">
                  <tr className="border-b-2 border-cafe-100">
                    <th className="px-2 py-2 text-left">Mes</th>
                    <th className="px-2 py-2">Perros</th>
                    <th className="px-2 py-2">Ingresos</th>
                    <th className="px-2 py-2">Insumos</th>
                    <th className="px-2 py-2">Comisión</th>
                    <th className="px-2 py-2">Margen</th>
                    <th className="px-2 py-2">Fijos</th>
                    <th className="px-2 py-2">Otros gastos</th>
                    <th className="px-2 py-2">Compras</th>
                    <th className="px-2 py-2">Inversión</th>
                    <th className="px-2 py-2">Utilidad</th>
                  </tr>
                </thead>
                <tbody className="numeros">
                  {data.resumen.map((r) => (
                    <tr
                      key={r.mes}
                      onClick={() => setMes(r.mes)}
                      className={`cursor-pointer border-b border-cafe-100 ${r.mes === mes ? "bg-mostaza-100/60" : ""}`}
                    >
                      <td className="px-2 py-2 text-left font-etiqueta font-semibold">{mesLargo(r.mes)}</td>
                      <td className="px-2 py-2">{r.perros}</td>
                      <td className="px-2 py-2">{cop(r.ingresos)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.costo_insumos)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.comisiones)}</td>
                      <td className="px-2 py-2 font-semibold">{cop(r.margen)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.gastos_fijos)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.gastos_variables)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.compras_insumos)}</td>
                      <td className="px-2 py-2 text-cafe-700">{cop(r.inversion)}</td>
                      <td className={`px-2 py-2 font-titulo text-lg font-extrabold ${r.utilidad_operativa < 0 ? "text-rojo" : ""}`}>
                        {cop(r.utilidad_operativa)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-cafe-700">
              <strong>Utilidad operativa</strong> = margen − gastos fijos − otros gastos. Las compras de insumos no se restan otra vez: ya
              están en el costo de lo que se vendió. La inversión (equipos, cuotas a socios) se ve aparte.
            </p>
          </Tarjeta>

          <Tarjeta>
            <CuentasPorCobrar alCobrar={() => recargar()} />
          </Tarjeta>

          <Gastos mes={mes} gastos={gastosMes} categorias={data.categorias} socios={data.socios} alCambiar={recargar} />

          <div className="grid gap-6 lg:grid-cols-2">
            <Parametros parametros={data.parametros} alCambiar={() => {
              recargar();
              pe.recargar();
            }} />
            {data.planes.map((p) => (
              <PlanRecuperacion key={p.id} plan={p} alCambiar={() => {
                recargar();
                pe.recargar();
              }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ etiqueta, valor, nota, destacado }: { etiqueta: string; valor: number; nota?: string; destacado?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${destacado ? "bg-cafe text-crema" : "bg-crema ring-2 ring-cafe-100"}`}>
      <p className={`font-etiqueta text-xs font-semibold uppercase tracking-wide ${destacado ? "text-cafe-100" : "text-cafe-700"}`}>{etiqueta}</p>
      <p className={`numeros font-titulo text-2xl font-extrabold ${valor < 0 ? (destacado ? "text-mostaza" : "text-rojo") : destacado ? "text-mostaza" : ""}`}>
        {cop(valor)}
      </p>
      {nota && <p className={`text-xs ${destacado ? "text-cafe-100" : "text-cafe-300"}`}>{nota}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// Punto de equilibrio + simulador
// ---------------------------------------------------------------------
interface Escenario {
  precio: number | null;
  insumos: string;
  merma: string;
  comision: string;
  pctDatafono: string;
  margenBebida: number | null;
  tasaBebida: string;
  nomina: number | null;
  arriendo: number | null;
  cuota: number | null;
  dias: string;
}

function escenarioDesde(pe: PE, dias: number): Escenario {
  const tasa = pe.tasa_adjuncion;
  return {
    precio: pe.precio_perro,
    insumos: String(pe.insumos_por_perro),
    merma: String(pe.merma_pct),
    comision: String(pe.comision_datafono_pct),
    pctDatafono: String(pe.pct_datafono),
    margenBebida: tasa > 0 ? Math.round(pe.margen_bebida_por_perro / (tasa / 100)) : 1300,
    tasaBebida: String(tasa),
    nomina: pe.nomina,
    arriendo: pe.arriendo,
    cuota: pe.cuota_recuperacion,
    dias: String(dias),
  };
}

function calcular(e: Escenario) {
  const precio = e.precio ?? 0;
  const costoPerro =
    (aNumero(e.insumos) ?? 0) * (1 + (aNumero(e.merma) ?? 0) / 100) +
    precio * ((aNumero(e.comision) ?? 0) / 100) * ((aNumero(e.pctDatafono) ?? 0) / 100);
  const margenPerro = precio - costoPerro;
  const margenBebida = (e.margenBebida ?? 0) * Math.min((aNumero(e.tasaBebida) ?? 0) / 100, 1);
  const margen = margenPerro + margenBebida;
  const fijos = (e.nomina ?? 0) + (e.arriendo ?? 0) + (e.cuota ?? 0);
  const peMes = margen > 0 ? Math.ceil(fijos / margen) : null;
  const dias = aNumero(e.dias) ?? 30;
  return {
    costoPerro,
    margenPerro,
    margenBebida,
    margen,
    fijos,
    peMes,
    peDia: peMes !== null && dias > 0 ? Math.ceil(peMes / dias) : null,
    pePesos: peMes !== null ? peMes * precio : null,
  };
}

function SimuladorPE({ pe, cargando, dias, mes }: { pe?: PE; cargando: boolean; dias: number; mes: string }) {
  const [escenario, setEscenario] = useState<Escenario | null>(null);
  const [base, setBase] = useState<PE | undefined>(undefined);
  if (pe && pe !== base) {
    setBase(pe);
    setEscenario(escenarioDesde(pe, dias));
  }
  const r = useMemo(() => (escenario ? calcular(escenario) : null), [escenario]);
  const real = useMemo(() => (pe ? calcular(escenarioDesde(pe, dias)) : null), [pe, dias]);
  const cambiado = r && real && (r.peDia !== real.peDia || Math.round(r.margen) !== Math.round(real.margen));

  if (cargando && !pe) return <Cargando />;
  if (!pe || !escenario || !r) return null;
  const set = (c: Partial<Escenario>) => setEscenario((e) => (e ? { ...e, ...c } : e));
  const avance = Math.max(0, Math.min(100, pe.avance_pct ?? 0));

  return (
    <Tarjeta className="!bg-cafe !ring-0 text-crema">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-etiqueta text-sm font-extrabold uppercase tracking-wide text-cafe-100">Punto de equilibrio · {mesLargo(mes)}</h2>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
            <span className="numeros font-titulo text-6xl font-extrabold text-mostaza">{r.peDia ?? "—"}</span>
            <span className="font-etiqueta text-lg font-semibold">perros al día</span>
            <span className="text-cafe-100">
              {r.peMes ?? "—"} al mes · {r.pePesos !== null ? cop(r.pePesos) : "—"} en ventas
            </span>
          </p>
          {cambiado && <p className="mt-1 font-etiqueta text-sm font-semibold text-mostaza">Simulación: con los datos reales son {real?.peDia} perros/día.</p>}
        </div>
        <div className="flex gap-2">
          {pe.fuente !== "ventas_reales" && <Insignia tono="alerta">Con estimados: aún no hay ventas este mes</Insignia>}
          {cambiado && (
            <button
              onClick={() => setEscenario(escenarioDesde(pe, dias))}
              className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 font-etiqueta text-sm font-semibold ring-2 ring-cafe-300"
            >
              <RotateCcw className="size-4" /> Volver a lo real
            </button>
          )}
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-1 flex flex-wrap justify-between gap-2 font-etiqueta text-sm font-semibold">
          <span>Margen del mes {cop(pe.margen_contribucion_mes)} · {pe.perros_vendidos_mes} perros</span>
          <span>Costos fijos {cop(pe.costos_fijos)}</span>
        </div>
        <div className="h-4 overflow-hidden rounded-full bg-cafe-700">
          <div className="h-full rounded-full bg-mostaza" style={{ width: `${avance}%` }} />
        </div>
        <p className="mt-1 text-sm text-cafe-100">{avance.toFixed(0)}% de los costos fijos cubiertos</p>
      </div>

      <p className="mb-3 text-sm text-cafe-100">
        Cambia cualquier valor para simular (no se guarda). Para cambiarlo de verdad, usa Parámetros más abajo.
      </p>
      <div className="grid gap-3 text-cafe sm:grid-cols-2 lg:grid-cols-4 [&_input]:!bg-crema">
        <CampoSim etiqueta="Precio del perro">
          <EntradaPesos valor={escenario.precio} alCambiar={(v) => set({ precio: v })} />
        </CampoSim>
        <CampoSim etiqueta="Insumos por perro ($)">
          <EntradaNumero valor={escenario.insumos} alCambiar={(v) => set({ insumos: v })} />
        </CampoSim>
        <CampoSim etiqueta="Merma %">
          <EntradaNumero valor={escenario.merma} alCambiar={(v) => set({ merma: v })} />
        </CampoSim>
        <CampoSim etiqueta="% ventas por datáfono">
          <EntradaNumero valor={escenario.pctDatafono} alCambiar={(v) => set({ pctDatafono: v })} />
        </CampoSim>
        <CampoSim etiqueta="Margen por bebida">
          <EntradaPesos valor={escenario.margenBebida} alCambiar={(v) => set({ margenBebida: v })} />
        </CampoSim>
        <CampoSim etiqueta="% ventas con bebida">
          <EntradaNumero valor={escenario.tasaBebida} alCambiar={(v) => set({ tasaBebida: v })} />
        </CampoSim>
        <CampoSim etiqueta="Nómina">
          <EntradaPesos valor={escenario.nomina} alCambiar={(v) => set({ nomina: v })} />
        </CampoSim>
        <CampoSim etiqueta="Arriendo">
          <EntradaPesos valor={escenario.arriendo} alCambiar={(v) => set({ arriendo: v })} />
        </CampoSim>
        <CampoSim etiqueta="Cuota recuperación">
          <EntradaPesos valor={escenario.cuota} alCambiar={(v) => set({ cuota: v })} />
        </CampoSim>
        <CampoSim etiqueta="Comisión datáfono %">
          <EntradaNumero valor={escenario.comision} alCambiar={(v) => set({ comision: v })} />
        </CampoSim>
        <CampoSim etiqueta="Días de operación">
          <EntradaNumero valor={escenario.dias} alCambiar={(v) => set({ dias: v })} />
        </CampoSim>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-1 border-t border-cafe-700 pt-4 text-sm sm:grid-cols-2">
        <Linea etiqueta="Costo total por perro" valor={cop(r.costoPerro)} />
        <Linea etiqueta="Margen por perro" valor={cop(r.margenPerro)} />
        <Linea etiqueta="Margen esperado de bebida por perro" valor={cop(r.margenBebida)} />
        <Linea etiqueta="Margen combinado por perro" valor={cop(r.margen)} fuerte />
        <Linea etiqueta="Costos fijos del mes" valor={cop(r.fijos)} fuerte />
      </dl>
    </Tarjeta>
  );
}

function CampoSim({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-etiqueta text-xs font-semibold uppercase tracking-wide text-cafe-100">{etiqueta}</span>
      {children}
    </label>
  );
}

function Linea({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-cafe-100">{etiqueta}</dt>
      <dd className={`numeros ${fuerte ? "font-titulo text-lg font-extrabold text-mostaza" : ""}`}>{valor}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------
// Gastos
// ---------------------------------------------------------------------
function Gastos({
  mes,
  gastos,
  categorias,
  socios,
  alCambiar,
}: {
  mes: string;
  gastos: Gasto[];
  categorias: CategoriaGasto[];
  socios: { id: string; nombre: string }[];
  alCambiar: () => void;
}) {
  const [fecha, setFecha] = useState(hoyBogota());
  const [categoria, setCategoria] = useState<number | "">("");
  const [monto, setMonto] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [socio, setSocio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cat = categorias.find((c) => c.id === categoria);
  const esCuota = cat?.nombre.toLowerCase().includes("recuperación");

  const porTipo = { fijo: 0, variable: 0, inversion: 0 };
  for (const g of gastos) if (g.categorias_gasto) porTipo[g.categorias_gasto.tipo] += g.monto;

  const guardar = async () => {
    setError(null);
    if (!categoria) return setError("Elige la categoría.");
    if (!monto) return setError("Escribe el monto.");
    setGuardando(true);
    try {
      exigir(
        await db().from("gastos").insert({
          fecha,
          categoria_id: categoria,
          monto,
          descripcion: descripcion.trim() || null,
          socio_id: esCuota && socio ? socio : null,
        }),
      );
      setMonto(null);
      setDescripcion("");
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (g: Gasto) => {
    if (!confirm(`¿Borrar el gasto de ${cop(g.monto)}?`)) return;
    try {
      exigir(await db().from("gastos").delete().eq("id", g.id));
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  return (
    <Tarjeta>
      <Subtitulo>Gastos · {mesLargo(mes)}</Subtitulo>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[150px_1fr_160px_1.4fr_auto] lg:items-end">
        <Campo etiqueta="Fecha">
          <Entrada type="date" value={fecha} max={hoyBogota()} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
        <Campo etiqueta="Categoría">
          <Selector value={categoria} onChange={(e) => setCategoria(e.target.value ? Number(e.target.value) : "")}>
            <option value="">Elige…</option>
            {(["fijo", "variable", "inversion"] as const).map((t) => (
              <optgroup key={t} label={{ fijo: "Costo fijo", variable: "Costo variable", inversion: "Inversión / recuperación" }[t]}>
                {categorias
                  .filter((c) => c.tipo === t)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
              </optgroup>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Monto">
          <EntradaPesos valor={monto} alCambiar={setMonto} placeholder="$0" />
        </Campo>
        {esCuota ? (
          <Campo etiqueta="¿A qué socio se le pagó?">
            <Selector value={socio} onChange={(e) => setSocio(e.target.value)}>
              <option value="">Elige…</option>
              {socios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Selector>
          </Campo>
        ) : (
          <Campo etiqueta="Descripción">
            <Entrada value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Recibo de gas septiembre" />
          </Campo>
        )}
        <Boton onClick={guardar} cargando={guardando}>
          <Plus className="size-5" /> Agregar
        </Boton>
      </div>
      {error && (
        <div className="mb-3">
          <MensajeError>{error}</MensajeError>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <Insignia>Fijos {cop(porTipo.fijo)}</Insignia>
        <Insignia>Variables {cop(porTipo.variable)}</Insignia>
        <Insignia>Inversión {cop(porTipo.inversion)}</Insignia>
      </div>

      {gastos.length === 0 ? (
        <Vacio>No hay gastos registrados en {mesLargo(mes).toLowerCase()}.</Vacio>
      ) : (
        <ul className="divide-y divide-cafe-100">
          {gastos.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                <span className="font-etiqueta font-semibold">{g.categorias_gasto?.nombre}</span>
                {g.descripcion && <span className="text-cafe-700"> · {g.descripcion}</span>}
                <span className="text-sm text-cafe-300"> · {fechaCorta(g.fecha)}</span>
                {g.compras.length > 0 && <span className="ml-2"><Insignia>De una compra</Insignia></span>}
              </span>
              <span className="flex items-center gap-2">
                <span className="numeros font-semibold">{cop(g.monto)}</span>
                {g.compras.length === 0 && (
                  <button aria-label="Borrar gasto" onClick={() => borrar(g)} className="grid size-10 place-items-center rounded-xl text-cafe-300 active:bg-cafe-100">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
// Parámetros
// ---------------------------------------------------------------------
function Parametros({ parametros, alCambiar }: { parametros: Map<string, Parametro>; alCambiar: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(PARAMETROS.map((p) => [p.clave, String(parametros.get(p.clave)?.valor ?? "")])),
  );
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardar = async (clave: string) => {
    setError(null);
    const v = aNumero(valores[clave] ?? "");
    if (v === null) return setError("Escribe un número.");
    setGuardando(clave);
    try {
      exigir(await db().rpc("guardar_parametro", { p_clave: clave, p_valor: v }));
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Tarjeta>
      <Subtitulo>Parámetros</Subtitulo>
      <p className="mb-3 text-sm text-cafe-700">Cada cambio aplica desde hoy; los meses anteriores conservan el valor que tenían.</p>
      <div className="space-y-3">
        {PARAMETROS.map((p) => {
          const actual = parametros.get(p.clave);
          const distinto = actual && aNumero(valores[p.clave] ?? "") !== actual.valor;
          return (
            <div key={p.clave} className="grid grid-cols-[1fr_150px_auto] items-end gap-2">
              <div>
                <p className="font-etiqueta text-sm font-semibold">{p.nombre}</p>
                <p className="text-xs text-cafe-300">
                  {p.ayuda ? p.ayuda + " · " : ""}desde {actual ? fechaCorta(actual.vigente_desde) : "—"}
                </p>
              </div>
              {p.tipo === "pesos" ? (
                <EntradaPesos
                  valor={aNumero(valores[p.clave] ?? "")}
                  alCambiar={(v) => setValores((s) => ({ ...s, [p.clave]: v === null ? "" : String(v) }))}
                />
              ) : (
                <EntradaNumero valor={valores[p.clave] ?? ""} alCambiar={(v) => setValores((s) => ({ ...s, [p.clave]: v }))} />
              )}
              <button
                aria-label={`Guardar ${p.nombre}`}
                disabled={!distinto || guardando === p.clave}
                onClick={() => guardar(p.clave)}
                className="grid size-12 place-items-center rounded-xl bg-cafe text-crema disabled:bg-cafe-100 disabled:text-cafe-300"
              >
                <Save className="size-5" />
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------
// Plan de recuperación de inversión
// ---------------------------------------------------------------------
function PlanRecuperacion({ plan, alCambiar }: { plan: Plan; alCambiar: () => void }) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState<number | null>(null);
  const [meses, setMeses] = useState(String(plan.meses));
  const [inicio, setInicio] = useState(plan.inicia_en ?? "");
  const [error, setError] = useState<string | null>(null);
  const cuota = plan.meses > 0 ? plan.monto_total / plan.meses : 0;

  const ejecutar = async (fn: () => Promise<{ error: { message: string } | null }>) => {
    setError(null);
    try {
      const r = await fn();
      if (r.error) throw r.error;
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    }
  };

  const agregar = () => {
    if (!concepto.trim() || !monto) return setError("Escribe el concepto y el monto.");
    void ejecutar(async () => {
      const r = await db().from("plan_recuperacion_items").insert({ plan_id: plan.id, concepto: concepto.trim(), monto });
      if (!r.error) {
        setConcepto("");
        setMonto(null);
      }
      return r;
    });
  };

  const guardarPlan = () => {
    const m = aNumero(meses);
    if (!m || m < 1) return setError("Los meses deben ser 1 o más.");
    void ejecutar(async () => db().from("planes_recuperacion").update({ meses: Math.round(m), inicia_en: inicio || null }).eq("id", plan.id));
  };

  return (
    <Tarjeta>
      <Subtitulo>Recuperación de inversión</Subtitulo>
      <p className="numeros font-titulo text-3xl font-extrabold">{cop(plan.monto_total)}</p>
      <p className="mb-4 text-cafe-700">
        Cuota de <strong className="numeros">{cop(cuota)}</strong> al mes durante {plan.meses} meses
        {plan.inicia_en ? `, desde ${mesLargo(plan.inicia_en).toLowerCase()}` : " · fecha de inicio pendiente (se cuenta todos los meses)"}.
      </p>

      <ul className="mb-3 divide-y divide-cafe-100">
        {plan.plan_recuperacion_items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2">
            <span className="font-etiqueta font-semibold">{i.concepto}</span>
            <span className="flex items-center gap-2">
              <span className="numeros">{cop(i.monto)}</span>
              <button
                aria-label={`Quitar ${i.concepto}`}
                onClick={() => confirm(`¿Quitar ${i.concepto}?`) && void ejecutar(async () => db().from("plan_recuperacion_items").delete().eq("id", i.id))}
                className="grid size-10 place-items-center rounded-xl text-cafe-300 active:bg-cafe-100"
              >
                <Trash2 className="size-4" />
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="mb-4 grid grid-cols-[1fr_140px_auto] items-end gap-2">
        <Campo etiqueta="Nuevo concepto">
          <Entrada value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Ej. Uniformes" />
        </Campo>
        <Campo etiqueta="Monto">
          <EntradaPesos valor={monto} alCambiar={setMonto} placeholder="$0" />
        </Campo>
        <Boton variante="secundario" onClick={agregar} aria-label="Agregar concepto">
          <Plus className="size-5" />
        </Boton>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 border-t-2 border-cafe-100 pt-4">
        <Campo etiqueta="Meses para recuperar">
          <EntradaNumero valor={meses} alCambiar={setMeses} />
        </Campo>
        <Campo etiqueta="Empieza a contar desde">
          <Entrada type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </Campo>
        <Boton variante="secundario" onClick={guardarPlan} aria-label="Guardar plan">
          <Save className="size-5" />
        </Boton>
      </div>
      {error && (
        <div className="mt-3">
          <MensajeError>{error}</MensajeError>
        </div>
      )}
    </Tarjeta>
  );
}
