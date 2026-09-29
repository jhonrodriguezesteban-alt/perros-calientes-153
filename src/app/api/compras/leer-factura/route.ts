import Anthropic from "@anthropic-ai/sdk";
import type { Familia, Unidad } from "@/lib/admin";
import type { FacturaLeida, ItemLeido } from "@/lib/factura";
import { supabaseServidor } from "@/lib/supabase/server";

// Leer una factura larga puede tardar cerca de un minuto.
export const maxDuration = 120;

const MAX_FOTOS = 4;
const MAX_BASE64 = 6_000_000; // ~4,5 MB por foto (ya llegan reducidas desde el navegador)
const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;
type TipoImagen = (typeof TIPOS)[number];

interface InsumoCorto {
  id: number;
  nombre: string;
  unidad: Unidad;
  familia: Familia | null;
  costo_unitario: number;
}

const nulo = (esquema: object) => ({ anyOf: [esquema, { type: "null" }] });

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["proveedor", "fecha", "medio_pago", "total_factura", "observaciones", "items"],
  properties: {
    proveedor: nulo({ type: "string" }),
    fecha: nulo({ type: "string", description: "YYYY-MM-DD" }),
    medio_pago: { type: "string", enum: ["efectivo", "tarjeta", "transferencia", "desconocido"] },
    total_factura: nulo({ type: "integer" }),
    observaciones: nulo({ type: "string" }),
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "tipo",
          "descripcion",
          "presentacion",
          "insumo_id",
          "nombre_sugerido",
          "unidad",
          "familia_sugerida",
          "cantidad",
          "costo_total",
          "confianza",
          "nota",
        ],
        properties: {
          tipo: { type: "string", enum: ["insumo", "equipo"] },
          descripcion: { type: "string" },
          presentacion: { type: "string" },
          insumo_id: nulo({ type: "integer" }),
          nombre_sugerido: nulo({ type: "string" }),
          unidad: { type: "string", enum: ["g", "ml", "und"] },
          familia_sugerida: { type: "string", enum: ["perro", "bebidas", "utensilios", "otros"] },
          cantidad: { type: "number" },
          costo_total: { type: "integer" },
          confianza: { type: "string", enum: ["alta", "media", "baja"] },
          nota: nulo({ type: "string" }),
        },
      },
    },
  },
};

