/**
 * Cliente S3 para almacenamiento seguro de archivos
 *
 * Características de seguridad:
 * - Sin operaciones de borrado (NUNCA se usa deleteObject)
 * - Encriptación AES-256 en reposo
 * - Versionamiento habilitado en bucket
 * - URLs firmadas con expiración corta (5 min)
 * - Metadatos de auditoría en cada archivo
 */

import { S3Client } from "@aws-sdk/client-s3";

// Cliente S3 singleton
let s3Client: S3Client | null = null;

/**
 * Valida que todas las variables de entorno de S3 estén configuradas
 */
function validateS3Env(): void {
  const requiredEnvVars = [
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "S3_BUCKET_FIRMAS",
  ] as const;

  const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missing.length > 0) {
    throw new Error(
      `Variables de entorno de S3 no configuradas: ${missing.join(", ")}\n` +
        `Consulta docs/S3_SETUP.md para instrucciones de configuración.`
    );
  }
}

export function getS3Client(): S3Client {
  // Validar solo cuando se solicita el cliente (lazy validation)
  validateS3Env();

  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3Client;
}

export const S3_CONFIG = {
  BUCKET_FIRMAS: process.env.S3_BUCKET_FIRMAS!,
  REGION: process.env.AWS_REGION!,

  // Tiempo de expiración de URLs firmadas (5 minutos)
  SIGNED_URL_EXPIRATION: 300,

  // Prefijos de rutas en el bucket
  PATHS: {
    FIRMAS_PERMISOS: "firmas/permisos",
    FIRMAS_VACACIONES: "firmas/vacaciones",
    FIRMAS_CONTRATOS: "firmas/contratos",
    // Firmas de quien autoriza una solicitud (distintas de las del trabajador)
    FIRMAS_AUTORIZACIONES: "firmas/autorizaciones",
    // PDFs de permisos de día siriano (documentos ya autorizados)
    PDF_PERMISOS_SIRIANOS: "permisos/dias-sirianos",
    // PDFs de solicitudes resueltas por el flujo de autorización
    PDF_AUTORIZACIONES: "autorizaciones",
  },
} as const;
