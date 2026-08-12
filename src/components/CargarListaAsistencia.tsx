"use client";

/**
 * Carga de la lista de asistencia del biométrico para que n8n la procese.
 *
 * Se monta en la pestaña de novedades del histórico y solo para quien tiene
 * alcance sobre toda la empresa: la lista trae los datos de todos.
 */

import { useRef, useState } from "react";
import Link from "next/link";

const EXTENSIONES = ".xlsx,.xls,.csv";
const COLOR = "#e07b39"; // color del sub-módulo de novedades

type Estado =
  | { fase: "inactivo" }
  | { fase: "enviando" }
  | { fase: "listo"; mensaje: string; detalle?: string }
  | { fase: "error"; mensaje: string; detalle?: string };

/** "1,4 MB" — tamaño legible del archivo elegido. */
function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Resumen legible de lo que respondió el flujo de n8n. */
function resumirRespuesta(respuesta: unknown): string | undefined {
  if (respuesta === null || respuesta === undefined || respuesta === "") return undefined;
  if (typeof respuesta === "string") return respuesta.slice(0, 400);
  try {
    return JSON.stringify(respuesta, null, 1).slice(0, 400);
  } catch {
    return undefined;
  }
}

export default function CargarListaAsistencia() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "inactivo" });
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function elegir(nuevo: File | null | undefined) {
    if (!nuevo) return;
    setArchivo(nuevo);
    setEstado({ fase: "inactivo" });
  }

  function limpiar() {
    setArchivo(null);
    setEstado({ fase: "inactivo" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function enviar() {
    if (!archivo) return;
    setEstado({ fase: "enviando" });

    try {
      const cuerpo = new FormData();
      cuerpo.append("archivo", archivo);

      const res = await fetch("/api/asistencia/lista", { method: "POST", body: cuerpo });
      const datos = await res.json().catch(() => ({}));

      if (!res.ok) {
        setEstado({
          fase: "error",
          mensaje: datos?.error ?? "No se pudo procesar la lista.",
          detalle: datos?.detalle,
        });
        return;
      }

      setEstado({
        fase: "listo",
        mensaje: `«${datos.archivo}» se envió a procesar.`,
        detalle: resumirRespuesta(datos.respuesta),
      });
      setArchivo(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch {
      setEstado({ fase: "error", mensaje: "Error de conexión. Intenta de nuevo." });
    }
  }

  const enviando = estado.fase === "enviando";

  return (
    <div className="border-b border-white/10 bg-[#e07b39]/10 px-6 py-5 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Lista de asistencia</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-white/75">
            Carga el archivo del biométrico ({EXTENSIONES.replaceAll(",", ", ")}) y se envía a
            procesar. Quedará registrado quién lo subió.
          </p>
        </div>
        <Link
          href="/dashboard/asistencia/reporte"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/12 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 3v11.25A2.25 2.25 0 006 16.5h12M7.5 12l3-3 2.25 2.25L18 6"
            />
          </svg>
          Ver reporte de asistencia
        </Link>
      </div>

      {/* Zona de carga */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          if (!enviando) elegir(e.dataTransfer.files?.[0]);
        }}
        className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 transition-colors ${
          arrastrando
            ? "border-[#e07b39] bg-[#e07b39]/20"
            : "border-[#e07b39]/40 bg-white/[0.04]"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={EXTENSIONES}
          onChange={(e) => elegir(e.target.files?.[0])}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/12 hover:text-white disabled:opacity-30"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 16.5V9m0 0l-3 3m3-3l3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
          {archivo ? "Cambiar archivo" : "Elegir archivo"}
        </button>

        <p className="min-w-0 flex-1 truncate text-sm text-white/80">
          {archivo ? (
            <>
              <span className="font-medium text-white/90">{archivo.name}</span>{" "}
              <span className="text-white/70">({tamanoLegible(archivo.size)})</span>
            </>
          ) : (
            <span className="text-white/60">
              Ningún archivo elegido — también puedes arrastrarlo aquí
            </span>
          )}
        </p>

        {archivo && !enviando && (
          <button
            type="button"
            onClick={limpiar}
            className="rounded-lg px-2 py-2 text-sm text-white/75 transition-colors hover:bg-white/10 hover:text-white"
          >
            Quitar
          </button>
        )}

        <button
          type="button"
          onClick={enviar}
          disabled={!archivo || enviando}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:translate-y-0"
          style={{ background: COLOR, boxShadow: `0 14px 30px -18px ${COLOR}` }}
        >
          {enviando ? (
            <>
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path
                  d="M22 12a10 10 0 01-10 10"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </svg>
              Procesando…
            </>
          ) : (
            "Enviar a procesar"
          )}
        </button>
      </div>

      {enviando && (
        <p className="mt-3 text-xs italic text-white/70">
          Puede tardar un par de minutos según el tamaño de la lista. No cierres la página.
        </p>
      )}

      {(estado.fase === "listo" || estado.fase === "error") && (
        <div
          className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
            estado.fase === "listo"
              ? "border-green-400/35 bg-green-500/12 text-green-200"
              : "border-rose-400/35 bg-rose-500/12 text-rose-200"
          }`}
        >
          <p>{estado.mensaje}</p>
          {estado.detalle && (
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-black/35 p-2 text-xs whitespace-pre-wrap text-white/80">
              {estado.detalle}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