const INSTRUCCIONES = `Eres el asistente de compras de "Bendito Perro Caliente", un puesto de perros calientes en Bogotá (Colombia). Te llegan fotos de facturas o tiquetes de compra (supermercado, mayorista, tienda, plaza) y debes convertirlas en renglones para el inventario.

Para cada producto comprado:
- tipo: "insumo" si se gasta al vender o preparar (comida, bebidas, salsas, servilletas, bolsas, bandejas, empaques desechables); "equipo" si es un utensilio o equipo que se usa muchas veces y no se gasta (pinzas, ollas, planchas, neveras, termos, cuchillos, recipientes, dispensadores de salsa). Un equipo nunca lleva insumo_id.
- descripcion: el texto del producto tal como aparece en la factura.
- presentacion: la presentación con gramaje o contenido y cuántas se compraron, en español sencillo (ej. "2 × paquete de 8 panes", "1 × bolsa 1.000 g", "3 × botella 1,5 L").
- insumo_id: el id del insumo de la lista que corresponde a ese producto. Empareja por lo que es el producto, no por la marca exacta (ej. "SALCH RANCHERA X16 FRIKO" es la salchicha aunque el nombre del insumo no diga la marca). Si ninguno corresponde, null.
- nombre_sugerido: solo si insumo_id es null, un nombre corto y claro para crear el insumo (ej. "Queso mozzarella"). Si hay insumo, null.
- unidad: la unidad del insumo emparejado (debe ser igual a la de la lista). Si es nuevo: g para sólidos que se pesan, ml para líquidos, und para lo que se cuenta.
- cantidad: la cantidad TOTAL comprada convertida a esa unidad base. Ejemplos: 2 paquetes de pan de 8 → 16 und; 1 paquete de 16 salchichas → 16 und; 2 bolsas de 1 kg → 2000 g; un galón de salsa ≈ 4000 g (si no dice peso); 3 gaseosas de 1,5 L con unidad und → 3; si la unidad es ml → 4500. Si el insumo se cuenta en und y la factura trae paquetes, cuenta las unidades que trae cada paquete cuando se puedan saber.
- costo_total: lo que realmente se pagó por ese renglón en pesos colombianos, entero, con IVA y restando los descuentos que la factura aplique a ese producto. En Colombia el punto separa miles: "12.900" son doce mil novecientos.
- confianza: "alta" si leíste todo con claridad; "media" si tuviste que suponer la presentación o el emparejamiento; "baja" si el texto está borroso o no estás seguro del valor.
- nota: una frase corta si algo requiere revisión (ej. "no se lee bien el precio", "supuse paquete de 8"). Si no, null.

Además:
- proveedor: el nombre comercial del establecimiento (ej. "Calypso del Caribe", "D1", "Makro"), no la razón social larga si hay un nombre más reconocible.
- fecha: la fecha de la factura en formato YYYY-MM-DD, o null si no aparece.
- medio_pago: cómo dice la factura que se pagó (efectivo, tarjeta débito/crédito → tarjeta, transferencia/Nequi/Daviplata → transferencia) o "desconocido".
- total_factura: el total a pagar que imprime la factura, o null.
- observaciones: una frase si algo general merece atención (ej. "la foto corta los últimos renglones", "los renglones no suman el total"). Si no, null.

No incluyas renglones que no son productos (subtotales, IVA, cambio, bolsas cobradas por ley se incluyen solo si aparecen como producto). Si la misma factura viene en varias fotos, no repitas renglones que se ven en dos fotos. Si la imagen no es una factura, devuelve items vacío y explica en observaciones.`;

function json(cuerpo: unknown, status = 200) {
  return Response.json(cuerpo, { status });
}

