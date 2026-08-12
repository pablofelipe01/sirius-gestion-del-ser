export const TIPOS_PERMISO = [
  "Día Siriano",
  "Médico / Cita médica",
  "Personal",
  "Calamidad doméstica",
  "Capacitación / Formación",
  "Trámite legal o personal",
  "Jurado de votación",
  "Lactancia",
  "Otro",
] as const;

export const TIPOS_NOVEDAD = [
  "Horas Extra",
  "Incapacidad médica",
  "Cambio de horario",
  "Trabajo remoto",
  "Registro biométrico incompleto",
  "Licencia de maternidad / paternidad",
  "Otra",
] as const;

export const TIPO_HORAS_EXTRA = "Horas Extra" as const;
export const TIPO_DIA_SIRIANO = "Día Siriano" as const;
/** Requiere que el usuario especifique el tipo en texto libre. */
export const TIPO_PERMISO_OTRO = "Otro" as const;
export const TIPO_NOVEDAD_OTRA = "Otra" as const;
