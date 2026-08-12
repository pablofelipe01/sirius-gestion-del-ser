/**
 * Generación del PDF de un permiso por Día Siriano.
 *
 * Los días sirianos son un beneficio ya concedido por la empresa: no pasan por
 * el flujo de autorización, así que el PDF se emite directamente como documento
 * autorizado y se archiva en S3 (ver uploadPdfPermisoSiriano).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LOGO_PROPORCION, LOGO_SIRIUS_BASE64 } from "./logo";

export interface PermisoSirianoPdfParams {
  /** ID del registro en Solicitud_Permiso (recXXX) — sirve de folio del documento. */
  solicitudId: string;
  nombre: string;
  cedula: string;
  cargo: string;
  idCore: string;
  /** Día siriano solicitado, ISO "YYYY-MM-DD". */
  fechaPermiso: string;
  /** Fecha en que se radicó la solicitud, ISO "YYYY-MM-DD". */
  fechaSolicitud: string;
  motivo: string;
  periodo: string;
  /** Saldo de días sirianos que queda tras este permiso. */
  saldoRestante: number;
  /** Firma del trabajador en PNG base64 (sin el prefijo data:). */
  firmaBase64?: string;
}

const VERDE = rgb(0.42, 0.71, 0.26); // #6bb543 — color institucional
const GRIS_TEXTO = rgb(0.22, 0.25, 0.32);
const GRIS_SUAVE = rgb(0.45, 0.5, 0.58);
const GRIS_LINEA = rgb(0.88, 0.9, 0.93);

