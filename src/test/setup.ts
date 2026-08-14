/**
 * Setup global de Vitest.
 *
 * La firma institucional de Gestión del Ser ya no viaja en el código: vive en
 * `FIRMA_GESTION_SER_BASE64` (ver `src/lib/pdf/firma-gestion-ser.ts`). Los tests
 * que emiten el PDF del día siriano necesitan *una* firma, no *la* firma, así
 * que aquí se inyecta un trazo sintético con las mismas dimensiones que el real.
 *
 * Meter la firma auténtica en el repositorio —aunque fuera «solo para tests»—
 * desharía justo lo que se ganó al sacarla: una firma manuscrita es un
 * instrumento de autenticación y el historial de git no se puede reescribir.
 */

import { FIRMA_FIXTURE_BASE64 } from "./firma-fixture";

process.env.FIRMA_GESTION_SER_BASE64 ??= FIRMA_FIXTURE_BASE64;
