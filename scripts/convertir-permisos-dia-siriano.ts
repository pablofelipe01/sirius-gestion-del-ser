#!/usr/bin/env tsx
/**
 * Convierte permisos ya radicados en permisos por Día Siriano.
 *
 * Replica sobre un registro existente lo que hace `POST /api/solicitudes/permiso`
 * cuando el tipo es Día Siriano (ver `packages/solicitudes/src/handlers/permiso.ts`):
 * deja el permiso concedido con la huella de la autorización automática, lo vincula
 * al saldo del periodo y descuenta un día, archiva la firma institucional de
 * Gestión del Ser en S3 y emite el PDF oficial bajo `permisos/dias-sirianos/`.
 *
 * Existe porque el flujo normal solo produce un día siriano al radicarlo: un
 * permiso que ya está en la tabla —o que viene del sistema HTML anterior— no
 * tiene otra forma de quedar con la misma huella que uno nacido del formulario,
 * y sin ella el histórico y `/api/documentos` lo tratan distinto.
 *
 * **Es idempotente por partes**: cada paso se salta si el registro ya lo tiene.
 * Lo importante es el descuento de saldo, que solo ocurre si el permiso todavía
 * no está vinculado a `Dias_Sirianos` — así, correr el script dos veces no gasta
 * dos días.
 *
 * Uso:
 *   # Muestra lo que haría, sin escribir nada:
 *   npx tsx --env-file=.env.local scripts/convertir-permisos-dia-siriano.ts recXXX recYYY
 *   # Aplica los cambios:
 *   npx tsx --env-file=.env.local scripts/convertir-permisos-dia-siriano.ts recXXX --aplicar
 *
 * La firma del trabajador se recupera del documento HTML del sistema anterior
 * (`Archivo_Generado`), donde quedó embebida en base64: es el trazo real que hizo
 * al radicar, y sin él el PDF nuevo saldría con el espacio del solicitante en
 * blanco aunque la firma exista.
 *
 * Opciones:
 *   --aplicar          Escribe en Airtable y S3. Sin esto solo simula.
 *   --reemitir         Emite el PDF otra vez aunque el permiso ya tenga uno. Nada
 *                      se borra: la key de S3 lleva marca de tiempo y el adjunto
 *                      PDF_Firmado acumula las versiones.
 *   --origin=<url>     Origen con el que se arma el enlace de PDF_Autorizacion_URL
 *                      (por defecto http://localhost:3000, igual que el flujo en
 *                      desarrollo). En producción hay que pasar el dominio real:
 *                      el enlace queda guardado y se reparte a quien consulta.
 */

import { escapeAirtableValue } from "@/lib/security";
import {
  TABLES,
  FIELDS,
  FK_ID_CORE,
  FIELDS_AUTORIZACION,
  PERIODO_ACTUAL,
} from "@/lib/airtable-schema";
import { descargarObjetoS3, uploadFirmaTrabajador, uploadPdfPermisoSiriano } from "@/lib/s3";
import {
  generarPdfPermisoSiriano,
  firmaGestionSerBase64,
  FIRMANTE_GESTION_SER,
} from "@/lib/pdf";
import { subirAdjuntoAirtable } from "@/lib/airtable-attachments";
import { fechaHoyBogota } from "@/lib/fecha-bogota";

/** El mismo tipo que escribe el formulario — ver packages/solicitudes/src/lib/constants.ts. */
const TIPO_DIA_SIRIANO = "Día Siriano";
const ESTADO_CONCEDIDO = "Concedido";

/** Textos con los que el flujo marca la autorización automática del día siriano. */
const AUTORIZACION_AUTOMATICA = "Gestión del Ser — autorización automática (Día Siriano)";
const COMENTARIO_AUTOMATICO =
  "Día siriano: beneficio ya concedido, no requiere autorización de jefatura. " +
  "Firmado con la firma institucional de Gestión del Ser.";

/** Rastro de que el permiso no nació del formulario, sino de esta conversión. */
const NOTA_CONVERSION = (tipoAnterior: string) =>
  `Convertido a día siriano el ${fechaHoyBogota()} por Gestión del Ser` +
  (tipoAnterior ? ` (tipo anterior: "${tipoAnterior}").` : ".");

