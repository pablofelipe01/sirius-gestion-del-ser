/**
 * Generación del PDF de un permiso por Día Siriano.
 *
 * Los días sirianos son un beneficio ya concedido por la empresa: no pasan por
 * el flujo de autorización, así que el PDF se emite directamente como documento
 * autorizado y se archiva en S3 (ver uploadPdfPermisoSiriano). Lleva las dos
 * firmas: la del trabajador, que dibuja al radicar, y la institucional de
 * Gestión del Ser (`./firma-gestion-ser`), que viene de la variable de entorno
 * `FIRMA_GESTION_SER_BASE64`. Si esa variable falta, la emisión falla en vez de
 * salir sin firma: quien llama ya trata el fallo como «documento no emitido,
 * permiso igual registrado».
 *
 * Usa la misma maqueta que el documento de autorización (`./maqueta`): los dos
 * son el documento oficial de un permiso y el trabajador no debería recibir dos
 * papeles con distinta cara según por qué camino lo pidió.
 *
 * ⚠️ **Cabe en una sola página**, y hay tests que lo comprueban. El motivo se
 * recorta a `MAX_LINEAS_MOTIVO` para que la firma y la nota legal no se vayan a
 * una segunda hoja donde nadie las buscaría.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { firmaGestionSerPng, FIRMANTE_GESTION_SER } from "./firma-gestion-ser";
import {
  ANCHO_FIRMA,
  ANCHO_UTIL,
  ALTO_FIRMA,
  MARGEN,
  OK,
  type Fuentes,
  Cursor,
  bloqueTexto,
  encabezado,
  formatearFechaLarga,
  paginacion,
  pieCorporativo,
  rejilla,
  tarjetaFirma,
} from "./maqueta";

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

const TITULO = "Permiso por Día Siriano";
const MAX_LINEAS_MOTIVO = 5;

const NOTA_LEGAL =
  "Este es uno de los dos permisos sirianos que Sirius Regenerative Solutions otorga a cada " +
  "colaborador por año. Por ser un beneficio ya concedido, no requiere autorización caso a " +
  "caso: se emite como documento autorizado en el momento de la solicitud, lleva la firma " +
  "institucional de Gestión del Ser y descuenta automáticamente el saldo del periodo. Una vez " +
  "consumidos los dos, cualquier permiso adicional queda sujeto a la aprobación o el rechazo del " +
  "área de Gerencia.";

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

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fuentes = { regular, bold };

  const cursor = new Cursor(doc);

  await encabezado(doc, cursor, { titulo: TITULO, estado: "Autorizado", colorEstado: OK }, fonts);

  rejilla(
    cursor,
    [
      { etiqueta: "Nombre", valor: params.nombre },
      { etiqueta: "Cédula", valor: params.cedula },
      { etiqueta: "Cargo", valor: params.cargo },
      { etiqueta: "ID Empleado", valor: params.idCore },
      { etiqueta: "Día siriano", valor: formatearFechaLarga(params.fechaPermiso) },
      { etiqueta: "Fecha de solicitud", valor: formatearFechaLarga(params.fechaSolicitud) },
      { etiqueta: "Periodo", valor: params.periodo },
      {
        etiqueta: "Saldo restante",
        valor: `${params.saldoRestante} ${params.saldoRestante === 1 ? "día" : "días"}`,
      },
      { etiqueta: "Folio", valor: params.solicitudId },
    ],
    fonts,
  );

  bloqueTexto(
    cursor,
    "Motivo / Observaciones:",
    params.motivo?.trim() || "—",
    fonts,
    MAX_LINEAS_MOTIVO,
  );
  bloqueTexto(cursor, "Nota legal:", NOTA_LEGAL, fonts);

  // ── Firmas ──
  // Las dos tarjetas van juntas y con la misma altura que en el documento de
  // autorización, así que el documento sigue cabiendo en una página.
  cursor.espacio(ALTO_FIRMA + 70);
  const yFirma = cursor.y;
  await tarjetaFirma(
    doc,
    cursor.page,
    MARGEN,
    yFirma,
    ANCHO_FIRMA,
    {
      titulo: "Solicitante",
      nombre: params.nombre,
      cedula: params.cedula,
      rol: "Firma del Trabajador",
      png: params.firmaBase64 ? Buffer.from(params.firmaBase64, "base64") : null,
    },
    fonts,
  );
  // La firma de Gestión del Ser es institucional y siempre la misma: acredita
  // el beneficio ya concedido, no una decisión tomada sobre este caso. Por eso
  // viene empotrada y no la dibuja nadie al emitir el documento.
  await tarjetaFirma(
    doc,
    cursor.page,
    MARGEN + ANCHO_FIRMA + (ANCHO_UTIL - ANCHO_FIRMA * 2),
    yFirma,
    ANCHO_FIRMA,
    {
      titulo: "Gestión del SER",
      nombre: FIRMANTE_GESTION_SER.nombre,
      cedula: FIRMANTE_GESTION_SER.cedula,
      rol: FIRMANTE_GESTION_SER.cargo,
      png: firmaGestionSerPng(),
    },
    fonts,
  );
  cursor.y = yFirma - ALTO_FIRMA - 22;

  pieCorporativo(cursor, fonts);
  paginacion(
    doc,
    `Documento generado por Sirius Gestión del Ser · Folio ${params.solicitudId} · Autorizado`,
    regular,
  );

  return doc.save();
}
