/**
 * Maqueta institucional de los documentos PDF de Gestión del Ser.
 *
 * Reproduce el formato que ya circulaba en HTML: encabezado con logo · título
 * centrado · QR, rejilla de datos en dos columnas, bloques con filete lateral,
 * tarjetas de firma y pie corporativo.
 *
 * Vive aparte porque lo usan los dos documentos que emite el sistema —el de
 * autorización y el de día siriano—. Si cada uno trajera su propia maqueta, el
 * mismo trabajador recibiría dos papeles con distinta cara según por qué camino
 * pidió el permiso, y cualquier ajuste habría que hacerlo dos veces.
 *
 * Las medidas del HTML están en píxeles CSS y aquí en puntos PDF: 1 px = 0.75 pt,
 * que es la conversión que ya aplicaba `@page` al imprimir. Por eso los tamaños
 * de fuente son 19.5 / 10.5 / 9.75 y no números redondos.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { LOGO_PROPORCION, LOGO_SIRIUS_BASE64 } from "./logo";
import { QR_SIRIUS_BASE64 } from "./qr";

export const RAZON_SOCIAL = "Sirius Regenerative Solutions S.A.S ZOMAC";
export const LEMA = "Profesionalismo · Transparencia · Innovación";

// Paleta de la maqueta HTML (variables :root)
export const PRIMARY = rgb(0.169, 0.192, 0.486); // #2b317c
export const ACCENT = rgb(0.318, 0.176, 0.659); // #512da8
export const DANGER = rgb(0.827, 0.184, 0.184); // #d32f2f
export const OK = rgb(0.263, 0.714, 0.388); // #43b663
export const NEUTRO = rgb(0.392, 0.455, 0.545); // #64748b — estado sin decisión clara
export const TEXTO = rgb(0.137, 0.157, 0.357); // #23285b
export const SUBTITULO = rgb(0.38, 0.416, 0.596); // #616a98
export const GRID_FONDO = rgb(0.953, 0.965, 0.98); // #f3f6fa
export const GRID_LINEA = rgb(0.894, 0.914, 0.961); // #e4e9f5
export const MOTIVO_FONDO = rgb(0.933, 0.945, 0.988); // #e4e9fc → #f8f8fd
export const FIRMA_FONDO = rgb(0.957, 0.973, 0.996); // #f4f8fe
export const FIRMA_BORDE = rgb(0.702, 0.792, 0.969); // #b3caf7
export const FIRMA_DESC = rgb(0.49, 0.529, 0.655); // #7d87a7
export const PIE_TEXTO = rgb(0.655, 0.678, 0.788); // #a7adc9
export const PIE_LINEA = rgb(0.878, 0.91, 0.969); // #e0e8f7
export const BLANCO = rgb(1, 1, 1);

export const ANCHO = 595.28; // A4 en puntos
export const ALTO = 841.89;
export const MARGEN = 34; // 12mm de @page
export const ANCHO_UTIL = ANCHO - MARGEN * 2;
export const CENTRO = ANCHO / 2;
export const PIE = 56; // espacio reservado al pie de página
const LOGO_ALTO = 40;
const QR_LADO = 44;

export type Fuentes = { regular: PDFFont; bold: PDFFont };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-07-31" → "31 de julio de 2026". Sin Date, para no desfasar por zona horaria. */
export function formatearFechaLarga(iso: string): string {
  const [anio, mes, dia] = (iso ?? "").split("-").map(Number);
  if (!anio || !mes || !dia) return iso || "—";
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** Parte un texto en líneas que caben en el ancho dado. */
export function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let linea = "";
    for (const palabra of parrafo.split(/\s+/)) {
      const tentativa = linea ? `${linea} ${palabra}` : palabra;
      if (font.widthOfTextAtSize(tentativa, size) > ancho && linea) {
        lineas.push(linea);
        linea = palabra;
      } else {
        linea = tentativa;
      }
    }
    lineas.push(linea);
  }
  return lineas;
}

