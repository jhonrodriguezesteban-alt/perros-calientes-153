"use client";

import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { db, fechaCorta, hoyBogota, mesLargo, PAGOS_COMPRA, type CategoriaGasto, type Gasto, type PagoCompra, type ResumenMes } from "@/lib/admin";
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
  intereses?: number;
  luz?: number;
  internet?: number;
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
  { clave: "servicios_luz_mensual", nombre: "Luz (al mes)", tipo: "pesos" },
  { clave: "servicios_internet_mensual", nombre: "Internet (al mes)", tipo: "pesos" },
  { clave: "intereses_prestamo_mensual", nombre: "Intereses del préstamo (al mes)", tipo: "pesos", ayuda: "Lo que se paga de intereses cada mes por el préstamo de los socios" },
  { clave: "merma_pct", nombre: "Merma", tipo: "pct", ayuda: "% que se pierde de los insumos" },
  { clave: "comision_datafono_pct", nombre: "Comisión Bold", tipo: "pct" },
  { clave: "dias_operacion_mes", nombre: "Días de operación al mes", tipo: "num" },
  { clave: "pct_ventas_datafono_estimado", nombre: "% ventas por Bold (estimado)", tipo: "pct", ayuda: "Solo si el mes aún no tiene ventas" },
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
      .select("id, fecha, monto, descripcion, pagado_con, categorias_gasto(nombre, tipo), compras!compras_gasto_id_fkey(id)")
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
  // Para el simulador: el préstamo de los socios y lo que cuesta cada bebida
  const [aportes, bebidas] = await Promise.all([
    db().from("aportes_socios").select("monto, tipo"),
    db().from("insumos").select("costo_unitario").eq("familia", "bebidas").eq("activo", true),
  ]);
  const prestamo = (aportes.data ?? []).reduce((s, a) => s + (a.tipo === "devolucion" ? -a.monto : a.monto), 0);
  const costosBebida = (bebidas.data ?? []).map((b) => Number(b.costo_unitario)).filter((c) => c > 0);
  const vigentes = new Map<string, Parametro>();
  for (const p of exigir(parametros)) if (!vigentes.has(p.clave) && p.vigente_desde <= hoyBogota()) vigentes.set(p.clave, p);
  return {
    resumen: exigir(resumen) as ResumenMes[],
    categorias: exigir(categorias),
    gastos: exigir(gastos),
    planes: exigir(planes),
    parametros: vigentes,
    socios: exigir(socios),
    prestamo,
    costoBebida: costosBebida.length ? Math.round(costosBebida.reduce((s, c) => s + c, 0) / costosBebida.length) : 1200,
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

          <SimuladorPE pe={pe.data} cargando={pe.cargando} dias={data.parametros.get("dias_operacion_mes")?.valor ?? 30} mes={mes} prestamo={data.prestamo} costoBebida={data.costoBebida} />

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
  luz: number | null;
  internet: number | null;
  otrosFijos: number | null;
  intereses: number | null;
  costoBebida: number | null;
  /** Abono a capital del préstamo al mes (opcional). */
  abono: number | null;
  dias: string;
  perrosDia: string;
}

function escenarioDesde(pe: PE, dias: number, prestamo: number, costoBebida: number): Escenario {
  const tasa = pe.tasa_adjuncion;
  const e: Escenario = {
    precio: pe.precio_perro,
    insumos: String(pe.insumos_por_perro),
    merma: String(pe.merma_pct),
    comision: String(pe.comision_datafono_pct),
    pctDatafono: String(pe.pct_datafono),
    margenBebida: tasa > 0 ? Math.round(pe.margen_bebida_por_perro / (tasa / 100)) : 1300,
    tasaBebida: String(tasa),
    nomina: pe.nomina,
    arriendo: pe.arriendo,
    luz: pe.luz ?? 0,
    internet: pe.internet ?? 0,
    otrosFijos: 0,
    intereses: pe.intereses ?? Math.round((prestamo > 0 ? prestamo : 13000000) * 0.03),
    costoBebida,
    abono: pe.cuota_recuperacion,
    dias: String(dias),
    perrosDia: "0",
  };
  // "¿Y si vendo…?" arranca en el punto de equilibrio: de ahí se sube o se baja
  return { ...e, perrosDia: String(calcular(e).peDia ?? 30) };
}

