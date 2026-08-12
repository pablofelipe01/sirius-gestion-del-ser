// Subset de Airtable schema para el módulo de solicitudes.
// Cubre únicamente las tablas de Novedades Nómina (appnRVYZMd4EAQoRF).
// Los nombres de tabla se leen de env vars para permitir sobreescritura por entorno.

export const TABLES = {
  PERMISO:    process.env.AIRTABLE_TABLE_SOLICITUD_PERMISO     ?? "Solicitud_Permiso",
  VACACIONES: process.env.AIRTABLE_TABLE_SOLICITUD_VACACIONES  ?? "Solicitud_Vacaciones",
  NOVEDADES:  process.env.AIRTABLE_TABLE_NOVEDADES_NOMINA      ?? "Reportes Novedades Nomina",
} as const;

// FK canónica del empleado en todas las tablas de solicitudes.
// Valor: "SIRIUS-PER-XXXX" (idCore del payload de sesión).
export const FK_ID_CORE = "ID Personal Core";

export const FIELDS = {
  PERMISO: {
    NOMBRE:               "Nombre",
    CEDULA:               "Cedula",
    CARGO:                "Cargo",
    FECHA_SOLICITUD:      "Fecha de solicitud",
    TIPO:                 "Tipo_Permiso",
    FECHA_INICIO:         "Fecha de permiso",
    FECHA_FIN:            "Fecha fin de permiso",
    HORAS:                "Horas Permiso",
    MOTIVO:               "Motivo_Permiso",
    REMUNERADO:           "Remunerado",
    COMPENSADO:           "Compensado",
    FECHA_COMP:           "Fecha de compensatorio",
    ESTADO:               "Estado_Permiso",
    DIAS_SIRIANOS_LINK:   "Dias_Sirianos",  // Relación multipleRecordLinks → tabla Dias_Sirianos
    REVISADO:             "Revisado",
    FIRMA_S3_KEY:         "Firma_S3_Key",
    FECHA_FIRMA_TRAB:     "Fecha_Firma_Trabajador",
    // Gemelos de la firma del trabajador: la tabla arrastra tres campos para el
    // mismo dato (S3 key, adjunto y texto). Se llenan los tres al radicar.
    FIRMA_TRAB_ADJUNTO:   "Firma_Trabajador_Base64",
    FIRMA_TRAB_TEXTO:     "Firma_Trabajador",
    FIRMA_AUTORIZADOR_S3: "Firma_Autorizador_S3_Key",
    FECHA_FIRMA_AUTORIZADOR: "Fecha_Firma_Autorizador",
    AUTORIZADO_POR_ID:    "Autorizado_Por_ID",
    AUTORIZADO_POR_NOM:   "Autorizado_Por_Nombre",
    FECHA_AUTORIZACION:   "Fecha_Autorizacion",
    COMENTARIO_AUTORIZACION: "Comentario_Autorizacion",
    DIAS_COMPENSACION:    "Dias_Compensacion_Detalle",
    // Plan con el que se repone el tiempo (ver src/lib/compensacion.ts). Vacío
    // —y sin DIAS_COMPENSACION— con COMPENSADO = true significa que aún falta
    // definir cómo repone el trabajador.
    PLAN_COMPENSACION:      "Plan_Compensacion",
    URL_PDF:              "URL_PDF_Firmado",
    NOMBRE_ARCHIVO:       "Nombre_Archivo",
    HASH_DOCUMENTO:       "Hash_Documento",
    // Gemelos del documento oficial, los mismos que llena /api/solicitudes/autorizar.
    PDF_AUTORIZACION_URL:    "PDF_Autorizacion_URL",
    PDF_AUTORIZACION_S3_KEY: "PDF_Autorizacion_S3_Key",
    PDF_FIRMADO:             "PDF_Firmado",
  },
  VACACIONES: {
    NOMBRE:             "Nombre",
    CEDULA:             "Cedula",
    CARGO:              "Cargo",
    FECHA_PRESENTACION: "Fecha de Presentacion",
    FECHA_INICIO:       "Fecha Inicio",
    FECHA_FIN:          "Fecha Fin",
    FECHA_REINTEGRO:    "Fecha Reintegro",
    DIAS:               "Dias Vacaciones",
    MOTIVO:             "Motivo",
    ESTADO:             "Estado Solicitud",
    FIRMA_S3_KEY:       "Firma_S3_Key",
    FECHA_FIRMA_TRAB:   "Fecha_Firma_Trabajador",
    FIRMA_AUTORIZADOR_S3: "Firma_Autorizador_S3_Key",
    FECHA_FIRMA_AUTORIZADOR: "Fecha_Firma_Autorizador",
    AUTORIZADO_POR_ID:  "Autorizado_Por_ID",
    AUTORIZADO_POR_NOM: "Autorizado_Por_Nombre",
    FECHA_AUTORIZACION: "Fecha_Autorizacion",
    COMENTARIO_AUTORIZACION: "Comentario_Autorizacion",
  },
  NOVEDADES: {
    TIPO:           "Tipo de Novedad",
    OTRA_TIPO:      "Otra Tipo",
    DESCRIPCION:    "Descripción de la Novedad",
    HORAS_EXTRA:    "Número Horas Extras",
    ESTADO:         "Estado del Registro",
    FECHA_CREACION: "Fecha Creación",
    FIRMA_AUTORIZADOR_S3: "Firma_Autorizador_S3_Key",
    FECHA_FIRMA_AUTORIZADOR: "Fecha_Firma_Autorizador",
    AUTORIZADO_POR_ID:  "Autorizado_Por_ID",
    AUTORIZADO_POR_NOM: "Autorizado_Por_Nombre",
    FECHA_AUTORIZACION: "Fecha_Autorizacion",
    COMENTARIO_AUTORIZACION: "Comentario_Autorizacion",
  },
} as const;

export const ESTADO_PENDIENTE = "Pendiente";
/** Estado de un permiso aprobado (opción del singleSelect Estado_Permiso). */
export const ESTADO_CONCEDIDO = "Concedido";
/**
 * Estados con los que una solicitud queda aprobada. Los tres conviven porque
 * cada tabla nombra distinto la misma decisión (permisos "Concedido",
 * vacaciones "Aprobado", registros antiguos "Autorizado").
 */
export const ESTADOS_APROBADOS = ["Concedido", "Aprobado", "Autorizado"] as const;
export const PERIODO_ACTUAL = "2026-S2";
