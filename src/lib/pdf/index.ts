/**
 * Generación de documentos PDF de Gestión del Ser.
 */

export {
  generarPdfPermisoSiriano,
  type PermisoSirianoPdfParams,
} from "./permiso-siriano";

export {
  firmaGestionSerBase64,
  firmaGestionSerPng,
  FIRMANTE_GESTION_SER,
} from "./firma-gestion-ser";

export {
  generarPdfAutorizacion,
  formatearFechaLarga,
  type AutorizacionPdfParams,
  type DiaCompensacionPdf,
  type TipoSolicitudPdf,
} from "./autorizacion";