const MARGEN = 56;
const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;
const LOGO_ALTO = 26; // alto del logo en el encabezado

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "2026-07-31" → "31 de julio de 2026". Sin Date, para no desfasar por zona horaria. */
function formatearFecha(iso: string): string {
  const [anio, mes, dia] = (iso ?? "").split("-").map(Number);
  if (!anio || !mes || !dia) return iso ?? "—";
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** Parte un texto en líneas que caben en el ancho dado. */
function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
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

/** Etiqueta gris arriba, valor en negrita abajo. Devuelve la nueva altura del cursor. */
function campo(
  page: PDFPage,
  x: number,
  y: number,
  etiqueta: string,
  valor: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): number {
  page.drawText(etiqueta.toUpperCase(), {
    x,
    y,
    size: 7.5,
    font: fonts.regular,
    color: GRIS_SUAVE,
  });
  page.drawText(valor || "—", {
    x,
    y: y - 14,
    size: 10.5,
    font: fonts.bold,
    color: GRIS_TEXTO,
  });
  return y - 36;
}

/**
 * Construye el PDF del permiso de día siriano ya autorizado.
 *
 * @returns Bytes del PDF listos para subir a S3.
 */
export async function generarPdfPermisoSiriano(
  params: PermisoSirianoPdfParams,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Permiso Día Siriano — ${params.nombre}`);
  doc.setSubject("Permiso de Día Siriano autorizado");
  doc.setProducer("Sirius Gestión del Ser");
  doc.setCreator("Sirius Gestión del Ser");

  const page = doc.addPage([ANCHO, ALTO]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };
  const anchoUtil = ANCHO - MARGEN * 2;

  // ── Encabezado ──
  page.drawRectangle({ x: 0, y: ALTO - 6, width: ANCHO, height: 6, color: VERDE });

  let y = ALTO - MARGEN - 10;

  // Mismo encabezado que el documento de autorización: los dos son documentos
  // oficiales y deben identificarse igual. Un logo ilegible no lo impide.
  try {
    const logo = await doc.embedPng(LOGO_SIRIUS_BASE64);
    page.drawImage(logo, {
      x: MARGEN,
      y: y + 6,
      height: LOGO_ALTO,
      width: LOGO_ALTO * LOGO_PROPORCION,
    });
  } catch (error) {
    console.error("[pdf dia-siriano] No se pudo incrustar el logo:", error);
  }

  page.drawText("SIRIUS REGENERATIVE SOLUTIONS", {
    x: MARGEN,
    y,
    size: 9,
    font: bold,
    color: GRIS_SUAVE,
  });
  y -= 26;

  page.drawText("Permiso por Día Siriano", { x: MARGEN, y, size: 20, font: bold, color: GRIS_TEXTO });
  y -= 18;

  page.drawText(`Documento autorizado · Folio ${params.solicitudId}`, {
    x: MARGEN,
    y,
    size: 9,
    font: regular,
    color: GRIS_SUAVE,
  });

  // Sello AUTORIZADO
  const selloAncho = 132;
  const selloX = ANCHO - MARGEN - selloAncho;
  page.drawRectangle({
    x: selloX,
    y: y - 6,
    width: selloAncho,
    height: 44,
    borderColor: VERDE,
    borderWidth: 1.5,
    color: rgb(0.94, 0.98, 0.9),
  });
  page.drawText("AUTORIZADO", {
    x: selloX + 18,
    y: y + 22,
    size: 13,
    font: bold,
    color: VERDE,
  });
  page.drawText("No requiere aprobación", {
    x: selloX + 15,
    y: y + 9,
    size: 7.5,
    font: regular,
    color: VERDE,
  });

  y -= 34;
  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: ANCHO - MARGEN, y },
    thickness: 1,
    color: GRIS_LINEA,
  });
  y -= 30;

  // ── Datos del colaborador ──
  page.drawText("DATOS DEL COLABORADOR", { x: MARGEN, y, size: 8.5, font: bold, color: VERDE });
  y -= 22;

  const col2 = MARGEN + anchoUtil / 2;
  campo(page, MARGEN, y, "Nombre completo", params.nombre, fonts);
  let yDer = campo(page, col2, y, "Cédula", params.cedula, fonts);
  y = campo(page, MARGEN, y - 36, "Cargo", params.cargo, fonts);
  yDer = campo(page, col2, yDer, "ID de empleado", params.idCore, fonts);
  y = Math.min(y, yDer) - 6;

  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: ANCHO - MARGEN, y },
    thickness: 1,
    color: GRIS_LINEA,
  });
  y -= 30;

  // ── Detalle del permiso ──
  page.drawText("DETALLE DEL PERMISO", { x: MARGEN, y, size: 8.5, font: bold, color: VERDE });
  y -= 22;

  campo(page, MARGEN, y, "Día siriano autorizado", formatearFecha(params.fechaPermiso), fonts);
  yDer = campo(page, col2, y, "Fecha de solicitud", formatearFecha(params.fechaSolicitud), fonts);
  y = campo(page, MARGEN, y - 36, "Periodo", params.periodo, fonts);
  yDer = campo(
    page,
    col2,
    yDer,
    "Saldo restante del periodo",
    `${params.saldoRestante} ${params.saldoRestante === 1 ? "día" : "días"}`,
    fonts,
  );
  y = Math.min(y, yDer);

  // Motivo — se recorta para que la firma y la nota legal quepan en la página
  page.drawText("MOTIVO", { x: MARGEN, y, size: 7.5, font: regular, color: GRIS_SUAVE });
  y -= 15;
  const MAX_LINEAS_MOTIVO = 8;
  const lineasMotivo = envolver(params.motivo || "—", regular, 10.5, anchoUtil);
  if (lineasMotivo.length > MAX_LINEAS_MOTIVO) {
    lineasMotivo.length = MAX_LINEAS_MOTIVO;
    lineasMotivo[MAX_LINEAS_MOTIVO - 1] += " […]";
  }
  for (const linea of lineasMotivo) {
    page.drawText(linea, { x: MARGEN, y, size: 10.5, font: regular, color: GRIS_TEXTO });
    y -= 15;
  }
  y -= 18;

  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: ANCHO - MARGEN, y },
    thickness: 1,
    color: GRIS_LINEA,
  });
  y -= 26;

  // ── Nota legal ──
  const nota =
    "Los días sirianos son un beneficio previamente concedido por Sirius Regenerative Solutions. " +
    "Por tratarse de un derecho ya pactado, este permiso no requiere autorización adicional de jefatura " +
    "y se emite como documento autorizado en el momento de la solicitud. El saldo del periodo se " +
    "descuenta automáticamente al radicarse.";
  for (const linea of envolver(nota, regular, 8.5, anchoUtil)) {
    page.drawText(linea, { x: MARGEN, y, size: 8.5, font: regular, color: GRIS_SUAVE });
    y -= 12;
  }

  // ── Firma del trabajador ──
  y -= 34;
  if (params.firmaBase64) {
    try {
      const firma = await doc.embedPng(Buffer.from(params.firmaBase64, "base64"));
      const escala = Math.min(180 / firma.width, 70 / firma.height);
      page.drawImage(firma, {
        x: MARGEN,
        y: y - firma.height * escala + 12,
        width: firma.width * escala,
        height: firma.height * escala,
      });
      y -= firma.height * escala - 6;
    } catch (error) {
      // Una firma ilegible no debe impedir la emisión del documento
      console.error("[pdf permiso-siriano] No se pudo incrustar la firma:", error);
    }
  }

  page.drawLine({
    start: { x: MARGEN, y },
    end: { x: MARGEN + 220, y },
    thickness: 1,
    color: GRIS_TEXTO,
  });
  y -= 13;
  page.drawText(params.nombre, { x: MARGEN, y, size: 9.5, font: bold, color: GRIS_TEXTO });
  y -= 12;
  page.drawText(`C.C. ${params.cedula} · Firma del trabajador`, {
    x: MARGEN,
    y,
    size: 8,
    font: regular,
    color: GRIS_SUAVE,
  });

  // ── Pie ──
  page.drawText(
    `Documento generado automáticamente por Sirius Gestión del Ser · ${new Date().toISOString()}`,
    { x: MARGEN, y: 40, size: 7, font: regular, color: GRIS_SUAVE },
  );

  return doc.save();
}
