/**
 * Módulo S3 para Sirius Gestión del Ser
 *
 * Proporciona almacenamiento seguro de firmas digitales con:
 * - Encriptación AES-256 en reposo
 * - Versionamiento habilitado (preserva historial)
 * - URLs firmadas con expiración corta
 * - Sin operaciones de borrado (seguridad)
 * - Metadatos de auditoría completos
 *
 * Estructura de carpetas en S3:
 * ├── firmas/
 * │   ├── permisos/
 * │   │   └── {idCore}/
 * │   │       └── {timestamp}_{cedula}.png
 * │   ├── vacaciones/
 * │   │   └── {idCore}/
 * │   │       └── {timestamp}_{cedula}.png
 * │   ├── contratos/
 * │   │   └── {idCore}/
 * │   │       └── {timestamp}_{cedula}.png
 * │   └── autorizaciones/        Firmas de quien autoriza (no del trabajador)
 * │       └── {idCore}/
 * │           └── {timestamp}_{cedula}.png
 * ├── permisos/
 * │   └── dias-sirianos/         PDFs de permisos de día siriano (ya autorizados)
 * │                              (`dias-pacto/` es el prefijo anterior al renombre
 * │                               y sigue siendo legible, no se escribe más)
 * │       └── {año}/{mes}/
 * │           └── {idCore}_{cedula}_{fecha}_{timestamp}.pdf
 * └── autorizaciones/            PDFs de solicitudes resueltas (aprobadas o rechazadas)
 *     └── {permiso|vacaciones}/
 *         └── {año}/{mes}/
 *             └── {idCore}_{recordId}_{timestamp}.pdf
 */

export { getS3Client, S3_CONFIG } from "./client";
export {
  uploadFirmaTrabajador,
  uploadPdfPermisoSiriano,
  uploadPdfAutorizacion,
  validateS3Key,
  type UploadFirmaParams,
  type UploadFirmaResult,
  type UploadPdfPermisoSirianoParams,
  type UploadPdfAutorizacionParams,
  type UploadPdfResult,
} from "./upload";
export {
  getSignedUrlForFirma,
  getSignedUrlsForFirmas,
  descargarObjetoS3,
  obtenerObjetoS3,
  type GetSignedUrlParams,
  type ObjetoS3,
} from "./download";