const BASE_NOVEDADES = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY_NOVEDADES = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;
const BASE_NOMINA = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE!;
const KEY_NOMINA = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE!;

// ── CLI ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const REEMITIR = args.includes("--reemitir");
const ORIGIN = (args.find((a) => a.startsWith("--origin="))?.slice("--origin=".length) ??
  "http://localhost:3000").replace(/\/$/, "");
const OBJETIVOS = args.filter((a) => /^rec[A-Za-z0-9]{14}$/.test(a));

type Campos = Record<string, unknown>;
type Registro = { id: string; createdTime?: string; fields: Campos };
type FirmaTrabajador = { base64: string; origen: string };

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numero = (v: unknown): number => (typeof v === "number" ? v : 0);
const vinculos = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
const adjuntos = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// ── Airtable ──────────────────────────────────────────────────────────────────
async function airtable(
  baseId: string,
  apiKey: string,
  ruta: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${ruta}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Airtable ${res.status} en ${ruta}: ${await res.text()}`);
  return res.json();
}

const leerRegistro = (tabla: string, id: string) =>
  airtable(BASE_NOVEDADES, KEY_NOVEDADES, `${encodeURIComponent(tabla)}/${id}`) as Promise<Registro>;

async function parchear(tabla: string, id: string, fields: Campos): Promise<void> {
  if (Object.keys(fields).length === 0) return;
  if (!APLICAR) return;
  await airtable(BASE_NOVEDADES, KEY_NOVEDADES, `${encodeURIComponent(tabla)}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
}

/**
 * Busca al colaborador en Personal. Primero por cédula; si no aparece, por
 * nombre completo — los registros heredados del sistema HTML traen la cédula
 * digitada a mano y puede no coincidir con la de Personal.
 */
async function buscarEnPersonal(cedula: string, nombre: string): Promise<Registro | null> {
  for (const [campo, valor] of [
    [FIELDS.PERSONAL.NUMERO_DOCUMENTO, cedula],
    [FIELDS.PERSONAL.NOMBRE, nombre],
  ] as const) {
    if (!valor) continue;
    const formula = encodeURIComponent(`{${campo}}='${escapeAirtableValue(valor)}'`);
    const data = (await airtable(
      BASE_NOMINA,
      KEY_NOMINA,
      `${encodeURIComponent(TABLES.PERSONAL)}?filterByFormula=${formula}&maxRecords=2`,
    )) as { records: Registro[] };
    if (data.records.length === 1) return data.records[0];
    if (data.records.length > 1) {
      console.warn(`   ⚠️  ${campo}='${valor}' coincide con más de un registro de Personal`);
    }
  }
  return null;
}

/** Registro de saldo del colaborador para el periodo en curso. */
async function buscarSaldo(idCore: string): Promise<Registro | null> {
  const formula = encodeURIComponent(
    `AND({${FIELDS.DIAS_SIRIANOS.ID_COLABORADOR}}='${escapeAirtableValue(idCore)}', ` +
      `{${FIELDS.DIAS_SIRIANOS.PERIODO}}='${escapeAirtableValue(PERIODO_ACTUAL)}')`,
  );
  const data = (await airtable(
    BASE_NOVEDADES,
    KEY_NOVEDADES,
    `${encodeURIComponent(TABLES.DIAS_SIRIANOS)}?filterByFormula=${formula}`,
  )) as { records: Registro[] };
  return data.records[0] ?? null;
}