/** Lee una o varias fotos de una factura con Claude y la empareja con los insumos. Solo socios. */
export async function POST(request: Request) {
  const supabase = await supabaseServidor();
  const { data: sesion } = await supabase.auth.getClaims();
  const usuario = sesion?.claims?.sub;
  if (!usuario) return json({ error: "Tu sesión se cerró. Vuelve a entrar." }, 401);
  const { data: perfil } = await supabase.from("perfiles").select("rol, activo").eq("id", usuario).single();
  if (!perfil?.activo || perfil.rol !== "socio") return json({ error: "Solo los socios pueden leer facturas." }, 403);

  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ error: "Falta configurar ANTHROPIC_API_KEY en Vercel para poder leer facturas." }, 503);
  }

  let fotos: { data: string; media_type: TipoImagen }[];
  try {
    const cuerpo = (await request.json()) as { fotos?: { data?: unknown; media_type?: unknown }[] };
    fotos = (cuerpo.fotos ?? []).map((f) => {
      if (typeof f.data !== "string" || !f.data || f.data.length > MAX_BASE64) throw new Error("foto");
      if (!TIPOS.includes(f.media_type as TipoImagen)) throw new Error("tipo");
      return { data: f.data, media_type: f.media_type as TipoImagen };
    });
  } catch {
    return json({ error: "No se pudo leer la foto que se envió." }, 400);
  }
  if (fotos.length === 0 || fotos.length > MAX_FOTOS) {
    return json({ error: `Envía entre 1 y ${MAX_FOTOS} fotos de la misma factura.` }, 400);
  }

  const { data: insumos, error: errorInsumos } = await supabase
    .from("insumos")
    .select("id, nombre, unidad, familia, costo_unitario")
    .eq("activo", true)
    .order("nombre")
    .returns<InsumoCorto[]>();
  if (errorInsumos || !insumos) return json({ error: "No se pudieron cargar los insumos." }, 500);

  const lista = insumos
    .map((i) => `${i.id} | ${i.nombre} | ${i.unidad} | ${i.familia ?? "perro"} | costo actual ${Math.round(i.costo_unitario * 100) / 100} por ${i.unidad}`)
    .join("\n");

  const client = new Anthropic();
  let respuesta: Anthropic.Beta.BetaMessage;
  try {
    respuesta = await client.beta.messages
      .stream({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        // Si el modelo declina la solicitud, la API la reintenta sola con el
        // modelo de respaldo que Anthropic recomienda.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: INSTRUCCIONES,
        output_config: { format: { type: "json_schema", schema: ESQUEMA } },
        messages: [
          {
            role: "user",
            content: [
              ...fotos.map((f) => ({ type: "image" as const, source: { type: "base64" as const, ...f } })),
              {
                type: "text",
                text: `Insumos del negocio (id | nombre | unidad | familia | costo actual):\n${lista}\n\nLee la factura de ${fotos.length === 1 ? "la foto" : `las ${fotos.length} fotos`} y devuelve los renglones.`,
              },
            ],
          },
        ],
      })
      .finalMessage();
  } catch (e) {
    return json({ error: mensajeApi(e) }, 502);
  }

  if (respuesta.stop_reason === "refusal") {
    return json({ error: "No se pudo leer esta imagen. Intenta con otra foto o registra la compra a mano." }, 422);
  }
  if (respuesta.stop_reason === "max_tokens") {
    return json({ error: "La factura es muy larga para una sola lectura. Toma la foto por partes." }, 422);
  }

  const texto = respuesta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let leida: FacturaLeida;
  try {
    leida = JSON.parse(texto) as FacturaLeida;
  } catch {
    return json({ error: "La lectura llegó incompleta. Intenta de nuevo." }, 502);
  }

  // No confiar a ciegas: solo ids que existen, unidad del insumo y valores positivos.
  const porId = new Map(insumos.map((i) => [i.id, i]));
  leida.items = (leida.items ?? [])
    .filter((it) => it.cantidad > 0 && it.costo_total >= 0)
    .map((it): ItemLeido => {
      if (it.tipo === "equipo") return { ...it, insumo_id: null, nombre_sugerido: it.nombre_sugerido ?? it.descripcion };
      const ins = it.insumo_id !== null ? porId.get(it.insumo_id) : undefined;
      if (it.insumo_id !== null && !ins) return { ...it, insumo_id: null, nombre_sugerido: it.nombre_sugerido ?? it.descripcion };
      if (ins && ins.unidad !== it.unidad) {
        return { ...it, unidad: ins.unidad, confianza: "baja", nota: `Revisa la cantidad: debe ir en ${ins.unidad}.` };
      }
      return it;
    });
  if (leida.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(leida.fecha)) leida.fecha = null;

  return json(leida);
}

function mensajeApi(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "La llave de Anthropic (ANTHROPIC_API_KEY) no es válida.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La cuenta de Anthropic no tiene permiso para esta función.";
  if (e instanceof Anthropic.RateLimitError) return "Se hicieron muchas lecturas seguidas. Espera un minuto e intenta de nuevo.";
  if (e instanceof Anthropic.BadRequestError) {
    return /credit|billing|balance/i.test(e.message)
      ? "La cuenta de Anthropic se quedó sin saldo. Recárgala en console.anthropic.com."
      : "La foto no se pudo procesar. Intenta con otra.";
  }
  if (e instanceof Anthropic.APIConnectionError) return "No hubo conexión con el servicio que lee facturas. Intenta de nuevo.";
  if (e instanceof Anthropic.APIError) return "El servicio que lee facturas falló. Intenta de nuevo en un momento.";
  return "No se pudo leer la factura.";
}
