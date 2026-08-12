/**
 * Generación del documento oficial de una solicitud de permiso o vacaciones
 * resuelta por el flujo de autorización.
 *
 * A diferencia del PDF de día siriano, aquí sí hubo una decisión de jefatura:
 * el documento lleva el sello de la decisión y las dos firmas — la del
 * trabajador que solicitó y la de quien autorizó o rechazó.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { LOGO_PROPORCION, LOGO_SIRIUS_BASE64 } from "./logo";

/**
 * Solo permisos y vacaciones generan documento de autorización: las novedades de
 * nómina son un registro informativo, no un trámite que se apruebe o rechace.
 */
export type TipoSolicitudPdf = "permiso" | "vacaciones";

export interface DiaCompensacionPdf {
  fecha: string;
  horas: number;
  descripcion: string;
}

export interface AutorizacionPdfParams {
  tipo: TipoSolicitudPdf;
  /** ID del registro en Airtable (recXXX) — sirve de folio del documento. */
  solicitudId: string;
  decision: "aprobar" | "rechazar";
  /** Estado con el que quedó el registro en Airtable (ej: "Concedido"). */
  estado: string;
  solicitante: { nombre: string; cedula: string; cargo: string; idCore: string };
  /** Pares etiqueta/valor con el detalle propio del tipo de solicitud. */
  detalles: { etiqueta: string; valor: string }[];
  /** Motivo que expuso el trabajador en la solicitud. */
  motivo?: string;
  /** Observaciones de quien autorizó. */
  comentario?: string;
  /** Solo permisos: condiciones con las que se concedió. */
  remunerado?: boolean;
  compensado?: boolean;
  /** Nombre del plan con el que el trabajador repone el tiempo. */
  planCompensacion?: string;
  /**
   * Aclaración bajo el plan de reposición. Se usa al reemitir el documento
   * cuando el plan se definió después de la autorización: sin ella, el lector no
   * entendería por qué existen dos versiones del mismo documento.
   */
  notaCompensacion?: string;
  diasCompensacion?: DiaCompensacionPdf[];
  autorizador: { nombre: string; cedula: string; cargo: string };
  /** Fecha de la autorización, ISO "YYYY-MM-DD". */
  fechaAutorizacion: string;
  /** PNG de la firma del trabajador. */
  firmaTrabajador?: Buffer | null;
  /** PNG de la firma de quien autorizó. */
  firmaAutorizador?: Buffer | null;
}

const COLOR_MODULO: Record<TipoSolicitudPdf, RGB> = {
  permiso: rgb(0.102, 0.318, 0.659), // #1a51a8
  vacaciones: rgb(0.42, 0.71, 0.26), // #6bb543
};

const TITULO: Record<TipoSolicitudPdf, string> = {
  permiso: "Solicitud de Permiso",
  vacaciones: "Solicitud de Vacaciones",
};

const VERDE = rgb(0.02, 0.59, 0.41);
const ROJO = rgb(0.88, 0.11, 0.28);
const GRIS_TEXTO = rgb(0.22, 0.25, 0.32);
const GRIS_SUAVE = rgb(0.45, 0.5, 0.58);
const GRIS_LINEA = rgb(0.88, 0.9, 0.93);
const GRIS_FONDO = rgb(0.97, 0.98, 0.99);

const MARGEN = 56;
const ANCHO = 595.28; // A4 en puntos
const ALTO = 841.89;
const PIE = 70; // espacio reservado al pie de página
const LOGO_ALTO = 26; // alto del logo en el encabezado

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

/**
 * pdf-lib no maneja saltos de página: este cursor los abre cuando el contenido
 * ya no cabe, de modo que una lista larga de días de compensación no se pierda.
 */
class Cursor {
  page: PDFPage;
  y: number;

  constructor(private doc: PDFDocument, private acento: RGB) {
    this.page = this.nuevaPagina();
    this.y = ALTO - MARGEN;
  }

  private nuevaPagina(): PDFPage {
    const page = this.doc.addPage([ANCHO, ALTO]);
    page.drawRectangle({ x: 0, y: ALTO - 6, width: ANCHO, height: 6, color: this.acento });
    return page;
  }

  /** Asegura `alto` puntos libres; abre página nueva si no caben. */
  espacio(alto: number): void {
    if (this.y - alto < PIE) {
      this.page = this.nuevaPagina();
      this.y = ALTO - MARGEN;
    }
  }
}

const ANCHO_UTIL = ANCHO - MARGEN * 2;