// ── Conversión de un permiso ──────────────────────────────────────────────────
async function convertir(recordId: string): Promise<void> {
  console.log(`\n${"─".repeat(78)}\n▶ ${recordId}`);

  const permiso = await leerRegistro(TABLES.PERMISO, recordId);
  const f = permiso.fields;

  const nombre = texto(f[FIELDS.PERMISO.NOMBRE]);
  const cargo = texto(f[FIELDS.PERMISO.CARGO]);
  const motivo = texto(f[FIELDS.PERMISO.MOTIVO]);
  const tipoActual = texto(f[FIELDS.PERMISO.TIPO]);
  const fechaPermiso = texto(f[FIELDS.PERMISO.FECHA_INICIO]);
  const fechaSolicitud = texto(f[FIELDS.PERMISO.FECHA_SOLICITUD]) || fechaHoyBogota();
  let cedula = texto(f[FIELDS.PERMISO.CEDULA]);
  let idCore = texto(f[FK_ID_CORE]);

  console.log(`   ${nombre} · ${cargo || "sin cargo"}`);
  console.log(`   tipo actual: "${tipoActual}" · permiso del ${fechaPermiso || "?"}`);

  if (!fechaPermiso) {
    throw new Error("el registro no tiene 'Fecha de permiso'; sin ella no se puede emitir el documento");
  }

  // ── Identidad: Personal es la fuente de verdad ──
  const persona = await buscarEnPersonal(cedula, nombre);
  if (!persona) {
    throw new Error(`no se encontró a "${nombre}" (cédula ${cedula || "?"}) en Personal`);
  }
  const idCoreReal = texto(persona.fields[FIELDS.PERSONAL.ID_EMPLEADO]);
  const cedulaReal = texto(persona.fields[FIELDS.PERSONAL.NUMERO_DOCUMENTO]);
  if (!idCoreReal) throw new Error(`el registro de Personal ${persona.id} no tiene 'ID Empleado'`);

  const patch: Campos = {};

  if (idCore && idCore !== idCoreReal) {
    throw new Error(
      `el permiso dice ${idCore} pero Personal dice ${idCoreReal}: revísalo a mano antes de convertir`,
    );
  }
  if (!idCore) {
    console.log(`   + ID Personal Core: ${idCoreReal}`);
    patch[FK_ID_CORE] = idCoreReal;
    idCore = idCoreReal;
  }
  // La cédula viaja al PDF y a la S3 key del documento. Si el registro heredado
  // la trae mal, se corrige con la de Personal: un documento oficial no puede
  // identificar al trabajador con un número que no es el suyo.
  if (cedulaReal && cedula !== cedulaReal) {
    console.log(`   ! Cédula corregida: ${cedula || "(vacía)"} → ${cedulaReal} (según Personal)`);
    patch[FIELDS.PERMISO.CEDULA] = cedulaReal;
    cedula = cedulaReal;
  }

  // ── Firma del trabajador ──
  // Un permiso heredado no la tiene en Airtable, pero sí en el documento HTML
  // que generó el sistema anterior, donde quedó embebida en base64. Se recupera
  // de ahí: es el trazo que el trabajador hizo al radicar, y su documento no
  // debería salir sin él por el solo hecho de haber cambiado de sistema.
  const firma = await obtenerFirmaTrabajador(permiso);
  if (!firma) {
    console.log("   ⚠️  Sin firma del trabajador en Airtable ni en el documento heredado");
  } else {
    console.log(`   ✍️  Firma del trabajador recuperada (${firma.origen})`);
    if (!texto(f[FIELDS.PERMISO.FIRMA_S3_KEY])) {
      if (APLICAR) {
        const subida = await uploadFirmaTrabajador({
          base64: firma.base64,
          cedula,
          idCore,
          tipo: "permiso",
          metadata: { tipoPermiso: TIPO_DIA_SIRIANO, fechaSolicitud, origen: firma.origen },
        });
        patch[FIELDS.PERMISO.FIRMA_S3_KEY] = subida.s3Key;
        // Firma_Trabajador es el gemelo en texto del mismo dato: guarda la key.
        patch[FIELDS.PERMISO.FIRMA_TRAB_TEXTO] = subida.s3Key;
        console.log(`   + Firma del trabajador en S3: ${subida.s3Key}`);
      } else {
        console.log(`   + Firma del trabajador a S3 (firmas/permisos/${idCore}/…)`);
      }
      // La firmó al radicar, no hoy: la fecha del trámite es la del registro.
      if (!texto(f[FIELDS.PERMISO.FECHA_FIRMA_TRAB])) {
        patch[FIELDS.PERMISO.FECHA_FIRMA_TRAB] = permiso.createdTime ?? `${fechaSolicitud}T12:00:00.000Z`;
      }
    } else {
      console.log(`   = Firma del trabajador ya archivada: ${texto(f[FIELDS.PERMISO.FIRMA_S3_KEY])}`);
    }
  }

  // ── Saldo del periodo ──
  const yaVinculado = vinculos(f[FIELDS.PERMISO.DIAS_SIRIANOS_LINK]).length > 0;
  const saldo = await buscarSaldo(idCore);
  if (!saldo) {
    throw new Error(`no hay registro de Dias_Sirianos para ${idCore} en el periodo ${PERIODO_ACTUAL}`);
  }

  const disponible = numero(saldo.fields[FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE]);
  const usado = numero(saldo.fields[FIELDS.DIAS_SIRIANOS.SALDO_USADO]);
  let saldoRestante = disponible;

  if (yaVinculado) {
    console.log(`   = Ya vinculado a Dias_Sirianos: no se descuenta de nuevo (saldo ${disponible})`);
  } else {
    if (disponible <= 0) {
      throw new Error(
        `${idCore} no tiene días sirianos disponibles en ${PERIODO_ACTUAL} (usados: ${usado})`,
      );
    }
    saldoRestante = disponible - 1;
    console.log(`   + Descuento de saldo: ${disponible} → ${saldoRestante} (usados ${usado} → ${usado + 1})`);
    patch[FIELDS.PERMISO.DIAS_SIRIANOS_LINK] = [saldo.id];
  }

  // ── Campos del día siriano autorizado ──
  if (tipoActual !== TIPO_DIA_SIRIANO) patch[FIELDS.PERMISO.TIPO] = TIPO_DIA_SIRIANO;
  if (texto(f[FIELDS.PERMISO.ESTADO]) !== ESTADO_CONCEDIDO) {
    patch[FIELDS.PERMISO.ESTADO] = ESTADO_CONCEDIDO;
  }
  if (!texto(f[FIELDS_AUTORIZACION.FECHA])) patch[FIELDS_AUTORIZACION.FECHA] = fechaHoyBogota();
  // Estos dos se reescriben siempre: los registros anteriores al renombre dicen
  // "Día de Pacto", y el texto del autorizador es lo que se lee en el histórico.
  patch[FIELDS_AUTORIZACION.AUTORIZADO_POR_NOM] = AUTORIZACION_AUTOMATICA;
  // La nota de conversión se conserva si ya está: al re-correr el script el tipo
  // ya es "Día Siriano", y rearmar el comentario desde cero borraría el rastro de
  // que este permiso no nació del formulario.
  const notaPrevia = /Convertido a día siriano el [^\n]*/.exec(
    texto(f[FIELDS_AUTORIZACION.COMENTARIO]),
  )?.[0];
  patch[FIELDS_AUTORIZACION.COMENTARIO] =
    tipoActual === TIPO_DIA_SIRIANO
      ? [COMENTARIO_AUTOMATICO, notaPrevia].filter(Boolean).join(" ")
      : `${COMENTARIO_AUTOMATICO} ${NOTA_CONVERSION(tipoActual)}`;
  if (!texto(f[FIELDS.PERMISO.FIRMANTE_APROB_NOMBRE])) {
    patch[FIELDS.PERMISO.FIRMANTE_APROB_NOMBRE] = FIRMANTE_GESTION_SER.nombre;
  }
  if (!texto(f[FIELDS.PERMISO.FIRMANTE_APROB_CARGO])) {
    patch[FIELDS.PERMISO.FIRMANTE_APROB_CARGO] = FIRMANTE_GESTION_SER.cargo;
  }
  if (f[FIELDS.PERMISO.REVISADO] !== true) patch[FIELDS.PERMISO.REVISADO] = true;
  // Un día siriano es un solo día: nunca lleva rango inicio–fin.
  if (texto(f[FIELDS.PERMISO.FECHA_FIN])) {
    console.log(`   - Fecha fin de permiso (${texto(f[FIELDS.PERMISO.FECHA_FIN])}): un día siriano es un solo día`);
    patch[FIELDS.PERMISO.FECHA_FIN] = null;
  }

  // ── Firma institucional de Gestión del Ser en S3 ──
  const firmaBase64 = firmaGestionSerBase64();
  if (!texto(f[FIELDS_AUTORIZACION.FIRMA_S3_KEY])) {
    if (APLICAR) {
      const firma = await uploadFirmaTrabajador({
        base64: firmaBase64,
        cedula,
        idCore,
        tipo: "autorizacion-permiso",
        metadata: {
          tipoPermiso: TIPO_DIA_SIRIANO,
          fechaSolicitud,
          firmante: FIRMANTE_GESTION_SER.nombre,
          automatica: "dia-siriano-conversion",
        },
      });
      patch[FIELDS_AUTORIZACION.FIRMA_S3_KEY] = firma.s3Key;
      // Fecha_Firma_Autorizador es `date`: rechaza un ISO con hora.
      patch[FIELDS_AUTORIZACION.FECHA_FIRMA] = fechaHoyBogota();
      // Estas dos sí son dateTime.
      patch[FIELDS.PERMISO.FECHA_FIRMA_GESTION] = firma.uploadedAt;
      patch[FIELDS.PERMISO.FECHA_FIRMA_APROBADOR] = firma.uploadedAt;
      console.log(`   + Firma institucional en S3: ${firma.s3Key}`);
    } else {
      console.log(`   + Firma institucional a S3 (firmas/autorizaciones/${idCore}/…)`);
    }
  } else {
    console.log(`   = Firma del autorizador ya archivada: ${texto(f[FIELDS_AUTORIZACION.FIRMA_S3_KEY])}`);
  }

  // ── Documento oficial ──
  // Solo se emite si el permiso no tiene ya un PDF de día siriano archivado: el
  // documento firmado es el papel del trámite y reemitirlo sin necesidad
  // duplicaría el archivo por gusto.
  const s3KeyPdf = texto(f[FIELDS.PERMISO.PDF_AUTORIZACION_S3_KEY]);
  const emitirPdf = !s3KeyPdf || REEMITIR;
  if (s3KeyPdf && REEMITIR) {
    console.log(`   ~ Reemisión pedida: la versión anterior queda en S3 (${s3KeyPdf})`);
  }
  const enlaceDocumento = `${ORIGIN}/api/documentos/permiso/${recordId}`;

  if (!emitirPdf) {
    console.log(`   = PDF ya archivado: ${s3KeyPdf} (no se reemite)`);
    const enlaceActual = texto(f[FIELDS.PERMISO.PDF_AUTORIZACION_URL]);
    if (enlaceActual && enlaceActual !== enlaceDocumento) {
      console.log(`   ~ PDF_Autorizacion_URL: ${enlaceActual} → ${enlaceDocumento}`);
      patch[FIELDS.PERMISO.PDF_AUTORIZACION_URL] = enlaceDocumento;
    }
  }

  // ── Escritura del registro ──
  console.log(`   ${APLICAR ? "→ PATCH" : "→ (simulado) PATCH"} ${Object.keys(patch).length} campos`);
  for (const [campo, valor] of Object.entries(patch)) {
    const v = typeof valor === "string" && valor.length > 60 ? `${valor.slice(0, 57)}…` : valor;
    console.log(`      · ${campo} = ${JSON.stringify(v)}`);
  }
  await parchear(TABLES.PERMISO, recordId, patch);

  // ── Descuento del saldo ──
  // Va después del permiso: si el PATCH del permiso falla, el día no se gasta.
  if (!yaVinculado) {
    const observaciones = texto(saldo.fields[FIELDS.DIAS_SIRIANOS.OBSERVACIONES]);
    const nueva = `${fechaPermiso}: Permiso ${recordId} - ${motivo || "Día siriano"} (convertido)`;
    const camposSaldo: Campos = {
      [FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE]: saldoRestante,
      [FIELDS.DIAS_SIRIANOS.SALDO_USADO]: usado + 1,
      [FIELDS.DIAS_SIRIANOS.FECHA_ULTIMO_USO]: fechaPermiso,
      [FIELDS.DIAS_SIRIANOS.OBSERVACIONES]: observaciones ? `${observaciones}\n${nueva}` : nueva,
      [FIELDS.DIAS_SIRIANOS.ESTADO]: saldoRestante <= 0 ? "Agotado" : "Activo",
    };
    console.log(`   ${APLICAR ? "→ PATCH" : "→ (simulado) PATCH"} Dias_Sirianos ${saldo.id}`);
    await parchear(TABLES.DIAS_SIRIANOS, saldo.id, camposSaldo);
  }

  // La firma del trabajador no se adjunta: Solicitud_Permiso no tiene campo
  // Attachment para ella —solo Firma_S3_Key y su gemelo en texto—, y es lo
  // correcto según la regla de no guardar el base64 en Airtable.

  // ── Adjuntos de la firma institucional ──
  // Gemelos que la tabla arrastra del sistema anterior y que llena
  // /api/solicitudes/autorizar. Son comodidad de consulta dentro de Airtable.
  for (const campo of [FIELDS.PERMISO.FIRMA_GESTION, FIELDS.PERMISO.FIRMA_APROBADOR]) {
    if (adjuntos(f[campo]).length > 0) {
      console.log(`   = ${campo} ya tiene adjunto`);
      continue;
    }
    console.log(`   ${APLICAR ? "+" : "+ (simulado)"} adjunto ${campo}`);
    if (!APLICAR) continue;
    await subirAdjuntoAirtable({
      baseId: BASE_NOVEDADES,
      apiKey: KEY_NOVEDADES,
      recordId,
      campo,
      contenido: Buffer.from(firmaBase64, "base64"),
      filename: `firma_gestion_ser_${recordId}.png`,
      contentType: "image/png",
    });
  }

  if (!emitirPdf) return;

  // ── Emisión del PDF ──
  if (!firma) {
    console.log("   ⚠️  Sin firma del trabajador: el PDF sale con la tarjeta del solicitante vacía");
  }

  console.log(`   ${APLICAR ? "→" : "→ (simulado)"} emitir PDF de día siriano (saldo restante ${saldoRestante})`);
  if (!APLICAR) return;

  const pdf = await generarPdfPermisoSiriano({
    solicitudId: recordId,
    nombre,
    cedula,
    cargo,
    idCore,
    fechaPermiso,
    fechaSolicitud,
    motivo,
    periodo: PERIODO_ACTUAL,
    saldoRestante,
    firmaBase64: firma?.base64,
  });

  const subida = await uploadPdfPermisoSiriano({
    pdf,
    cedula,
    idCore,
    fechaPermiso,
    metadata: { solicitudId: recordId, periodo: PERIODO_ACTUAL, nombre },
  });
  console.log(`   + PDF archivado: ${subida.s3Key}`);

  const patchPdf: Campos = {
    [FIELDS.PERMISO.URL_PDF_FIRMADO]: subida.url,
    [FIELDS.PERMISO.HASH_DOCUMENTO]: subida.sha256,
    [FIELDS.PERMISO.PDF_AUTORIZACION_URL]: enlaceDocumento,
    [FIELDS.PERMISO.PDF_AUTORIZACION_S3_KEY]: subida.s3Key,
  };
  // Nombre_Archivo es un campo heredado: guarda el nombre del documento HTML del
  // sistema anterior. Solo se llena si está vacío — sobreescribirlo borraría ese
  // historial (ver CLAUDE.md § Campos heredados de solo lectura).
  if (!texto(f[FIELDS.PERMISO.NOMBRE_ARCHIVO])) {
    patchPdf[FIELDS.PERMISO.NOMBRE_ARCHIVO] = subida.filename;
  } else {
    console.log(`   = Nombre_Archivo conserva el documento heredado: ${texto(f[FIELDS.PERMISO.NOMBRE_ARCHIVO])}`);
  }
  await parchear(TABLES.PERMISO, recordId, patchPdf);

  await subirAdjuntoAirtable({
    baseId: BASE_NOVEDADES,
    apiKey: KEY_NOVEDADES,
    recordId,
    campo: FIELDS.PERMISO.PDF_FIRMADO,
    contenido: Buffer.from(pdf),
    filename: subida.filename,
    contentType: "application/pdf",
  });
  console.log(`   + PDF adjunto en ${FIELDS.PERMISO.PDF_FIRMADO}`);
}

