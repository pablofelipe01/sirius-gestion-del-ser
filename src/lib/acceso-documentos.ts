/**
 * Control de acceso a los documentos de una solicitud.
 *
 * Tener sesión activa NO es autorización suficiente: el documento de un permiso
 * contiene el motivo (a menudo médico), la cédula y la firma manuscrita del
 * trabajador. Sin esta comprobación, cualquier colaborador autenticado que
 * conozca un recordId puede descargar el expediente de cualquier otro.
 *
 * Quién puede ver el documento de una solicitud:
 *
 *  1. El dueño          — el `ID Personal Core` del registro es el suyo.
 *  2. Quien la autorizó  — `Autorizado_Por_ID` es su recordId de Personal.
 *  3. Quien podría autorizarla — tiene permiso de autorización sobre ese tipo de
 *     solicitud y ese empleado, según `Permisos_Autorizacion` (mismo criterio que
 *     usa /api/solicitudes/autorizar, para que ver y decidir no se separen).
 *
 * Cualquier otro caso responde 404, no 403: un 403 confirmaría que el registro
 * existe, y eso ya es información sobre un tercero.
 */

import type { JWTPayload } from "@/lib/auth";
import { validarPermisoAutorizacion, type TipoSolicitud } from "@/lib/permisos";
import { TABLES, FIELDS, FK_ID_CORE, FIELDS_AUTORIZACION } from "@/lib/airtable-schema";

const BASE_ID = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const API_KEY = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

/** Solicitudes que emiten documento oficial. Las novedades no autorizan. */
export type TipoDocumento = "permiso" | "vacaciones";

const TABLA: Record<TipoDocumento, string> = {
  permiso: TABLES.PERMISO,
  vacaciones: TABLES.VACACIONES,
};

const TIPO_SOLICITUD: Record<TipoDocumento, TipoSolicitud> = {
  permiso: "Permiso",
  vacaciones: "Vacaciones",
};

/** Forma de un record ID de Airtable — se valida antes de tocar la red. */
const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;

/** Por qué se concedió el acceso — queda en el log de auditoría. */
export type MotivoAcceso = "dueño" | "autorizador" | "jefatura";

export type ResultadoAcceso =
  | { permitido: true; fields: Record<string, unknown>; motivo: MotivoAcceso }
  | { permitido: false; status: 400 | 404 };

export function esTipoDocumento(valor: string): valor is TipoDocumento {
  return valor === "permiso" || valor === "vacaciones";
}

/**
 * Resuelve si el usuario autenticado puede acceder a los documentos de una
 * solicitud, y devuelve el registro ya leído para no pedirlo dos veces.
 */
export async function autorizarAccesoSolicitud(
  payload: JWTPayload,
  tipo: string,
  recordId: string,
): Promise<ResultadoAcceso> {
  if (!esTipoDocumento(tipo)) {
    return { permitido: false, status: 400 };
  }

  // Descartar IDs mal formados antes de gastar una llamada a Airtable.
  if (!RECORD_ID.test(recordId)) {
    return { permitido: false, status: 404 };
  }

  const res = await fetch(
    `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLA[tipo])}/${recordId}`,
    { headers: { Authorization: `Bearer ${API_KEY}` }, cache: "no-store" },
  );

  if (!res.ok) {
    return { permitido: false, status: 404 };
  }

  const { fields } = (await res.json()) as { fields?: Record<string, unknown> };
  const campos = fields ?? {};

  // 1. El dueño de la solicitud.
  if (campos[FK_ID_CORE] === payload.idCore) {
    return { permitido: true, fields: campos, motivo: "dueño" };
  }

  // 2. Quien la autorizó. Ojo: Autorizado_Por_ID guarda `payload.sub` (recordId
  //    de Personal), no el idCore — ver /api/solicitudes/autorizar.
  if (campos[FIELDS_AUTORIZACION.AUTORIZADO_POR_ID] === payload.sub) {
    return { permitido: true, fields: campos, motivo: "autorizador" };
  }

  // 3. Quien tiene potestad de autorizar solicitudes de este empleado.
  const solicitanteIdCore = campos[FK_ID_CORE];

  if (typeof solicitanteIdCore === "string" && solicitanteIdCore) {
    const validacion = await validarPermisoAutorizacion({
      autorizadorId: payload.sub,
      tipoSolicitud: TIPO_SOLICITUD[tipo],
      solicitudIdCore: solicitanteIdCore,
    });

    if (validacion.puede) {
      return { permitido: true, fields: campos, motivo: "jefatura" };
    }
  }

  return { permitido: false, status: 404 };
}

// ── Resolución del archivo concreto ───────────────────────────────────────────

/**
 * Archivos que puede tener una solicitud. El cliente pide una de estas etiquetas
 * y el servidor resuelve la S3 key: el navegador nunca nombra un objeto de S3.
 */
export type ClaseRecurso = "documento" | "firma-trabajador" | "firma-autorizador";

const CLASES: readonly ClaseRecurso[] = ["documento", "firma-trabajador", "firma-autorizador"];