/** Etiqueta gris arriba, valor en negrita abajo. */
function campo(
  page: PDFPage,
  x: number,
  y: number,
  etiqueta: string,
  valor: string,
  fonts: { regular: PDFFont; bold: PDFFont },
  anchoValor = ANCHO_UTIL / 2 - 12,
): void {
  page.drawText(etiqueta.toUpperCase(), { x, y, size: 7.5, font: fonts.regular, color: GRIS_SUAVE });
  // El valor puede ser largo (cargos, tipos de permiso): se recorta a una línea
  let texto = valor || "—";
  while (texto.length > 1 && fonts.bold.widthOfTextAtSize(texto, 10.5) > anchoValor) {
    texto = texto.slice(0, -2);
  }
  if (texto !== (valor || "—")) texto += "…";
  page.drawText(texto, { x, y: y - 14, size: 10.5, font: fonts.bold, color: GRIS_TEXTO });
}

/** Título de sección en el color del módulo. */
function seccion(cursor: Cursor, titulo: string, acento: RGB, bold: PDFFont): void {
  cursor.espacio(40);
  cursor.page.drawText(titulo.toUpperCase(), {
    x: MARGEN,
    y: cursor.y,
    size: 8.5,
    font: bold,
    color: acento,
  });
  cursor.y -= 22;
}

/** Línea divisoria horizontal. */
function divisor(cursor: Cursor): void {
  cursor.espacio(20);
  cursor.page.drawLine({
    start: { x: MARGEN, y: cursor.y },
    end: { x: ANCHO - MARGEN, y: cursor.y },
    thickness: 1,
    color: GRIS_LINEA,
  });
  cursor.y -= 24;
}

/** Bloque de texto largo dentro de una caja gris. */
function bloqueTexto(
  cursor: Cursor,
  etiqueta: string,
  texto: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): void {
  const lineas = envolver(texto, fonts.regular, 10, ANCHO_UTIL - 24);
  const alto = lineas.length * 14 + 34;
  cursor.espacio(alto);

  cursor.page.drawRectangle({
    x: MARGEN,
    y: cursor.y - alto + 14,
    width: ANCHO_UTIL,
    height: alto,
    color: GRIS_FONDO,
  });
  cursor.page.drawText(etiqueta.toUpperCase(), {
    x: MARGEN + 12,
    y: cursor.y,
    size: 7.5,
    font: fonts.regular,
    color: GRIS_SUAVE,
  });
  cursor.y -= 17;
  for (const linea of lineas) {
    cursor.page.drawText(linea, {
      x: MARGEN + 12,
      y: cursor.y,
      size: 10,
      font: fonts.regular,
      color: GRIS_TEXTO,
    });
    cursor.y -= 14;
  }
  cursor.y -= 16;
}

/** Bloque de firma: imagen (si hay), línea, nombre, cédula y rol. */
async function bloqueFirma(
  doc: PDFDocument,
  cursor: Cursor,
  x: number,
  ancho: number,
  png: Buffer | null | undefined,
  nombre: string,
  cedula: string,
  rol: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): Promise<void> {
  const yBase = cursor.y;

  if (png) {
    try {
      const imagen = await doc.embedPng(png);
      const escala = Math.min((ancho - 20) / imagen.width, 54 / imagen.height);
      cursor.page.drawImage(imagen, {
        x,
        y: yBase + 6,
        width: imagen.width * escala,
        height: imagen.height * escala,
      });
    } catch (error) {
      // Una firma ilegible no debe impedir la emisión del documento
      console.error("[pdf autorizacion] No se pudo incrustar una firma:", error);
    }
  }

  cursor.page.drawLine({
    start: { x, y: yBase },
    end: { x: x + ancho, y: yBase },
    thickness: 1,
    color: GRIS_TEXTO,
  });
  cursor.page.drawText(nombre || "—", {
    x,
    y: yBase - 13,
    size: 9.5,
    font: fonts.bold,
    color: GRIS_TEXTO,
  });
  cursor.page.drawText(`C.C. ${cedula || "—"}`, {
    x,
    y: yBase - 25,
    size: 8,
    font: fonts.regular,
    color: GRIS_SUAVE,
  });
  cursor.page.drawText(rol, { x, y: yBase - 36, size: 8, font: fonts.regular, color: GRIS_SUAVE });
}

/**
 * Construye el PDF del documento oficial de la solicitud resuelta.
 *
 * @returns Bytes del PDF listos para subir a S3.
 */
