import { cop, horaBogota } from "@/lib/formato";
import type { ResumenDia } from "@/lib/tipos";

/**
 * Dibuja el cierre de caja como imagen PNG (igual al de la app) para
 * compartirlo por WhatsApp. Todo se hace en el navegador con <canvas>.
 */

const C = {
  cafe: "#4d1101",
  cafe700: "#6b2a17",
  cafe300: "#b89484",
  cafe100: "#eadbd2",
  rojo: "#fd2322",
  mostaza: "#fda414",
  mostaza100: "#ffedc9",
  crema: "#fff8f0",
  crema200: "#f7eadb",
};

const ANCHO = 1080;
const M = 56; // margen
const fechaLarga = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" });

function familia(variable: string, respaldo: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${respaldo}` : respaldo;
}

function cargarImagen(src: string) {
  return new Promise<HTMLImageElement | null>((ok) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => ok(null);
    img.src = src;
  });
}

const dinero = (n: number) => (n < 0 ? `−${cop(-n)}` : cop(n));
const estado = (d: number) => (d === 0 ? "Cuadra" : d > 0 ? `Sobran ${cop(d)}` : `Faltan ${cop(-d)}`);

export async function imagenCierre(r: ResumenDia): Promise<Blob> {
  await document.fonts?.ready;
  const titulo = familia("--font-baloo", "system-ui, sans-serif");
  const etiqueta = familia("--font-poppins", "system-ui, sans-serif");
  const texto = familia("--font-nunito", "system-ui, sans-serif");
  const logo = await cargarImagen("/marca/logo.png");

  // Filas de cada bloque
  const efectivo: [string, number, boolean?][] = [
    ["Base", r.base_inicial],
    ["Ventas en efectivo", r.efectivo],
    ...(r.cobros_fiado.efectivo ? ([["Fiado cobrado en efectivo", r.cobros_fiado.efectivo]] as [string, number][]) : []),
    ...(r.retiros ? ([["Retiros", -r.retiros]] as [string, number][]) : []),
    ["Debería haber", r.efectivo_esperado, true],
    ["Hay (contado)", r.efectivo_contado, true],
  ];
  const bancos: [string, number, boolean?][] = [
    ["Bold · sistema", r.bold_esperado],
    ["Bold · recibido", r.bold_declarado],
    ["Nequi · sistema", r.nequi_esperado],
    ["Nequi · recibido", r.nequi_declarado],
    ["Debería haber", r.bancos_esperado, true],
    ["Recibido", r.bancos_declarado, true],
  ];
  const bebidas = r.productos.filter((p) => p.tipo !== "perro").map((p) => `${p.nombre}: ${p.cantidad}`);
  const extras: string[] = [];
  if (r.fiados.length) extras.push(`Fiado hoy (${cop(r.fiado)}): ${r.fiados.map((f) => `${f.cliente} ${cop(f.total)}`).join(", ")}`);
  if (r.retiros_detalle.length)
    extras.push(`Retiros: ${r.retiros_detalle.map((x) => `${x.tercero} ${cop(x.monto)}${x.motivo ? ` (${x.motivo})` : ""}`).join(", ")}`);
  if (r.notas) extras.push(`Notas: ${r.notas}`);

  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d")!;

  // Partir un texto largo en líneas que quepan
  const envolver = (t: string, ancho: number, fuente: string) => {
    ctx.font = fuente;
    const palabras = t.split(" ");
    const lineas: string[] = [];
    let actual = "";
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p;
      if (ctx.measureText(prueba).width > ancho && actual) {
        lineas.push(actual);
        actual = p;
      } else actual = prueba;
    }
    if (actual) lineas.push(actual);
    return lineas;
  };

  const fuenteExtra = `600 28px ${texto}`;
  const lineasBebidas = bebidas.length ? envolver(bebidas.join("  ·  "), ANCHO - 2 * M - 48, fuenteExtra) : [];
  const lineasExtras = extras.flatMap((e) => envolver(e, ANCHO - 2 * M, fuenteExtra));

  const altoBloque = (filas: number) => 96 + filas * 50 + 24;
  const alto =
    250 + // encabezado
    40 + 170 + // cifras
    (lineasBebidas.length ? 30 + lineasBebidas.length * 40 + 30 : 0) +
    40 + altoBloque(efectivo.length) +
    32 + altoBloque(bancos.length) +
    (lineasExtras.length ? 36 + lineasExtras.length * 40 : 0) +
    110; // pie

  const escala = 2;
  cv.width = ANCHO * escala;
  cv.height = alto * escala;
  ctx.scale(escala, escala);

  // Fondo
  ctx.fillStyle = C.crema;
  ctx.fillRect(0, 0, ANCHO, alto);

  // Encabezado café con el logo
  ctx.fillStyle = C.cafe;
  ctx.fillRect(0, 0, ANCHO, 250);
  if (logo) {
    const h = 150;
    const w = (logo.width / logo.height) * h;
    ctx.fillStyle = C.crema;
    ctx.beginPath();
    ctx.roundRect(M - 16, 50 - 12, w + 32, h + 24, 28);
    ctx.fill();
    ctx.drawImage(logo, M, 50, w, h);
  }
  ctx.fillStyle = C.crema;
  ctx.textAlign = "right";
  ctx.font = `800 54px ${titulo}`;
  ctx.fillText("Cierre de caja", ANCHO - M, 110);
  ctx.font = `600 28px ${etiqueta}`;
  ctx.fillStyle = C.mostaza;
  const fecha = fechaLarga.format(new Date(r.hasta));
  ctx.fillText(fecha.charAt(0).toUpperCase() + fecha.slice(1), ANCHO - M, 158);
  ctx.fillStyle = C.cafe100;
  ctx.font = `600 24px ${etiqueta}`;
  ctx.fillText(`${horaBogota(r.abierto_en)} a ${horaBogota(r.hasta)}${r.cerrado_por ? ` · ${r.cerrado_por}` : ""}`, ANCHO - M, 198);
  ctx.textAlign = "left";

  let y = 250 + 40;

  // Cifras: perros, bebidas, vendido
  const cifras: [string, string, string?][] = [
    ["PERROS", String(r.perros), r.adicionales ? `${r.adicionales} adicionales` : undefined],
    ["BEBIDAS", String(r.bebidas)],
    ["VENDIDO", cop(r.total), `${r.ventas} ventas`],
  ];
  const anchoCifra = (ANCHO - 2 * M - 2 * 20) / 3;
  cifras.forEach(([et, val, nota], i) => {
    const x = M + i * (anchoCifra + 20);
    ctx.fillStyle = C.crema200;
    ctx.beginPath();
    ctx.roundRect(x, y, anchoCifra, 150, 26);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = C.cafe700;
    ctx.font = `600 22px ${etiqueta}`;
    ctx.fillText(et, x + anchoCifra / 2, y + 40);
    ctx.fillStyle = i === 2 ? C.rojo : C.cafe;
    ctx.font = `800 ${i === 2 ? 46 : 54}px ${titulo}`;
    ctx.fillText(val, x + anchoCifra / 2, y + 98);
    if (nota) {
      ctx.fillStyle = C.cafe700;
      ctx.font = `400 22px ${texto}`;
      ctx.fillText(nota, x + anchoCifra / 2, y + 132);
    }
    ctx.textAlign = "left";
  });
  y += 170;

  // Bebidas por producto
  if (lineasBebidas.length) {
    y += 10;
    const h = lineasBebidas.length * 40 + 30;
    ctx.fillStyle = C.crema200;
    ctx.beginPath();
    ctx.roundRect(M, y, ANCHO - 2 * M, h, 22);
    ctx.fill();
    ctx.fillStyle = C.cafe;
    ctx.font = fuenteExtra;
    lineasBebidas.forEach((l, i) => ctx.fillText(l, M + 24, y + 44 + i * 40));
    y += h + 20;
  }

  const bloque = (tituloBloque: string, diferencia: number, filas: [string, number, boolean?][]) => {
    y += 30;
    const h = altoBloque(filas.length);
    ctx.strokeStyle = C.cafe100;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(M, y, ANCHO - 2 * M, h, 26);
    ctx.stroke();
    ctx.fillStyle = C.cafe700;
    ctx.font = `800 30px ${etiqueta}`;
    ctx.fillText(tituloBloque.toUpperCase(), M + 32, y + 58);
    // Estado
    const est = estado(diferencia);
    ctx.font = `800 26px ${etiqueta}`;
    const w = ctx.measureText(est).width + 44;
    ctx.fillStyle = diferencia === 0 ? C.cafe : "#ffe0de";
    ctx.beginPath();
    ctx.roundRect(ANCHO - M - 32 - w, y + 24, w, 50, 25);
    ctx.fill();
    ctx.fillStyle = diferencia === 0 ? C.crema : C.rojo;
    ctx.fillText(est, ANCHO - M - 32 - w + 22, y + 58);
    // Filas
    let fy = y + 96;
    filas.forEach(([et, val, fuerte]) => {
      if (fuerte) {
        ctx.strokeStyle = C.cafe100;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M + 32, fy + 2);
        ctx.lineTo(ANCHO - M - 32, fy + 2);
        ctx.stroke();
      }
      ctx.fillStyle = fuerte ? C.cafe : C.cafe700;
      ctx.font = fuerte ? `700 30px ${etiqueta}` : `400 30px ${texto}`;
      ctx.fillText(et, M + 32, fy + 38);
      ctx.textAlign = "right";
      ctx.font = fuerte ? `800 38px ${titulo}` : `600 30px ${texto}`;
      ctx.fillText(dinero(val), ANCHO - M - 32, fy + 40);
      ctx.textAlign = "left";
      fy += 50;
    });
    y += h;
  };

  bloque("Efectivo", r.diferencia_efectivo, efectivo);
  bloque("Bancos (Bold + Nequi)", r.diferencia_bancos, bancos);

  // Fiados, retiros y notas
  if (lineasExtras.length) {
    y += 36;
    ctx.fillStyle = C.cafe;
    ctx.font = fuenteExtra;
    lineasExtras.forEach((l, i) => ctx.fillText(l, M, y + 28 + i * 40));
    y += lineasExtras.length * 40;
  }

  // Pie
  ctx.fillStyle = C.mostaza;
  ctx.fillRect(0, alto - 70, ANCHO, 70);
  ctx.fillStyle = C.cafe;
  ctx.textAlign = "center";
  ctx.font = `700 24px ${etiqueta}`;
  ctx.fillText("Bendito Perro Caliente · cierre generado en la app", ANCHO / 2, alto - 26);

  return new Promise((ok, falla) => cv.toBlob((b) => (b ? ok(b) : falla(new Error("No se pudo crear la imagen"))), "image/png"));
}

/** Nombre de archivo del cierre, ej. cierre-2026-09-28.png */
export function nombreImagenCierre(r: ResumenDia) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(r.hasta));
  return `cierre-${d}.png`;
}
