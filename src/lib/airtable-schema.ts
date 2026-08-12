// Fuente única de verdad para nombres de tablas y campos de Airtable.
// NUNCA usar strings de tabla/campo directamente en el código — siempre importar desde aquí.
// Si se renombra una tabla o campo en Airtable, solo se cambia en este archivo.

// ── Tablas ────────────────────────────────────────────────────────────────────
// Los nombres de tabla se leen de env vars para permitir sobreescritura por entorno.
// Si la variable no está definida, se usa el nombre de tabla de producción como fallback.
export const TABLES = {
  // Nómina Core
  PERSONAL:    process.env.AIRTABLE_TABLE_PERSONAL           ?? "Personal",
  ROLES:       process.env.AIRTABLE_TABLE_ROLES              ?? "Roles y Permisos",
  // Novedades Nómina
  PERMISO:     process.env.AIRTABLE_TABLE_SOLICITUD_PERMISO  ?? "Solicitud_Permiso",
  VACACIONES:  process.env.AIRTABLE_TABLE_SOLICITUD_VACACIONES ?? "Solicitud_Vacaciones",
  NOVEDADES:   process.env.AIRTABLE_TABLE_NOVEDADES_NOMINA   ?? "Reportes Novedades Nomina",
  DIAS_SIRIANOS: process.env.AIRTABLE_TABLE_DIAS_SIRIANOS    ?? "Dias_Sirianos",
  ASISTENCIA:  process.env.AIRTABLE_TABLE_ASISTENCIA         ?? "Asistencia Personal",
  // Marcaciones del biométrico que carga el flujo de n8n (ver /api/asistencia/lista)
  REPORTE_ASISTENCIA: process.env.AIRTABLE_TABLE_REPORTE_ASISTENCIA ?? "Reporte Asistencia Guaicaramo",
} as const;

// ── FK compartida ─────────────────────────────────────────────────────────────
// Campo que referencia al empleado en todas las tablas de Novedades y Gestión del Ser.
// Valor: "SIRIUS-PER-XXXX" (payload.idCore). Ver CLAUDE.md § Identificador único.
export const FK_ID_CORE = "ID Personal Core";