export function esClaseRecurso(valor: string): valor is ClaseRecurso {
  return (CLASES as readonly string[]).includes(valor);
}

/** Campo de Airtable donde vive la S3 key de cada clase de archivo. */
const CAMPO: Record<TipoDocumento, Record<ClaseRecurso, string>> = {
  permiso: {
    documento: FIELDS.PERMISO.PDF_AUTORIZACION_S3_KEY,
    "firma-trabajador": FIELDS.PERMISO.FIRMA_S3_KEY,
    "firma-autorizador": FIELDS_AUTORIZACION.FIRMA_S3_KEY,
  },
  vacaciones: {
    documento: FIELDS.VACACIONES.PDF_AUTORIZACION_S3_KEY,
    "firma-trabajador": FIELDS.VACACIONES.FIRMA_S3_KEY,
    "firma-autorizador": FIELDS_AUTORIZACION.FIRMA_S3_KEY,
  },
};

/** Nombre con el que se descarga cada clase de archivo. */
const NOMBRE: Record<ClaseRecurso, string> = {
  documento: "documento-autorizacion.pdf",
  "firma-trabajador": "firma-trabajador.png",
  "firma-autorizador": "firma-autorizador.png",
};

/**
 * Comprueba que la S3 key encontrada en el registro corresponde de verdad a la
 * clase de archivo pedida y al empleado dueño de la solicitud.
 *
 * Los campos que guardan estas keys son texto editable por cualquier
 * colaborador de la base de Airtable. Sin esta comprobación, cambiar
 * `Firma_S3_Key` a mano convertiría un endpoint autorizado en un lector de
 * archivos arbitrarios del bucket: el usuario tiene acceso legítimo a *su*
 * solicitud, pero el archivo servido sería de otra persona.
 */
export function recursoCoincide(
  clase: ClaseRecurso,
  s3Key: string,
  dueñoIdCore: string,
): boolean {
  if (clase === "documento") {
    // PDFs: día siriano o flujo de autorización. `dias-pacto` es el prefijo con
    // el que se archivaron los documentos antes del renombre — sus keys viven en
    // Airtable y sin él quedarían inaccesibles.
    return (
      /^permisos\/dias-(sirianos|pacto)\//.test(s3Key) ||
      /^autorizaciones\/(permiso|vacaciones)\//.test(s3Key)
    );
  }

  if (clase === "firma-trabajador") {
    // La firma del trabajador vive bajo su propio idCore — se exige que coincida
    // con el dueño del registro.
    return new RegExp(
      `^firmas/(permisos|vacaciones)/${dueñoIdCore.replace(/[^\w-]/g, "")}/`,
    ).test(s3Key);
  }

  // La firma del autorizador va bajo el idCore de quien firmó, que no es el
  // dueño: solo se puede exigir que esté en el prefijo de autorizaciones.
  return /^firmas\/autorizaciones\/SIRIUS-PER-\d{4}\//.test(s3Key);
}

export type ResultadoRecurso =
  | { ok: true; s3Key: string; nombre: string }
  | { ok: false; status: 404; error: string };

/**
 * S3 key del archivo pedido, ya verificada contra el registro.
 *
 * Se llama únicamente con un `fields` que ya pasó por
 * `autorizarAccesoSolicitud()`.
 */
export function resolverRecurso(
  tipo: TipoDocumento,
  clase: ClaseRecurso,
  fields: Record<string, unknown>,
): ResultadoRecurso {
  const s3Key = fields[CAMPO[tipo][clase]];

  if (typeof s3Key !== "string" || !s3Key.trim()) {
    return { ok: false, status: 404, error: "Esta solicitud no tiene ese archivo" };
  }

  const dueño = fields[FK_ID_CORE];

  if (typeof dueño !== "string" || !dueño) {
    return { ok: false, status: 404, error: "Esta solicitud no tiene ese archivo" };
  }

  if (!recursoCoincide(clase, s3Key, dueño)) {
    console.error(
      `[acceso-documento] S3 key incoherente con la solicitud: clase=${clase} dueño=${dueño} key=${s3Key}`,
    );
    return { ok: false, status: 404, error: "Esta solicitud no tiene ese archivo" };
  }

  return { ok: true, s3Key, nombre: NOMBRE[clase] };
}

/**
 * Deja rastro de cada acceso a un documento.
 *
 * Un documento laboral firmado exige poder responder después quién lo consultó.
 * De momento va al log del servidor; el destino natural es una tabla de
 * auditoría en Airtable o CloudWatch.
 */
export function registrarAccesoDocumento(params: {
  payload: JWTPayload;
  tipo: string;
  recordId: string;
  recurso: string;
  resultado: "concedido" | "denegado";
  motivo?: MotivoAcceso;
}): void {
  const { payload, tipo, recordId, recurso, resultado, motivo } = params;

  console.info(
    "[acceso-documento]",
    JSON.stringify({
      resultado,
      motivo,
      solicitante: payload.idCore,
      rol: payload.rol,
      tipo,
      recordId,
      recurso,
      at: new Date().toISOString(),
    }),
  );
}