export async function generarPdfAutorizacion(
  params: AutorizacionPdfParams,
): Promise<Uint8Array> {
  const aprobado = params.decision === "aprobar";
  const acento = COLOR_MODULO[params.tipo];
  const colorDecision = aprobado ? VERDE : ROJO;

  const doc = await PDFDocument.create();
  doc.setTitle(`${TITULO[params.tipo]} — ${params.solicitante.nombre}`);
  doc.setSubject(`${TITULO[params.tipo]} · ${params.estado}`);
  doc.setProducer("Sirius Gestión del Ser");
  doc.setCreator("Sirius Gestión del Ser");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const cursor = new Cursor(doc, acento);
  cursor.y = ALTO - MARGEN - 10;

  // ── Encabezado ──
  // El logo va sobre la razón social, en el espacio libre entre la franja de
  // color y el título. Si el PNG fuera ilegible se sigue emitiendo: un documento
  // sin logo es peor que ninguno, pero perder la autorización lo es más.
  try {
    const logo = await doc.embedPng(LOGO_SIRIUS_BASE64);
    cursor.page.drawImage(logo, {
      x: MARGEN,
      y: cursor.y + 6,
      height: LOGO_ALTO,
      width: LOGO_ALTO * LOGO_PROPORCION,
    });
  } catch (error) {
    console.error("[pdf autorizacion] No se pudo incrustar el logo:", error);
  }

  cursor.page.drawText("SIRIUS REGENERATIVE SOLUTIONS", {
    x: MARGEN,
    y: cursor.y,
    size: 9,
    font: bold,
    color: GRIS_SUAVE,
  });
  cursor.y -= 26;

  cursor.page.drawText(TITULO[params.tipo], {
    x: MARGEN,
    y: cursor.y,
    size: 20,
    font: bold,
    color: GRIS_TEXTO,
  });
  cursor.y -= 18;

  cursor.page.drawText(`Folio ${params.solicitudId}`, {
    x: MARGEN,
    y: cursor.y,
    size: 9,
    font: regular,
    color: GRIS_SUAVE,
  });

  // Sello con la decisión
  const sello = params.estado.toUpperCase();
  const selloAncho = Math.max(132, bold.widthOfTextAtSize(sello, 13) + 36);
  const selloX = ANCHO - MARGEN - selloAncho;
  cursor.page.drawRectangle({
    x: selloX,
    y: cursor.y - 6,
    width: selloAncho,
    height: 44,
    borderColor: colorDecision,
    borderWidth: 1.5,
    color: aprobado ? rgb(0.94, 0.99, 0.96) : rgb(1, 0.95, 0.96),
  });
  cursor.page.drawText(sello, {
    x: selloX + (selloAncho - bold.widthOfTextAtSize(sello, 13)) / 2,
    y: cursor.y + 22,
    size: 13,
    font: bold,
    color: colorDecision,
  });
  const pieSello = formatearFechaLarga(params.fechaAutorizacion);
  cursor.page.drawText(pieSello, {
    x: selloX + (selloAncho - regular.widthOfTextAtSize(pieSello, 7.5)) / 2,
    y: cursor.y + 9,
    size: 7.5,
    font: regular,
    color: colorDecision,
  });

  cursor.y -= 34;
  divisor(cursor);

  // ── Datos del colaborador ──
  seccion(cursor, "Datos del colaborador", acento, bold);
  const col2 = MARGEN + ANCHO_UTIL / 2;
  campo(cursor.page, MARGEN, cursor.y, "Nombre completo", params.solicitante.nombre, fonts);
  campo(cursor.page, col2, cursor.y, "Cédula", params.solicitante.cedula, fonts);
  cursor.y -= 36;
  campo(cursor.page, MARGEN, cursor.y, "Cargo", params.solicitante.cargo, fonts);
  campo(cursor.page, col2, cursor.y, "ID de empleado", params.solicitante.idCore, fonts);
  cursor.y -= 30;

  divisor(cursor);

  // ── Detalle de la solicitud ──
  seccion(cursor, "Detalle de la solicitud", acento, bold);
  for (let i = 0; i < params.detalles.length; i += 2) {
    cursor.espacio(40);
    campo(cursor.page, MARGEN, cursor.y, params.detalles[i].etiqueta, params.detalles[i].valor, fonts);
    if (params.detalles[i + 1]) {
      campo(
        cursor.page,
        col2,
        cursor.y,
        params.detalles[i + 1].etiqueta,
        params.detalles[i + 1].valor,
        fonts,
      );
    }
    cursor.y -= 36;
  }
  cursor.y -= 4;

  if (params.motivo?.trim()) {
    bloqueTexto(cursor, "Motivo", params.motivo.trim(), fonts);
  }

  // ── Condiciones de la autorización (solo permisos aprobados) ──
  if (params.tipo === "permiso" && aprobado) {
    divisor(cursor);
    seccion(cursor, "Condiciones de la autorización", acento, bold);

    campo(
      cursor.page,
      MARGEN,
      cursor.y,
      "Remunerado",
      params.remunerado ? "Sí — el tiempo se paga normalmente" : "No",
      fonts,
    );
    campo(
      cursor.page,
      col2,
      cursor.y,
      "Compensatorio",
      params.compensado ? "Sí — el trabajador compensa el tiempo" : "No",
      fonts,
    );
    cursor.y -= 40;

    // El plan es el compromiso concreto de reposición: va antes del detalle de
    // los días, que no es más que el plan puesto en fechas. Quien autoriza puede
    // dejarlo sin definir, y entonces lo elige el propio colaborador.
    if (params.compensado) {
      cursor.espacio(40);
      // Ocupa el ancho completo: el plan es una condición de la autorización y
      // recortarla a media palabra dejaría el compromiso a medio enunciar.
      campo(
        cursor.page,
        MARGEN,
        cursor.y,
        "Plan de reposición",
        params.planCompensacion?.trim() ||
          "Por definir por el colaborador en su lista de solicitudes",
        fonts,
        ANCHO_UTIL,
      );
      cursor.y -= 40;

      const nota = params.notaCompensacion?.trim();
      if (nota) {
        for (const linea of envolver(nota, regular, 8, ANCHO_UTIL)) {
          cursor.espacio(14);
          cursor.page.drawText(linea, {
            x: MARGEN,
            y: cursor.y,
            size: 8,
            font: regular,
            color: GRIS_SUAVE,
          });
          cursor.y -= 11;
        }
        cursor.y -= 14;
      }
    }

    const dias = params.diasCompensacion ?? [];
    if (params.compensado && dias.length > 0) {
      const totalHoras = dias.reduce((suma, d) => suma + (Number(d.horas) || 0), 0);
      cursor.espacio(30);
      cursor.page.drawText(
        `DÍAS DE COMPENSACIÓN PACTADOS (${dias.length} · ${totalHoras} h en total)`,
        { x: MARGEN, y: cursor.y, size: 7.5, font: regular, color: GRIS_SUAVE },
      );
      cursor.y -= 18;

      for (const dia of dias) {
        const descripcion = (dia.descripcion || "").trim();
        const lineas = descripcion
          ? envolver(descripcion, regular, 9, ANCHO_UTIL - 190)
          : [];
        const alto = Math.max(26, lineas.length * 12 + 16);
        cursor.espacio(alto + 6);

        cursor.page.drawRectangle({
          x: MARGEN,
          y: cursor.y - alto + 12,
          width: ANCHO_UTIL,
          height: alto,
          color: GRIS_FONDO,
        });
        cursor.page.drawText(formatearFechaLarga(dia.fecha), {
          x: MARGEN + 12,
          y: cursor.y,
          size: 9.5,
          font: bold,
          color: GRIS_TEXTO,
        });
        cursor.page.drawText(`${dia.horas} h`, {
          x: MARGEN + 152,
          y: cursor.y,
          size: 9.5,
          font: bold,
          color: acento,
        });
        let yTexto = cursor.y;
        for (const linea of lineas) {
          cursor.page.drawText(linea, {
            x: MARGEN + 190,
            y: yTexto,
            size: 9,
            font: regular,
            color: GRIS_TEXTO,
          });
          yTexto -= 12;
        }
        cursor.y -= alto + 4;
      }
      cursor.y -= 8;
    }
  }

  // ── Observaciones de quien autoriza ──
  if (params.comentario?.trim()) {
    divisor(cursor);
    seccion(cursor, aprobado ? "Observaciones" : "Motivo del rechazo", acento, bold);
    cursor.y += 6;
    bloqueTexto(cursor, "Comentario de quien autoriza", params.comentario.trim(), fonts);
  }

  // ── Firmas ──
  divisor(cursor);
  cursor.espacio(120);
  seccion(cursor, "Firmas", acento, bold);
  cursor.y -= 54; // espacio para las imágenes de firma sobre las líneas

  const anchoFirma = ANCHO_UTIL / 2 - 20;
  await bloqueFirma(
    doc,
    cursor,
    MARGEN,
    anchoFirma,
    params.firmaTrabajador,
    params.solicitante.nombre,
    params.solicitante.cedula,
    "Trabajador solicitante",
    fonts,
  );
  await bloqueFirma(
    doc,
    cursor,
    col2 + 20,
    anchoFirma,
    params.firmaAutorizador,
    params.autorizador.nombre,
    params.autorizador.cedula,
    params.autorizador.cargo || "Autoriza",
    fonts,
  );
  cursor.y -= 50;

  // ── Pie en todas las páginas ──
  const paginas = doc.getPages();
  paginas.forEach((page, indice) => {
    page.drawText(
      `Documento generado por Sirius Gestión del Ser · Folio ${params.solicitudId} · ${params.estado}`,
      { x: MARGEN, y: 42, size: 7, font: regular, color: GRIS_SUAVE },
    );
    const numero = `Página ${indice + 1} de ${paginas.length}`;
    page.drawText(numero, {
      x: ANCHO - MARGEN - regular.widthOfTextAtSize(numero, 7),
      y: 42,
      size: 7,
      font: regular,
      color: GRIS_SUAVE,
    });
  });

  return doc.save();
}