// ── Campos por tabla ──────────────────────────────────────────────────────────
export const FIELDS = {
  PERSONAL: {
    NUMERO_DOCUMENTO: "Numero Documento",
    NOMBRE:           "Nombre completo",
    PASSWORD:         "Password",
    ESTADO:           "Estado de actividad",
    ROL:              "Rol",
    ID_EMPLEADO:      "ID Empleado",
  },
  ROLES: {
    ROL:          "Rol",
    NIVEL_ACCESO: "Nivel_Acceso",
  },
  PERMISO: {
    NOMBRE:          "Nombre",
    CEDULA:          "Cedula",
    CARGO:           "Cargo",
    FECHA_SOLICITUD: "Fecha de solicitud",
    TIPO:            "Tipo_Permiso",
    FECHA_INICIO:    "Fecha de permiso",
    FECHA_FIN:       "Fecha fin de permiso",
    HORAS:           "Horas Permiso",
    MOTIVO:          "Motivo_Permiso",
    REMUNERADO:      "Remunerado",
    COMPENSADO:      "Compensado",
    FECHA_COMP:      "Fecha de compensatorio",
    ESTADO:          "Estado_Permiso",
    REVISADO:        "Revisado",
    // Firma del trabajador
    FIRMA_S3_KEY:      "Firma_S3_Key",
    FECHA_FIRMA_TRAB:  "Fecha_Firma_Trabajador",
    FIRMA_TRAB_ADJUNTO: "Firma_Trabajador_Base64",
    FIRMA_TRAB_TEXTO:  "Firma_Trabajador",
    // Documento oficial generado al autorizar.
    // ⚠️ NO escribir en ARCHIVO_GENERADO ni NOMBRE_ARCHIVO: contienen los
    // documentos HTML del sistema anterior en S3 y son solo de lectura.
    PDF_AUTORIZACION_URL:    "PDF_Autorizacion_URL",
    PDF_AUTORIZACION_S3_KEY: "PDF_Autorizacion_S3_Key",
    HASH_DOCUMENTO:          "Hash_Documento",
    PDF_FIRMADO:             "PDF_Firmado",
    // Gemelo de PDF_AUTORIZACION_URL heredado del sistema anterior, pero de
    // escritura: guarda el mismo enlace estable a /api/documentos.
    URL_PDF_FIRMADO:         "URL_PDF_Firmado",
    FIRMA_GESTION:           "Firma_Gestion_Ser",
    FECHA_FIRMA_GESTION:     "Fecha_Firma_Gestion",
    // Documentos heredados del sistema anterior (solo lectura)
    ARCHIVO_GENERADO:  "Archivo_Generado",
    NOMBRE_ARCHIVO:    "Nombre_Archivo",
    DOCUMENTO_ADJUNTO: "Documento",
    // Datos del aprobador que firma el documento
    FIRMA_APROBADOR:        "Firma_Aprobador",
    FECHA_FIRMA_APROBADOR:  "Fecha_Firma_Aprobador",
    FIRMANTE_APROB_NOMBRE:  "Firmante_Aprobador_Nombre",
    FIRMANTE_APROB_CEDULA:  "Firmante_Aprobador_Cedula",
    FIRMANTE_APROB_CARGO:   "Firmante_Aprobador_Cargo",
    DIAS_COMPENSACION:      "Dias_Compensacion_Detalle",
    // Plan con el que se repone el tiempo. Lo elige Gestión del Ser al autorizar;
    // si lo deja vacío, el colaborador escoge desde su lista de solicitudes.
    // Vacío + COMPENSADO = true es la señal de "falta definir cómo repone".
    PLAN_COMPENSACION:      "Plan_Compensacion",
  },
  VACACIONES: {
    NOMBRE:              "Nombre",
    CEDULA:              "Cedula",
    CARGO:               "Cargo",
    FECHA_PRESENTACION:  "Fecha de Presentacion",
    FECHA_INICIO:        "Fecha Inicio",
    FECHA_FIN:           "Fecha Fin",
    FECHA_REINTEGRO:     "Fecha Reintegro",
    DIAS:                "Dias Vacaciones",
    MOTIVO:              "Motivo",
    ESTADO:              "Estado Solicitud",
    // Firma del trabajador
    FIRMA_S3_KEY:       "Firma_S3_Key",
    FECHA_FIRMA_TRAB:   "Fecha_Firma_Trabajador",
    FIRMA_TRAB_ADJUNTO: "Firma_Trabajador",
    // Documento oficial generado al autorizar.
    // ⚠️ NO escribir en ARCHIVO_GENERADO ni NOMBRE_ARCHIVO: contienen los
    // documentos HTML del sistema anterior en S3 y son solo de lectura.
    PDF_AUTORIZACION_URL:    "PDF_Autorizacion_URL",
    PDF_AUTORIZACION_S3_KEY: "PDF_Autorizacion_S3_Key",
    HASH_DOCUMENTO:          "Hash_Documento",
    FIRMA_GESTION:           "Firma_Gestion_Ser",
    // Documentos heredados del sistema anterior (solo lectura)
    ARCHIVO_GENERADO:  "Archivo",
    NOMBRE_ARCHIVO:    "Nombre Archivo",
  },
  NOVEDADES: {
    TIPO:           "Tipo de Novedad",
    DESCRIPCION:    "Descripción de la Novedad",
    HORAS_EXTRA:    "Número Horas Extras",
    ESTADO:         "Estado del Registro",
    FECHA_CREACION: "Fecha Creación",
    ADJUNTOS:       "Documentación Adicional",
  },
  DIAS_SIRIANOS: {
    ID_COLABORADOR:   "id_colaborador_core",
    SALDO_DISPONIBLE: "saldo_disponible",
    SALDO_USADO:      "saldo_usado",
    PERIODO:          "periodo",
    FECHA_ULTIMO_USO: "fecha_ultimo_uso",
    OBSERVACIONES:    "observaciones",
    ESTADO:           "estado",
  },
  ASISTENCIA: {
    // ⚠️ El nombre real del campo primario empieza con un BOM (U+FEFF) que dejó
    // la importación por CSV. Sin ese carácter Airtable responde
    // UNKNOWN_FIELD_NAME. Se escribe escapado porque es invisible en el editor.
    EMPLEADO_RECORD_ID: "\uFEFFEmpleado_RecordID",
    NOMBRE:     "Nombre_Empleado",
    CEDULA:     "Cedula",
    TIPO:       "Tipo",
    FECHA:      "Fecha",
    HORA:       "Hora",
    FECHA_HORA: "Fecha_Hora",
    UBICACION:  "Ubicacion",
    NOTAS:      "Notas",
    NOVEDADES:  "Novedades_Asistencia",
  },
  REPORTE_ASISTENCIA: {
    DOCUMENTO:  "documento",
    NOMBRE:     "nombre",
    TURNO:      "turno",
    PUNTO:      "punto",
    FECHA:      "fecha",
    HORA:       "hora",
    FECHA_HORA: "fechaHora",
    /** Minuto del día de la marcación (09:21:52 → 561). */
    MINUTOS:    "minutosDelDia",
    EVENTO:     "evento",
    REGISTRO:   "registro",
  },
} as const;

// ── Estados de actividad (tabla Personal) ─────────────────────────────────────
export const ESTADOS_ACTIVIDAD = {
  ACTIVO:  "Activo",
  DE_BAJA: "De baja",
} as const;

// ── Estado inicial de nuevas solicitudes ──────────────────────────────────────
export const ESTADO_PENDIENTE = "Pendiente";

/**
 * Estados con los que una solicitud queda aprobada. Son tres porque cada tabla
 * nombra distinto la misma decisión: permisos "Concedido", vacaciones
 * "Aprobado" y los registros heredados "Autorizado".
 */
export const ESTADOS_APROBADOS = ["Concedido", "Aprobado", "Autorizado"] as const;

// ── Campos del flujo de autorización (comunes a las 3 tablas de solicitudes) ──
export const FIELDS_AUTORIZACION = {
  FECHA:              "Fecha_Autorizacion",
  COMENTARIO:         "Comentario_Autorizacion",
  AUTORIZADO_POR_ID:  "Autorizado_Por_ID",
  AUTORIZADO_POR_NOM: "Autorizado_Por_Nombre",
  FIRMA_S3_KEY:       "Firma_Autorizador_S3_Key",
  FECHA_FIRMA:        "Fecha_Firma_Autorizador",
} as const;

// ── Periodo actual de días sirianos ───────────────────────────────────────────
export const PERIODO_ACTUAL = "2026-S2";