/** Cabecera de un PNG válido — los 3 bytes que siguen al 0x89 inicial. */
const MAGIC_PNG = "PNG";

const esPng = (base64: string): boolean =>
  Buffer.from(base64, "base64").subarray(1, 4).toString("latin1") === MAGIC_PNG;

/**
 * Firma del trabajador en base64, buscada en los dos sitios donde puede estar.
 *
 * 1. La S3 key de `Firma_S3_Key` — la referencia canónica, la que dejó el
 *    formulario actual o una pasada anterior de este script.
 * 2. El documento HTML del sistema anterior (`Archivo_Generado`), donde la firma
 *    quedó embebida como `data:image/png;base64`. Es el único rastro del trazo
 *    en un permiso heredado, y por eso se intenta también: si el HTML
 *    desapareciera, el documento se quedaría sin firma para siempre.
 */
async function obtenerFirmaTrabajador(permiso: Registro): Promise<FirmaTrabajador | null> {
  const s3Key = texto(permiso.fields[FIELDS.PERMISO.FIRMA_S3_KEY]);

  if (s3Key) {
    const png = await descargarObjetoS3(s3Key);
    const base64 = png?.toString("base64");
    if (base64 && esPng(base64)) return { base64, origen: "s3" };
    console.warn(`   ⚠️  No se pudo leer la firma archivada en ${s3Key}`);
  }

  return firmaDesdeHtmlHeredado(texto(permiso.fields[FIELDS.PERMISO.ARCHIVO_GENERADO]));
}

