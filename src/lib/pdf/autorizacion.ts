/**
 * Generación del documento oficial de una solicitud de permiso o vacaciones
 * resuelta por el flujo de autorización.
 *
 * A diferencia del PDF de día siriano, aquí sí hubo una decisión de jefatura:
 * el documento lleva el sello de la decisión y las dos firmas — la del
 * trabajador que solicitó y la de quien autorizó o rechazó.
 *
 * La maqueta (encabezado, rejilla, bloques, tarjetas de firma, pie) vive en
 * `./maqueta`, compartida con el documento de día siriano.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  ALTO_FIRMA,
  ANCHO_FIRMA,
  ANCHO_UTIL,
  DANGER,
  GRID_FONDO,
  MARGEN,
  NEUTRO,
  OK,
  PRIMARY,
  TEXTO,
  ACCENT,
  type Celda,
  type Fuentes,
  Cursor,
  bloqueTexto,
  caja,
  encabezado,
  envolver,
  formatearFechaLarga,
  notaAlPie,
  paginacion,
  pieCorporativo,
  rejilla,
  seccion,
  tarjetaFirma,
} from "./maqueta";

export { formatearFechaLarga };

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

const TITULO: Record<TipoSolicitudPdf, string> = {
  permiso: "Solicitud de Permiso",
  vacaciones: "Solicitud de Vacaciones",
};

/**
 * Construye el PDF del documento oficial de la solicitud resuelta.
 *
 * @returns Bytes del PDF listos para subir a S3.
 */