function calcular(e: Escenario) {
  const precio = e.precio ?? 0;
  const insumosConMerma = (aNumero(e.insumos) ?? 0) * (1 + (aNumero(e.merma) ?? 0) / 100);
  const comisionPerro = precio * ((aNumero(e.comision) ?? 0) / 100) * ((aNumero(e.pctDatafono) ?? 0) / 100);
  const costoPerro = insumosConMerma + comisionPerro;
  const margenPerro = precio - costoPerro;
  const margenBebida = (e.margenBebida ?? 0) * Math.min((aNumero(e.tasaBebida) ?? 0) / 100, 1);
  const margen = margenPerro + margenBebida;
  const cuota = e.abono ?? 0;
  const intereses = e.intereses ?? 0;
  const operativos = (e.nomina ?? 0) + (e.arriendo ?? 0) + (e.luz ?? 0) + (e.internet ?? 0) + (e.otrosFijos ?? 0) + intereses;
  const fijos = operativos + cuota;
  const dias = aNumero(e.dias) ?? 30;
  const peMes = margen > 0 ? Math.ceil(fijos / margen) : null;
  const peSinCuota = margen > 0 ? Math.ceil(operativos / margen) : null;
  // Escenario "¿y si vendo N perros al día?"
  const perrosMes = (aNumero(e.perrosDia) ?? 0) * dias;
  const margenEscenario = perrosMes * margen;
  return {
    insumosConMerma,
    comisionPerro,
    costoPerro,
    margenPerro,
    margenBebida,
    margen,
    cuota,
    operativos,
    fijos,
    peMes,
    peDia: peMes !== null && dias > 0 ? Math.ceil(peMes / dias) : null,
    pePesos: peMes !== null ? peMes * precio : null,
    peDiaSinCuota: peSinCuota !== null && dias > 0 ? Math.ceil(peSinCuota / dias) : null,
    perrosMes,
    margenEscenario,
    utilidadEscenario: margenEscenario - fijos,
    utilidadSinCuota: margenEscenario - operativos,
    intereses,
    // Plata para surtir el almacén con esas ventas
    surtidoPerros: perrosMes * insumosConMerma,
    bebidasMes: Math.round(perrosMes * Math.min((aNumero(e.tasaBebida) ?? 0) / 100, 1)),
    surtidoBebidas: Math.round(perrosMes * Math.min((aNumero(e.tasaBebida) ?? 0) / 100, 1)) * (e.costoBebida ?? 0),
  };
}