/**
 * Extrae la firma del trabajador del documento HTML heredado.
 *
 * El HTML trae dos imágenes en base64 —la del trabajador y la institucional— y
 * se distinguen solo por el `alt`: por eso el patrón exige `Firma Trabajador` y
 * no se queda con la primera que aparezca. Coger la equivocada pondría la firma
 * de Gestión del Ser en la tarjeta del solicitante.
 */
async function firmaDesdeHtmlHeredado(url: string): Promise<FirmaTrabajador | null> {
  if (!url || !/\.html?$/i.test(url)) return null;

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`   ⚠️  No se pudo leer el documento heredado (${res.status}): ${url}`);
    return null;
  }

  const html = await res.text();
  const patron = /<img[^>]*src="data:image\/png;base64,([A-Za-z0-9+/=]+)"[^>]*alt="Firma Trabajador"/i;
  const base64 = patron.exec(html)?.[1];

  if (!base64) {
    console.warn("   ⚠️  El documento heredado no trae la firma del trabajador embebida");
    return null;
  }
  if (!esPng(base64)) {
    console.warn("   ⚠️  La firma embebida en el documento heredado no es un PNG");
    return null;
  }
  return { base64, origen: "html-heredado" };
}

async function main(): Promise<void> {
  if (OBJETIVOS.length === 0) {
    console.error(
      "Uso: npx tsx --env-file=.env.local scripts/convertir-permisos-dia-siriano.ts recXXX [recYYY] [--aplicar] [--origin=https://…]",
    );
    process.exit(1);
  }

  console.log(APLICAR ? "🔴 MODO APLICAR — se escribirá en Airtable y S3" : "🟡 SIMULACIÓN — no se escribe nada");
  console.log(`   Periodo: ${PERIODO_ACTUAL} · Origen de enlaces: ${ORIGIN}`);
  console.log(`   Registros: ${OBJETIVOS.join(", ")}`);

  let fallidos = 0;
  for (const recordId of OBJETIVOS) {
    try {
      await convertir(recordId);
    } catch (error) {
      fallidos++;
      console.error(`\n❌ ${recordId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(`\n${"─".repeat(78)}`);
  console.log(
    fallidos === 0
      ? `✅ ${OBJETIVOS.length} registro(s) procesado(s)`
      : `⚠️  ${OBJETIVOS.length - fallidos} ok · ${fallidos} con error`,
  );
  if (fallidos > 0) process.exit(1);
}

main();