/** Recorta a una línea con puntos suspensivos si no cabe. */
export function recortar(texto: string, font: PDFFont, size: number, ancho: number): string {
  if (font.widthOfTextAtSize(texto, size) <= ancho) return texto;
  let corte = texto;
  while (corte.length > 1 && font.widthOfTextAtSize(`${corte}…`, size) > ancho) {
    corte = corte.slice(0, -1);
  }
  return `${corte}…`;
}

interface CajaParams {
  x: number;
  /** Borde superior de la caja, en coordenadas PDF. */
  yTop: number;
  ancho: number;
  alto: number;
  radio: number;
  color?: RGB;
  borderColor?: RGB;
  borderWidth?: number;
}

/**
 * Rectángulo con esquinas redondeadas — pdf-lib no las trae, así que se dibujan
 * como trazado SVG. `drawSvgPath` interpreta la Y hacia abajo desde `y`, por eso
 * el trazado se escribe con el origen en la esquina superior izquierda.
 */
export function caja(page: PDFPage, p: CajaParams): void {
  const { ancho: w, alto: h } = p;
  const r = Math.min(p.radio, w / 2, h / 2);
  const trazado =
    `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} ` +
    `V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} ` +
    `H ${r} A ${r} ${r} 0 0 1 0 ${h - r} ` +
    `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  page.drawSvgPath(trazado, {
    x: p.x,
    y: p.yTop,
    color: p.color,
    borderColor: p.borderColor,
    borderWidth: p.borderWidth,
  });
}

/** Dibuja un texto centrado en el ancho de página. */
export function textoCentrado(
  page: PDFPage,
  texto: string,
  y: number,
  size: number,
  font: PDFFont,
  color: RGB,
): void {
  page.drawText(texto, {
    x: CENTRO - font.widthOfTextAtSize(texto, size) / 2,
    y,
    size,
    font,
    color,
  });
}

/**
 * pdf-lib no maneja saltos de página: este cursor los abre cuando el contenido
 * ya no cabe, de modo que una lista larga de días de compensación no se pierda.
 */
export class Cursor {
  page: PDFPage;
  y: number;

  constructor(private doc: PDFDocument) {
    this.page = this.doc.addPage([ANCHO, ALTO]);
    this.y = ALTO - MARGEN;
  }

  /** Asegura `alto` puntos libres; abre página nueva si no caben. */
  espacio(alto: number): void {
    if (this.y - alto < PIE) {
      this.page = this.doc.addPage([ANCHO, ALTO]);
      this.y = ALTO - MARGEN;
    }
  }
}

/**
 * Encabezado: logo a la izquierda, título y razón social centrados, QR a la
 * derecha, y píldora con el estado del documento.
 *
 * Los dos gráficos van incrustados en el código; si alguno fuera ilegible el
 * documento se sigue emitiendo, porque perder el trámite es peor que emitirlo
 * sin marca.
 */
export async function encabezado(
  doc: PDFDocument,
  cursor: Cursor,
  datos: { titulo: string; estado: string; colorEstado: RGB },
  fonts: Fuentes,
): Promise<void> {
  const yTop = cursor.y;

  try {
    const logo = await doc.embedPng(LOGO_SIRIUS_BASE64);
    cursor.page.drawImage(logo, {
      x: MARGEN,
      y: yTop - LOGO_ALTO,
      height: LOGO_ALTO,
      width: LOGO_ALTO * LOGO_PROPORCION,
    });
  } catch (error) {
    console.error("[pdf] No se pudo incrustar el logo:", error);
  }

  try {
    const qr = await doc.embedPng(QR_SIRIUS_BASE64);
    cursor.page.drawImage(qr, {
      x: ANCHO - MARGEN - QR_LADO,
      y: yTop - QR_LADO,
      height: QR_LADO,
      width: QR_LADO,
    });
  } catch (error) {
    console.error("[pdf] No se pudo incrustar el QR:", error);
  }

  textoCentrado(cursor.page, datos.titulo.toUpperCase(), yTop - 16, 19.5, fonts.bold, PRIMARY);
  textoCentrado(cursor.page, RAZON_SOCIAL, yTop - 30, 9.5, fonts.bold, SUBTITULO);

  const estado = (datos.estado || "N/A").toUpperCase();
  const anchoEstado = fonts.bold.widthOfTextAtSize(estado, 9.75) + 22;
  const etiqueta = "Estado:";
  const anchoEtiqueta = fonts.regular.widthOfTextAtSize(etiqueta, 10) + 6;
  const x = CENTRO - (anchoEstado + anchoEtiqueta) / 2;

  cursor.page.drawText(etiqueta, {
    x,
    y: yTop - 48,
    size: 10,
    font: fonts.regular,
    color: TEXTO,
  });
  caja(cursor.page, {
    x: x + anchoEtiqueta,
    yTop: yTop - 39,
    ancho: anchoEstado,
    alto: 16,
    radio: 8,
    color: datos.colorEstado,
  });
  cursor.page.drawText(estado, {
    x: x + anchoEtiqueta + 11,
    y: yTop - 48.5,
    size: 9.75,
    font: fonts.bold,
    color: BLANCO,
  });

  cursor.y = yTop - Math.max(LOGO_ALTO, QR_LADO, 60) - 14;
}

export interface Celda {
  etiqueta: string;
  valor: string;
  /** Ocupa las dos columnas — para compromisos que no se pueden recortar. */
  completa?: boolean;
}

const FILA_ALTO = 21;
const GRID_PADDING = 10;

/**
 * Rejilla de datos: etiqueta en versalitas a la izquierda, valor a la derecha,
 * filete inferior por celda. Es el `.info-grid` de la maqueta.
 */
export function rejilla(cursor: Cursor, celdas: Celda[], fonts: Fuentes): void {
  if (celdas.length === 0) return;

  // Las filas se arman antes de dibujar porque el fondo necesita el alto total.
  const filas: Celda[][] = [];
  for (const celda of celdas) {
    const ultima = filas[filas.length - 1];
    if (celda.completa || !ultima || ultima.length === 2 || ultima[0].completa) {
      filas.push([celda]);
    } else {
      ultima.push(celda);
    }
  }

  const alto = filas.length * FILA_ALTO + GRID_PADDING * 2;
  cursor.espacio(alto + 12);

  const yTop = cursor.y;
  caja(cursor.page, {
    x: MARGEN,
    yTop,
    ancho: ANCHO_UTIL,
    alto,
    radio: 10.5,
    color: GRID_FONDO,
  });

  const gap = 18;
  const anchoCol = (ANCHO_UTIL - GRID_PADDING * 2 - gap) / 2;

  filas.forEach((fila, indiceFila) => {
    const yFila = yTop - GRID_PADDING - indiceFila * FILA_ALTO;
    fila.forEach((celda, indiceCol) => {
      const x = MARGEN + GRID_PADDING + indiceCol * (anchoCol + gap);
      const ancho = celda.completa ? ANCHO_UTIL - GRID_PADDING * 2 : anchoCol;
      // En una celda de ancho completo la etiqueta no debe crecer con ella: si
      // se llevara el 42 % dejaría el valor arrancando en mitad de la página.
      const anchoEtiqueta = ancho * (celda.completa ? 0.2 : 0.38);
      const anchoValor = ancho - anchoEtiqueta - 6;

      cursor.page.drawText(
        recortar(celda.etiqueta.toUpperCase(), fonts.bold, 7.5, anchoEtiqueta),
        { x, y: yFila - 12, size: 7.5, font: fonts.bold, color: ACCENT },
      );
      // Antes de recortar se baja el cuerpo del texto: un nombre largo entra
      // completo a 8.5 pt, y un nombre a medias en un documento de identidad es
      // peor que una línea un punto más pequeña.
      const valor = celda.valor || "—";
      const size =
        [9.5, 9, 8.5, 8].find(
          (t) => fonts.regular.widthOfTextAtSize(valor, t) <= anchoValor,
        ) ?? 8;
      cursor.page.drawText(recortar(valor, fonts.regular, size, anchoValor), {
        x: x + anchoEtiqueta + 6,
        y: yFila - 12,
        size,
        font: fonts.regular,
        color: TEXTO,
      });

      // La última fila no lleva filete: en la maqueta el borde inferior se
      // suprime para que la rejilla no termine en una línea suelta.
      if (indiceFila < filas.length - 1) {
        cursor.page.drawLine({
          start: { x, y: yFila - FILA_ALTO + 4 },
          end: { x: x + ancho, y: yFila - FILA_ALTO + 4 },
          thickness: 0.7,
          color: GRID_LINEA,
        });
      }
    });
  });

  cursor.y = yTop - alto - 12;
}

/**
 * Bloque de texto con filete lateral en color — el `.motivo-section` de la
 * maqueta. Sirve para el motivo del trabajador, las observaciones de quien
 * autoriza y las notas legales.
 *
 * @param maxLineas Recorta el texto con "[…]" si se pasa. Úsalo cuando el
 *   documento deba caber en una página.
 */
export function bloqueTexto(
  cursor: Cursor,
  etiqueta: string,
  texto: string,
  fonts: Fuentes,
  maxLineas?: number,
): void {
  const anchoTexto = ANCHO_UTIL - 28;
  const lineas = envolver(texto, fonts.regular, 10, anchoTexto);
  if (maxLineas && lineas.length > maxLineas) {
    lineas.length = maxLineas;
    lineas[maxLineas - 1] += " […]";
  }
  const alto = lineas.length * 13 + 32;
  cursor.espacio(alto + 12);

  const yTop = cursor.y;
  caja(cursor.page, {
    x: MARGEN,
    yTop,
    ancho: ANCHO_UTIL,
    alto,
    radio: 7.5,
    color: MOTIVO_FONDO,
  });
  // Filete izquierdo de 5 px (3.75 pt) en el color institucional
  cursor.page.drawRectangle({
    x: MARGEN,
    y: yTop - alto,
    width: 3.75,
    height: alto,
    color: PRIMARY,
  });

  cursor.page.drawText(etiqueta, {
    x: MARGEN + 16,
    y: yTop - 16,
    size: 9.5,
    font: fonts.bold,
    color: TEXTO,
  });
  let y = yTop - 31;
  for (const linea of lineas) {
    cursor.page.drawText(linea, { x: MARGEN + 16, y, size: 10, font: fonts.regular, color: TEXTO });
    y -= 13;
  }
  cursor.y = yTop - alto - 12;
}

/** Título de sección, en el color institucional. */
export function seccion(cursor: Cursor, titulo: string, bold: PDFFont): void {
  cursor.espacio(30);
  cursor.page.drawText(titulo.toUpperCase(), {
    x: MARGEN,
    y: cursor.y - 10,
    size: 8.5,
    font: bold,
    color: PRIMARY,
  });
  cursor.y -= 24;
}

/** Nota al pie de una sección, en gris pequeño. */
export function notaAlPie(cursor: Cursor, texto: string, fonts: Fuentes): void {
  for (const linea of envolver(texto, fonts.regular, 8, ANCHO_UTIL)) {
    cursor.espacio(13);
    cursor.page.drawText(linea, {
      x: MARGEN,
      y: cursor.y - 8,
      size: 8,
      font: fonts.regular,
      color: SUBTITULO,
    });
    cursor.y -= 11;
  }
  cursor.y -= 8;
}

export const ALTO_FIRMA = 105;
const GAP_FIRMAS = 21;

/** Ancho de cada tarjeta cuando van dos firmas lado a lado. */
export const ANCHO_FIRMA = (ANCHO_UTIL - GAP_FIRMAS) / 2;

export interface DatosFirma {
  /** Rótulo de la tarjeta: "Solicitante", "Gestión del SER". */
  titulo: string;
  nombre: string;
  cedula: string;
  /** Rol o descripción bajo la cédula. */
  rol: string;
  /** PNG del trazo. Puede faltar: la tarjeta sigue identificando a quien firma. */
  png?: Uint8Array | null;
}

/** Tarjeta de firma: título, trazo, línea, nombre, cédula y rol. */
export async function tarjetaFirma(
  doc: PDFDocument,
  page: PDFPage,
  x: number,
  yTop: number,
  ancho: number,
  datos: DatosFirma,
  fonts: Fuentes,
): Promise<void> {
  caja(page, {
    x,
    yTop,
    ancho,
    alto: ALTO_FIRMA,
    radio: 9,
    color: FIRMA_FONDO,
    borderColor: FIRMA_BORDE,
    borderWidth: 1.1,
  });

  const centrar = (texto: string, font: PDFFont, size: number) =>
    x + (ancho - font.widthOfTextAtSize(texto, size)) / 2;

  const titulo = datos.titulo.toUpperCase();
  page.drawText(titulo, {
    x: centrar(titulo, fonts.bold, 10),
    y: yTop - 16,
    size: 10,
    font: fonts.bold,
    color: PRIMARY,
  });

  if (datos.png) {
    try {
      // Se copia a un Uint8Array del mismo realm: pdf-lib comprueba el tipo con
      // instanceof, y un Buffer de Node no lo pasa cuando el código corre en
      // otro realm (jsdom en los tests). Sin esto la firma se descartaba en
      // silencio, porque el catch de abajo se traga el error.
      const imagen = await doc.embedPng(new Uint8Array(datos.png));
      const escala = Math.min((ancho - 24) / imagen.width, 45 / imagen.height);
      const w = imagen.width * escala;
      const h = imagen.height * escala;
      page.drawImage(imagen, { x: x + (ancho - w) / 2, y: yTop - 28 - h, width: w, height: h });
    } catch (error) {
      // Una firma ilegible no debe impedir la emisión del documento
      console.error("[pdf] No se pudo incrustar una firma:", error);
    }
  }

  // Los datos del firmante van al pie de la tarjeta, bajo una línea de firma:
  // el trazo puede faltar, pero quién firma y con qué cédula nunca.
  const yLinea = yTop - ALTO_FIRMA + 38;
  page.drawLine({
    start: { x: x + 14, y: yLinea },
    end: { x: x + ancho - 14, y: yLinea },
    thickness: 0.8,
    color: FIRMA_BORDE,
  });

  const nombre = recortar(datos.nombre || "—", fonts.bold, 9, ancho - 20);
  page.drawText(nombre, {
    x: centrar(nombre, fonts.bold, 9),
    y: yLinea - 12,
    size: 9,
    font: fonts.bold,
    color: TEXTO,
  });

  const cedula = `C.C. ${datos.cedula || "—"}`;
  page.drawText(cedula, {
    x: centrar(cedula, fonts.regular, 8),
    y: yLinea - 22,
    size: 8,
    font: fonts.regular,
    color: FIRMA_DESC,
  });

  const rol = recortar(datos.rol, fonts.regular, 8, ancho - 20);
  page.drawText(rol, {
    x: centrar(rol, fonts.regular, 8),
    y: yLinea - 32,
    size: 8,
    font: fonts.regular,
    color: FIRMA_DESC,
  });
}

/** Pie corporativo: filete, razón social y lema, centrados. */
export function pieCorporativo(cursor: Cursor, fonts: Fuentes): void {
  cursor.page.drawLine({
    start: { x: MARGEN, y: cursor.y },
    end: { x: ANCHO - MARGEN, y: cursor.y },
    thickness: 1,
    color: PIE_LINEA,
  });
  textoCentrado(cursor.page, RAZON_SOCIAL, cursor.y - 14, 9.5, fonts.bold, PIE_TEXTO);
  textoCentrado(cursor.page, LEMA, cursor.y - 27, 9.5, fonts.bold, ACCENT);
  cursor.y -= 40;
}

/** Folio a la izquierda y numeración a la derecha, en todas las páginas. */
export function paginacion(doc: PDFDocument, leyenda: string, regular: PDFFont): void {
  const paginas = doc.getPages();
  paginas.forEach((page, indice) => {
    page.drawText(leyenda, { x: MARGEN, y: 24, size: 7, font: regular, color: PIE_TEXTO });
    const numero = `Página ${indice + 1} de ${paginas.length}`;
    page.drawText(numero, {
      x: ANCHO - MARGEN - regular.widthOfTextAtSize(numero, 7),
      y: 24,
      size: 7,
      font: regular,
      color: PIE_TEXTO,
    });
  });
}