function SimuladorPE({
  pe,
  cargando,
  dias,
  mes,
  prestamo,
  costoBebida,
}: {
  pe?: PE;
  cargando: boolean;
  dias: number;
  mes: string;
  prestamo: number;
  costoBebida: number;
}) {
  const [escenario, setEscenario] = useState<Escenario | null>(null);
  const [base, setBase] = useState<PE | undefined>(undefined);
  if (pe && pe !== base) {
    setBase(pe);
    setEscenario(escenarioDesde(pe, dias, prestamo, costoBebida));
  }
  const r = useMemo(() => (escenario ? calcular(escenario) : null), [escenario]);
  const real = useMemo(() => (pe ? calcular(escenarioDesde(pe, dias, prestamo, costoBebida)) : null), [pe, dias, prestamo, costoBebida]);
  const cambiado = r && real && (r.peDia !== real.peDia || Math.round(r.margen) !== Math.round(real.margen) || r.fijos !== real.fijos);

  if (cargando && !pe) return <Cargando />;
  if (!pe || !escenario || !r) return null;
  const set = (c: Partial<Escenario>) => setEscenario((e) => (e ? { ...e, ...c } : e));
  const avance = Math.max(0, Math.min(100, pe.avance_pct ?? 0));
  const perrosDia = aNumero(escenario.perrosDia) ?? 0;

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
          {r.cuota > 0 && (
            <p className="mt-1 text-sm text-cafe-100">
              Sin contar el abono a capital (pero sí los intereses): <strong className="text-crema">{r.peDiaSinCuota ?? "—"} perros al día</strong>
            </p>
          )}
          {cambiado && <p className="mt-1 font-etiqueta text-sm font-semibold text-mostaza">Simulación: con los datos reales son {real?.peDia} perros/día.</p>}
        </div>
        <div className="flex gap-2">
          {pe.fuente !== "ventas_reales" && <Insignia tono="alerta">Con estimados: aún no hay ventas este mes</Insignia>}
          {cambiado && (
            <button
              onClick={() => setEscenario(escenarioDesde(pe, dias, prestamo, costoBebida))}
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
        Juega con cualquier valor: el resultado cambia al instante y no se guarda. Para cambiarlo de verdad, usa Parámetros más abajo.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Por cada perro */}
        <section className="rounded-2xl bg-cafe-700/60 p-4">
          <h3 className="mb-3 font-etiqueta text-sm font-extrabold uppercase tracking-wide text-mostaza">1 · Lo que deja cada perro</h3>
          <div className="grid gap-3 text-cafe sm:grid-cols-2 [&_input]:!bg-crema">
            <CampoSim etiqueta="Precio promedio del perro">
              <EntradaPesos valor={escenario.precio} alCambiar={(v) => set({ precio: v })} />
            </CampoSim>
            <CampoSim etiqueta="Materia prima por perro ($)">
              <EntradaNumero valor={escenario.insumos} alCambiar={(v) => set({ insumos: v })} />
            </CampoSim>
            <CampoSim etiqueta="Merma %">
              <EntradaNumero valor={escenario.merma} alCambiar={(v) => set({ merma: v })} />
            </CampoSim>
            <CampoSim etiqueta="% ventas por Bold">
              <EntradaNumero valor={escenario.pctDatafono} alCambiar={(v) => set({ pctDatafono: v })} />
            </CampoSim>
            <CampoSim etiqueta="Comisión Bold %">
              <EntradaNumero valor={escenario.comision} alCambiar={(v) => set({ comision: v })} />
            </CampoSim>
            <CampoSim etiqueta="Ganancia por bebida">
              <EntradaPesos valor={escenario.margenBebida} alCambiar={(v) => set({ margenBebida: v })} />
            </CampoSim>
            <CampoSim etiqueta="% ventas con bebida">
              <EntradaNumero valor={escenario.tasaBebida} alCambiar={(v) => set({ tasaBebida: v })} />
            </CampoSim>
            <CampoSim etiqueta="Costo de cada bebida">
              <EntradaPesos valor={escenario.costoBebida} alCambiar={(v) => set({ costoBebida: v })} />
            </CampoSim>
          </div>
          <dl className="mt-4 space-y-1 border-t border-cafe-300/40 pt-3 text-sm">
            <Linea etiqueta="Precio del perro" valor={cop(escenario.precio ?? 0)} />
            <Linea etiqueta={`− Materia prima (con ${escenario.merma || 0}% de merma)`} valor={`−${cop(r.insumosConMerma)}`} />
            <Linea etiqueta="− Comisión Bold (promedio por perro)" valor={`−${cop(r.comisionPerro)}`} />
            <Linea etiqueta="= Ganancia del perro" valor={cop(r.margenPerro)} />
            <Linea etiqueta="+ Ganancia de bebida (promedio por perro)" valor={cop(r.margenBebida)} />
            <Linea etiqueta="= Deja cada perro vendido" valor={cop(r.margen)} fuerte />
          </dl>
        </section>

        {/* Costos fijos */}
        <section className="rounded-2xl bg-cafe-700/60 p-4">
          <h3 className="mb-3 font-etiqueta text-sm font-extrabold uppercase tracking-wide text-mostaza">2 · Lo que hay que cubrir cada mes</h3>
          <div className="grid gap-3 text-cafe sm:grid-cols-2 [&_input]:!bg-crema">
            <CampoSim etiqueta="Nómina">
              <EntradaPesos valor={escenario.nomina} alCambiar={(v) => set({ nomina: v })} />
            </CampoSim>
            <CampoSim etiqueta="Arriendo">
              <EntradaPesos valor={escenario.arriendo} alCambiar={(v) => set({ arriendo: v })} />
            </CampoSim>
            <CampoSim etiqueta="Luz">
              <EntradaPesos valor={escenario.luz} alCambiar={(v) => set({ luz: v })} placeholder="$0" />
            </CampoSim>
            <CampoSim etiqueta="Internet">
              <EntradaPesos valor={escenario.internet} alCambiar={(v) => set({ internet: v })} placeholder="$0" />
            </CampoSim>
            <CampoSim etiqueta="Otros fijos (gas, agua…)">
              <EntradaPesos valor={escenario.otrosFijos} alCambiar={(v) => set({ otrosFijos: v })} />
            </CampoSim>
            <CampoSim etiqueta="Días de operación al mes">
              <EntradaNumero valor={escenario.dias} alCambiar={(v) => set({ dias: v })} />
            </CampoSim>
            <CampoSim etiqueta="Intereses del préstamo (al mes)">
              <EntradaPesos valor={escenario.intereses} alCambiar={(v) => set({ intereses: v })} />
            </CampoSim>
            <CampoSim etiqueta="Abono a capital del préstamo (al mes)">
              <EntradaPesos valor={escenario.abono} alCambiar={(v) => set({ abono: v })} placeholder="$0" />
            </CampoSim>
          </div>
          <dl className="mt-4 space-y-1 border-t border-cafe-300/40 pt-3 text-sm">
            <Linea etiqueta="Nómina" valor={cop(escenario.nomina ?? 0)} />
            <Linea etiqueta="Arriendo" valor={cop(escenario.arriendo ?? 0)} />
            <Linea etiqueta="Luz" valor={cop(escenario.luz ?? 0)} />
            <Linea etiqueta="Internet" valor={cop(escenario.internet ?? 0)} />
            {(escenario.otrosFijos ?? 0) > 0 && <Linea etiqueta="Otros fijos" valor={cop(escenario.otrosFijos ?? 0)} />}
            {r.intereses > 0 && (
              <Linea
                etiqueta={`Intereses del préstamo${prestamo > 0 ? ` (${((r.intereses / prestamo) * 100).toFixed(1).replace(".0", "")}% de ${cop(prestamo)})` : ""}`}
                valor={cop(r.intereses)}
              />
            )}
            <Linea etiqueta="= Gastos del negocio" valor={cop(r.operativos)} />
            {r.cuota > 0 && <Linea etiqueta="+ Abono a capital del préstamo" valor={cop(r.cuota)} />}
            <Linea etiqueta="= Total a cubrir al mes" valor={cop(r.fijos)} fuerte />
          </dl>
        </section>
      </div>

      {/* ¿Y si vendo...? */}
      <section className="mt-5 rounded-2xl bg-crema p-4 text-cafe">
        <h3 className="font-etiqueta text-sm font-extrabold uppercase tracking-wide text-cafe-700">3 · ¿Y si vendo…?</h3>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 font-etiqueta font-semibold">
            <EntradaNumero valor={escenario.perrosDia} alCambiar={(v) => set({ perrosDia: v })} className="!w-24 text-center text-xl" />
            perros al día
          </label>
          <div className="flex gap-1">
            {[-5, -1, 1, 5].map((d) => (
              <button
                key={d}
                onClick={() => set({ perrosDia: String(Math.max(0, perrosDia + d)) })}
                className="min-h-10 rounded-xl px-3 font-etiqueta text-sm font-bold ring-2 ring-cafe-100 active:bg-cafe-100"
              >
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
          </div>
        </div>
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <LineaClara etiqueta={`Perros al mes (${escenario.dias || 0} días)`} valor={r.perrosMes.toLocaleString("es-CO")} />
          <LineaClara etiqueta="Ganancia de esos perros (con bebidas)" valor={cop(r.margenEscenario)} />
          <LineaClara etiqueta="− Gastos del negocio" valor={`−${cop(r.operativos)}`} />
          {r.cuota > 0 && <LineaClara etiqueta="= Queda antes del abono a capital" valor={cop(r.utilidadSinCuota)} />}
          {r.cuota > 0 && <LineaClara etiqueta="− Abono a capital del préstamo" valor={`−${cop(r.cuota)}`} />}
          <LineaClara etiqueta={r.utilidadEscenario >= 0 ? "= Utilidad del mes" : "= Pérdida del mes"} valor={cop(r.utilidadEscenario)} fuerte negativo={r.utilidadEscenario < 0} />
        </dl>

        <div className="mt-4 border-t-2 border-cafe-100 pt-3">
          <h4 className="font-etiqueta text-sm font-extrabold uppercase tracking-wide text-cafe-700">Plata para surtir el almacén ese mes</h4>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <LineaClara etiqueta={`Materia prima para ${r.perrosMes.toLocaleString("es-CO")} perros`} valor={cop(r.surtidoPerros)} />
            <LineaClara etiqueta={`${r.bebidasMes.toLocaleString("es-CO")} bebidas × ${cop(escenario.costoBebida ?? 0)}`} valor={cop(r.surtidoBebidas)} />
            <LineaClara etiqueta="= Compras de materia prima del mes" valor={cop(r.surtidoPerros + r.surtidoBebidas)} fuerte />
            <LineaClara etiqueta="Si se surte cada semana, en caja se necesitan" valor={cop((r.surtidoPerros + r.surtidoBebidas) / 4.3)} />
          </dl>
          <p className="mt-2 text-xs text-cafe-700">
            No es un gasto más: ya está descontado en lo que deja cada perro y se recupera al vender. Es la plata que tiene que estar disponible para comprar antes de vender.
          </p>
        </div>
      </section>
    </Tarjeta>
  );
}

function LineaClara({ etiqueta, valor, fuerte, negativo }: { etiqueta: string; valor: string; fuerte?: boolean; negativo?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={fuerte ? "font-etiqueta font-extrabold" : "text-cafe-700"}>{etiqueta}</dt>
      <dd className={`numeros ${fuerte ? `font-titulo text-xl font-extrabold ${negativo ? "text-rojo" : "text-exito"}` : ""}`}>{valor}</dd>
    </div>
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
  const [pagadoCon, setPagadoCon] = useState<PagoCompra | null>(null);
  const [pagadoPor, setPagadoPor] = useState("");
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
    if (!pagadoCon) return setError("Elige con qué se pagó.");
    if (pagadoCon === "socio" && !pagadoPor) return setError("Elige qué socio puso la plata.");
    setGuardando(true);
    try {
      exigir(
        await db().from("gastos").insert({
          fecha,
          categoria_id: categoria,
          monto,
          descripcion: descripcion.trim() || null,
          socio_id: esCuota && socio ? socio : null,
          pagado_con: pagadoCon,
          pagado_por_socio: pagadoCon === "socio" ? pagadoPor : null,
        }),
      );
      setMonto(null);
      setDescripcion("");
      setPagadoCon(null);
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  };

  // Cambiar la forma de pago de un gasto ya registrado (ej. se pagó con el fondo)
  const cambiarPago = async (g: Gasto, pago: PagoCompra) => {
    try {
      exigir(await db().from("gastos").update({ pagado_con: pago }).eq("id", g.id));
      alCambiar();
    } catch (e) {
      setError(mensajeError(e));
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
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-etiqueta text-sm font-semibold text-cafe-700">¿Con qué se pagó?</span>
        {PAGOS_COMPRA.map((p) => (
          <button
            key={p.id}
            onClick={() => setPagadoCon(p.id)}
            className={`min-h-10 rounded-xl px-3 font-etiqueta text-sm font-semibold ${
              pagadoCon === p.id ? "bg-cafe text-crema" : "ring-2 ring-cafe-100 active:bg-cafe-100"
            }`}
          >
            {p.nombre}
          </button>
        ))}
        {pagadoCon === "socio" && (
          <Selector value={pagadoPor} onChange={(e) => setPagadoPor(e.target.value)} className="w-auto min-w-48">
            <option value="">¿Qué socio?</option>
            {socios.map((so) => (
              <option key={so.id} value={so.id}>
                {so.nombre}
              </option>
            ))}
          </Selector>
        )}
        {pagadoCon === "caja" && fecha === hoyBogota() && (
          <span className="text-sm text-cafe-700">Sale de la caja de hoy como retiro.</span>
        )}
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
                {g.compras.length === 0 && (
                  <select
                    aria-label="Con qué se pagó"
                    value={g.pagado_con ?? ""}
                    onChange={(e) => void cambiarPago(g, e.target.value as PagoCompra)}
                    className="h-9 rounded-lg bg-crema px-2 text-xs ring-1 ring-cafe-100"
                  >
                    <option value="" disabled>
                      ¿Con qué se pagó?
                    </option>
                    {PAGOS_COMPRA.filter((p) => p.id !== "socio" && p.id !== "caja").map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                )}
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
