import { describe, it, expect } from "vitest";
import { PDFDocument, PDFName } from "pdf-lib";
import { generarPdfPermisoSiriano } from "./permiso-siriano";
import { FIRMA_FIXTURE_TAMANO } from "@/test/firma-fixture";

// PNG 2x2 válido — simula la firma capturada en el canvas.
const FIRMA_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8DwHwMDAwMDAwMDAwB9BQMBu0mSUwAAAABJRU5ErkJggg==";

/** ¿El documento trae incrustada una imagen de ese tamaño en píxeles? */
async function tieneImagen(bytes: Uint8Array, ancho: number, alto: number): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  const valor = (dict: { get: (k: unknown) => unknown }, clave: string) =>
    (dict.get(PDFName.of(clave)) as { asNumber?: () => number } | undefined)?.asNumber?.();

  for (const [, objeto] of doc.context.enumerateIndirectObjects()) {
    const dict = (objeto as { dict?: { get: (k: unknown) => unknown } }).dict;
    if (!dict || dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    if (valor(dict, "Width") === ancho && valor(dict, "Height") === alto) return true;
  }
  return false;
}

/** Tamaño en píxeles de la firma institucional que inyecta el setup de Vitest. */
const FIRMA_GESTION = FIRMA_FIXTURE_TAMANO;

// Colaborador ficticio: los tests no llevan datos de personas reales.
const BASE = {
  solicitudId: "recTEST123456789",
  nombre: "Juliana Restrepo Ochoa",
  cedula: "1111111111",
  cargo: "INGENIERO DE DESARROLLO",
  idCore: "SIRIUS-PER-9001",
  fechaPermiso: "2026-07-31",
  fechaSolicitud: "2026-07-30",
  motivo: "Diligencia personal acordada previamente con jefatura.",
  periodo: "2026-S2",
  saldoRestante: 1,
};

describe("generarPdfPermisoSiriano", () => {
  it("emite un PDF de una página con la firma incrustada", async () => {
    const bytes = await generarPdfPermisoSiriano({ ...BASE, firmaBase64: FIRMA_PNG });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toContain(BASE.nombre);
  });

  it("no falla si la firma no es un PNG válido", async () => {
    const bytes = await generarPdfPermisoSiriano({ ...BASE, firmaBase64: "no-es-png" });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("mantiene una sola página con un motivo muy largo", async () => {
    const bytes = await generarPdfPermisoSiriano({
      ...BASE,
      motivo: "Motivo extenso con acentos áéíóúñ. ".repeat(80),
      firmaBase64: FIRMA_PNG,
    });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("acepta motivo vacío y saldo en cero", async () => {
    const bytes = await generarPdfPermisoSiriano({ ...BASE, motivo: "", saldoRestante: 0 });

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  // El día siriano nace autorizado: si el documento saliera sin la firma de
  // Gestión del Ser, el único papel del trámite no acreditaría la autorización.
  // Se cuentan las imágenes incrustadas porque el trazo no deja texto que buscar.
  it("incrusta la firma institucional aunque el trabajador no haya firmado", async () => {
    for (const firmaBase64 of [FIRMA_PNG, undefined]) {
      const bytes = await generarPdfPermisoSiriano({ ...BASE, firmaBase64 });

      expect(await tieneImagen(bytes, FIRMA_GESTION.ancho, FIRMA_GESTION.alto)).toBe(true);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    }
  });
});