export async function generarPdfAutorizacion(
  params: AutorizacionPdfParams,
): Promise<Uint8Array> {
  const aprobado = params.decision === "aprobar";
  const colorEstado = params.estado ? (aprobado ? OK : DANGER) : NEUTRO;

  const doc = await PDFDocument.create();
  doc.setTitle(`${TITULO[params.tipo]} — ${params.solicitante.nombre}`);
  doc.setSubject(`${TITULO[params.tipo]} · ${params.estado}`);
  doc.setProducer("Sirius Gestión del Ser");
  doc.setCreator("Sirius Gestión del Ser");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fuentes = { regular, bold };

  const cursor = new Cursor(doc);

  await encabezado(
    doc,
    cursor,
    { titulo: TITULO[params.tipo], estado: params.estado, colorEstado },
    fonts,
  );

  // ── Datos del colaborador y detalle de la solicitud ──
  rejilla(
    cursor,
    [
      { etiqueta: "Nombre", valor: params.solicitante.nombre },
      { etiqueta: "Cédula", valor: params.solicitante.cedula },
      { etiqueta: "Cargo", valor: params.solicitante.cargo },
      { etiqueta: "ID Empleado", valor: params.solicitante.idCore },
      ...params.detalles.map((d) => ({ etiqueta: d.etiqueta, valor: d.valor })),
      { etiqueta: "Folio", valor: params.solicitudId },
      { etiqueta: "Fecha de decisión", valor: formatearFechaLarga(params.fechaAutorizacion) },
    ],
    fonts,
  );

  // ── Motivo del trabajador ──
  if (params.motivo?.trim()) {
    bloqueTexto(cursor, "Motivo / Observaciones:", params.motivo.trim(), fonts);
  }

  // ── Condiciones de la autorización (solo permisos aprobados) ──
  if (params.tipo === "permiso" && aprobado) {
    seccion(cursor, "Condiciones de la autorización", bold);

    const condiciones: Celda[] = [
      // Textos cortos a propósito: en media columna, una frase larga se
      // recortaría con puntos suspensivos justo donde está la condición.
      { etiqueta: "Remunerado", valor: params.remunerado ? "Sí — se paga el tiempo" : "No" },
      { etiqueta: "Compensatorio", valor: params.compensado ? "Sí — repone el tiempo" : "No" },
    ];

    // El plan es el compromiso concreto de reposición: ocupa el ancho completo
    // porque recortarlo dejaría el compromiso a medio enunciar. Quien autoriza
    // puede dejarlo sin definir, y entonces lo elige el propio colaborador.
    if (params.compensado) {
      condiciones.push({
        etiqueta: "Plan de reposición",
        valor:
          params.planCompensacion?.trim() ||
          "Por definir por el colaborador en su lista de solicitudes",
        completa: true,
      });
    }
    rejilla(cursor, condiciones, fonts);

    const nota = params.compensado ? params.notaCompensacion?.trim() : "";
    if (nota) notaAlPie(cursor, nota, fonts);

    const dias = params.diasCompensacion ?? [];
    if (params.compensado && dias.length > 0) {
      const totalHoras = dias.reduce((suma, d) => suma + (Number(d.horas) || 0), 0);
      cursor.espacio(26);
      cursor.page.drawText(
        `DÍAS DE COMPENSACIÓN PACTADOS (${dias.length} · ${totalHoras} h en total)`,
        { x: MARGEN, y: cursor.y - 9, size: 7.5, font: bold, color: ACCENT },
      );
      cursor.y -= 20;

      for (const dia of dias) {
        const descripcion = (dia.descripcion || "").trim();
        const lineas = descripcion ? envolver(descripcion, regular, 9, ANCHO_UTIL - 200) : [];
        const alto = Math.max(24, lineas.length * 12 + 14);
        cursor.espacio(alto + 6);

        const yTop = cursor.y;
        caja(cursor.page, {
          x: MARGEN,
          yTop,
          ancho: ANCHO_UTIL,
          alto,
          radio: 7,
          color: GRID_FONDO,
        });
        cursor.page.drawText(formatearFechaLarga(dia.fecha), {
          x: MARGEN + 12,
          y: yTop - 15,
          size: 9.5,
          font: bold,
          color: TEXTO,
        });
        cursor.page.drawText(`${dia.horas} h`, {
          x: MARGEN + 155,
          y: yTop - 15,
          size: 9.5,
          font: bold,
          color: PRIMARY,
        });
        let y = yTop - 15;
        for (const linea of lineas) {
          cursor.page.drawText(linea, { x: MARGEN + 200, y, size: 9, font: regular, color: TEXTO });
          y -= 12;
        }
        cursor.y = yTop - alto - 5;
      }
      cursor.y -= 6;
    }
  }

  // ── Observaciones de quien autoriza ──
  if (params.comentario?.trim()) {
    bloqueTexto(
      cursor,
      aprobado ? "Observaciones de quien autoriza:" : "Motivo del rechazo:",
      params.comentario.trim(),
      fonts,
    );
  }

  // ── Firmas ──
  // Las dos tarjetas y el pie corporativo van juntos: una firma sola en una
  // página nueva no certifica nada.
  cursor.espacio(ALTO_FIRMA + 70);
  const yFirmas = cursor.y;

  await tarjetaFirma(
    doc,
    cursor.page,
    MARGEN,
    yFirmas,
    ANCHO_FIRMA,
    {
      titulo: "Solicitante",
      nombre: params.solicitante.nombre,
      cedula: params.solicitante.cedula,
      rol: "Firma del Trabajador",
      png: params.firmaTrabajador,
    },
    fonts,
  );
  await tarjetaFirma(
    doc,
    cursor.page,
    MARGEN + ANCHO_FIRMA + (ANCHO_UTIL - ANCHO_FIRMA * 2),
    yFirmas,
    ANCHO_FIRMA,
    {
      titulo: "Gestión del SER",
      nombre: params.autorizador.nombre,
      cedula: params.autorizador.cedula,
      rol: params.autorizador.cargo || "Firma Aprobador",
      png: params.firmaAutorizador,
    },
    fonts,
  );
  cursor.y = yFirmas - ALTO_FIRMA - 22;

  pieCorporativo(cursor, fonts);
  paginacion(
    doc,
    `Documento generado por Sirius Gestión del Ser · Folio ${params.solicitudId} · ${params.estado}`,
    regular,
  );

  return doc.save();
}
