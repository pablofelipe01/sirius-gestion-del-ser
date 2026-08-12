import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generarPdfPermisoSiriano } from "./permiso-siriano";

// PNG 2x2 válido — simula la firma capturada en el canvas.
const FIRMA_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR42mP8z8DwHwMDAwMDAwMDAwB9BQMBu0mSUwAAAABJRU5ErkJggg==";

const BASE = {
  solicitudId: "recTEST123456789",
  nombre: "Hermes David Hernández García",
  cedula: "1006774686",
  cargo: "INGENIERO DE DESARROLLO",
  idCore: "SIRIUS-PER-0002",
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
    expect(doc.getTitle()).toContain("Hermes David Hernández García");
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
});
