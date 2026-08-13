/**
 * Firma institucional de Gestion del Ser para los documentos PDF.
 *
 * Es el mismo trazo que llevaban los permisos en HTML del sistema anterior
 * (bloque "Firma Gestion del Ser / Aprobador"). Solo la usan los permisos por
 * Dia Siriano, que nacen autorizados. Un permiso normal se firma con el trazo
 * que dibuja quien autoriza en ModalAutorizarSolicitud: ahi la firma acredita
 * una decision concreta y no puede ser una imagen fija.
 *
 * ⚠️ **El PNG viaja en `FIRMA_GESTION_SER_BASE64` (variable de entorno), no en
 * el codigo.** Estuvo empotrado aqui en base64 hasta la auditoria de 2026-08-13:
 * una firma manuscrita es un instrumento de autenticacion, y en el repositorio
 * quedaba legible para cualquiera con acceso al codigo, a un fork o al historial
 * —del que no se puede retirar—. En una variable de entorno se rota y su alcance
 * se limita a quien despliega.
 *
 * Sigue sin leerse de S3 ni de `public/` en tiempo de ejecucion: la variable se
 * resuelve en el proceso, asi que el documento no depende de la red ni de que el
 * despliegue tenga acceso al bucket.
 *
 * PNG de 264 x 152 px, fondo transparente.
 */

/** Nombre de la variable que trae el PNG en base64, sin el prefijo `data:`. */
const VAR_ENTORNO = "FIRMA_GESTION_SER_BASE64";

/** Cabecera de un PNG valido — los 3 bytes que siguen al 0x89 inicial. */
const MAGIC_PNG = "PNG";

/** Memoriza la validacion: la firma no cambia durante la vida del proceso. */
let cache: { base64: string; png: Buffer } | null = null;

/**
 * Devuelve el trazo institucional, validado.
 *
 * **Lanza si la variable falta o no trae un PNG.** No devuelve vacio a
 * proposito: un documento oficial sin firma no acredita la autorizacion que el
 * propio texto declara, y ese fallo es invisible en el PDF resultante — es el
 * mismo error que ya se colo una vez cuando `tarjetaFirma()` se tragaba la
 * excepcion. Quien la llama al emitir el PDF ya trata el fallo como "documento
 * no emitido, permiso igual registrado".
 */
function firmaGestionSer(): { base64: string; png: Buffer } {
  if (cache) return cache;

  const base64 = (process.env[VAR_ENTORNO] ?? "").trim();
  if (!base64) {
    throw new Error(
      `Falta ${VAR_ENTORNO}: sin la firma institucional no se puede emitir el ` +
        `documento del dia siriano. Ver .env.example.`
    );
  }

  const png = Buffer.from(base64, "base64");
  if (png.subarray(1, 4).toString("latin1") !== MAGIC_PNG) {
    throw new Error(
      `${VAR_ENTORNO} no contiene un PNG en base64 (¿quedo el prefijo data: o ` +
        `un salto de linea de por medio?).`
    );
  }

  cache = { base64, png };
  return cache;
}

/** El PNG del trazo en base64, tal como lo esperan S3 y los adjuntos de Airtable. */
export function firmaGestionSerBase64(): string {
  return firmaGestionSer().base64;
}

/**
 * El PNG ya decodificado, para incrustarlo en el PDF.
 *
 * ⚠️ Se devuelve copiado en un `Uint8Array` y no el `Buffer`: `pdf-lib` comprueba
 * el tipo con `instanceof`, y un `Buffer` de Node no lo pasa cuando el codigo
 * corre en otro realm (jsdom, en los tests).
 */
export function firmaGestionSerPng(): Uint8Array {
  return new Uint8Array(firmaGestionSer().png);
}

/**
 * Identidad que se imprime bajo el trazo.
 *
 * Sin nombre propio ni cedula: el documento anterior tampoco los traia, y la
 * firma acredita a la dependencia —Gestion del Ser— no a una persona que
 * hubiera revisado el caso. La tarjeta del PDF ya sabe pintar "C.C. —".
 */
export const FIRMANTE_GESTION_SER = {
  nombre: "Gestión del Ser",
  cedula: "",
  cargo: "Firma Aprobador",
} as const;
