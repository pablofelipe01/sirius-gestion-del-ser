"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { FIELDS, FK_ID_CORE, FIELDS_AUTORIZACION } from "@/lib/airtable-schema";
import { parseDiasCompensacion } from "@/lib/compensacion";
import CargarListaAsistencia from "./CargarListaAsistencia";

type Categoria = "permisos" | "vacaciones" | "novedades";
type Tab = "todas" | Categoria | "documentos";

interface Registro {
  id: string;
  fields: Record<string, unknown>;
  empleado?: { nombre: string; cedula: string } | null;
}

/** Documento tal como lo entrega /api/solicitudes/historico. */
interface Documento {
  id: string;
  categoria: Categoria;
  recordId: string;
  clase: "autorizacion" | "firma" | "adjunto" | "heredado";
  titulo: string;
  url: string;
  tamano?: number;
  formato?: string;
  nombre: string;
  cedula: string;
  fecha: string;
}

interface Respuesta {
  alcance: "propio" | "todos" | "areas";
  solicitudes: Record<Categoria, Registro[]>;
  documentos: Documento[];
}

/** Fila normalizada: las 3 tablas tienen campos distintos, la UI necesita una sola forma. */
interface Fila {
  id: string;
  categoria: Categoria;
  nombre: string;
  cedula: string;
  cargo: string;
  idCore: string;
  /** Resumen corto que se muestra en la columna "Detalle". */
  detalle: string;
  /** Timestamp para ordenar y filtrar por rango. */
  orden: number;
  /** Fecha ISO en que se radicó (YYYY-MM-DD). */
  fechaRadicado: string;
  estado: string;
  autorizadoPor: string;
  fechaAutorizacion: string;
  comentario: string;
  motivo: string;
  /** Enlace al documento oficial, si ya se generó. */
  documento: string;
  /** Pares etiqueta/valor del detalle ampliado. */
  extras: { etiqueta: string; valor: string }[];
}

const ESTILO_CATEGORIA: Record<Categoria, { etiqueta: string; chip: string; activo: string }> = {
  permisos: {
    etiqueta: "Permiso",
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    activo: "border-blue-500 text-blue-600",
  },
  vacaciones: {
    etiqueta: "Vacaciones",
    chip: "bg-green-50 text-green-700 border-green-200",
    activo: "border-green-500 text-green-600",
  },
  novedades: {
    etiqueta: "Novedad",
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    activo: "border-orange-500 text-orange-600",
  },
};

/** Naturaleza de cada documento — define etiqueta, color e icono en la tabla. */
const CLASES: Record<string, { etiqueta: string; chip: string; icono: string }> = {
  autorizacion: {
    etiqueta: "Autorización",
    chip: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icono:
      "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  firma: {
    etiqueta: "Firma",
    chip: "bg-violet-50 text-violet-700 border-violet-200",
    icono:
      "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  },
  adjunto: {
    etiqueta: "Adjunto",
    chip: "bg-sky-50 text-sky-700 border-sky-200",
    icono:
      "M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13",
  },
  heredado: {
    etiqueta: "Sistema anterior",
    chip: "bg-slate-100 text-slate-600 border-slate-200",
    icono:
      "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
};

/** Bytes → "1,4 MB". */
function fmtTamano(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fechas `date` de Airtable llegan como "YYYY-MM-DD": interpretarlas como UTC restaría un día. */
function fmtFecha(valor: unknown): string {
  if (typeof valor !== "string" || !valor) return "—";
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const d = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor);
  if (isNaN(d.getTime())) return valor;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

function txt(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  return String(valor).trim();
}

function iso(valor: unknown): string {
  return typeof valor === "string" ? valor.slice(0, 10) : "";
}

/** Estilo del badge de estado — mismos colores que el resto del dashboard. */
function estiloEstado(estado: string): string {
  const e = estado.toLowerCase();
  if (!e) return "bg-gray-100 text-gray-600";
  if (e === "pendiente") return "bg-yellow-100 text-yellow-800";
  if (["concedido", "aprobado", "autorizado", "resuelto"].includes(e))
    return "bg-green-100 text-green-700";
  if (["rechazado", "no autorizado"].includes(e)) return "bg-red-100 text-red-700";
  if (e === "revisado") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
}

function normalizar(categoria: Categoria, r: Registro): Fila {
  const f = r.fields;
  const base = {
    id: r.id,
    categoria,
    nombre: txt(f[FIELDS.PERMISO.NOMBRE]) || r.empleado?.nombre || "Sin nombre",
    cedula: txt(f[FIELDS.PERMISO.CEDULA]) || r.empleado?.cedula || "",
    cargo: txt(f[FIELDS.PERMISO.CARGO]),
    idCore: txt(f[FK_ID_CORE]),
    autorizadoPor: txt(f[FIELDS_AUTORIZACION.AUTORIZADO_POR_NOM]),
    fechaAutorizacion: iso(f[FIELDS_AUTORIZACION.FECHA]),
    comentario: txt(f[FIELDS_AUTORIZACION.COMENTARIO]),
  };

  if (categoria === "permisos") {
    const inicio = iso(f[FIELDS.PERMISO.FECHA_INICIO]);
    const fin = iso(f[FIELDS.PERMISO.FECHA_FIN]);
    const horas = txt(f[FIELDS.PERMISO.HORAS]);
    return {
      ...base,
      detalle: [txt(f[FIELDS.PERMISO.TIPO]), horas && `${horas} h`].filter(Boolean).join(" · "),
      orden: new Date(iso(f[FIELDS.PERMISO.FECHA_SOLICITUD]) || inicio || 0).getTime() || 0,
      fechaRadicado: iso(f[FIELDS.PERMISO.FECHA_SOLICITUD]),
      estado: txt(f[FIELDS.PERMISO.ESTADO]),
      motivo: txt(f[FIELDS.PERMISO.MOTIVO]),
      documento: txt(f[FIELDS.PERMISO.PDF_AUTORIZACION_URL]),
      extras: [
        { etiqueta: "Desde", valor: fmtFecha(inicio) },
        ...(fin && fin !== inicio ? [{ etiqueta: "Hasta", valor: fmtFecha(fin) }] : []),
        { etiqueta: "Horas", valor: horas || "—" },
        { etiqueta: "Remunerado", valor: f[FIELDS.PERMISO.REMUNERADO] ? "Sí" : "No" },
        { etiqueta: "Compensatorio", valor: f[FIELDS.PERMISO.COMPENSADO] ? "Sí" : "No" },
        ...(f[FIELDS.PERMISO.COMPENSADO]
          ? [
              {
                etiqueta: "Plan de reposición",
                valor:
                  txt(f[FIELDS.PERMISO.PLAN_COMPENSACION]) ||
                  "Falta definir cómo se repone",
              },
            ]
          : []),
        ...diasCompensacion(f[FIELDS.PERMISO.DIAS_COMPENSACION]),
      ],
    };
  }

  if (categoria === "vacaciones") {
    return {
      ...base,
      detalle: `${txt(f[FIELDS.VACACIONES.DIAS]) || "?"} días`,
      orden: new Date(iso(f[FIELDS.VACACIONES.FECHA_PRESENTACION]) || 0).getTime() || 0,
      fechaRadicado: iso(f[FIELDS.VACACIONES.FECHA_PRESENTACION]),
      estado: txt(f[FIELDS.VACACIONES.ESTADO]),
      motivo: txt(f[FIELDS.VACACIONES.MOTIVO]),
      documento: txt(f[FIELDS.VACACIONES.PDF_AUTORIZACION_URL]),
      extras: [
        { etiqueta: "Inicio", valor: fmtFecha(f[FIELDS.VACACIONES.FECHA_INICIO]) },
        { etiqueta: "Fin", valor: fmtFecha(f[FIELDS.VACACIONES.FECHA_FIN]) },
        { etiqueta: "Reintegro", valor: fmtFecha(f[FIELDS.VACACIONES.FECHA_REINTEGRO]) },
        { etiqueta: "Días", valor: txt(f[FIELDS.VACACIONES.DIAS]) || "—" },
      ],
    };
  }

  const horasExtra = txt(f[FIELDS.NOVEDADES.HORAS_EXTRA]);
  return {
    ...base,
    detalle: [txt(f[FIELDS.NOVEDADES.TIPO]), horasExtra && `${horasExtra} h`]
      .filter(Boolean)
      .join(" · "),
    orden: new Date(txt(f[FIELDS.NOVEDADES.FECHA_CREACION]) || 0).getTime() || 0,
    fechaRadicado: iso(f[FIELDS.NOVEDADES.FECHA_CREACION]),
    estado: txt(f[FIELDS.NOVEDADES.ESTADO]),
    motivo: txt(f[FIELDS.NOVEDADES.DESCRIPCION]),
    // Las novedades son un registro informativo: no se autorizan, así que no
    // generan documento oficial firmado.
    documento: "",
    extras: [
      { etiqueta: "Tipo", valor: txt(f[FIELDS.NOVEDADES.TIPO]) || "—" },
      ...(horasExtra ? [{ etiqueta: "Horas extra", valor: horasExtra }] : []),
      { etiqueta: "ID empleado", valor: txt(f[FK_ID_CORE]) || "—" },
    ],
  };
}

/** Los días de compensación se guardan como JSON en un campo de texto largo. */
function diasCompensacion(valor: unknown): { etiqueta: string; valor: string }[] {
  return parseDiasCompensacion(valor).map((d, i) => ({
    etiqueta: `Compensa ${i + 1}`,
    valor: `${fmtFecha(d.fecha)} · ${d.horas} h${d.descripcion ? ` · ${d.descripcion}` : ""}`,
  }));
}

export default function HistoricoSolicitudes() {
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("todas");
  const [estado, setEstado] = useState("todos");
  const [clase, setClase] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [expandida, setExpandida] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(25);

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      const res = await fetch("/api/solicitudes/historico");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al cargar el histórico");
      }
      setDatos(await res.json());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filas = useMemo(() => {
    if (!datos) return [];
    return (Object.keys(ESTILO_CATEGORIA) as Categoria[])
      .flatMap((categoria) =>
        (datos.solicitudes[categoria] ?? []).map((r) => normalizar(categoria, r)),
      )
      .sort((a, b) => b.orden - a.orden);
  }, [datos]);

  const documentos = useMemo(() => datos?.documentos ?? [], [datos]);

  const estados = useMemo(() => {
    const set = new Set(filas.map((f) => f.estado).filter(Boolean));
    return [...set].sort();
  }, [filas]);

  const rango = useMemo(
    () => ({
      desdeTs: desde ? new Date(`${desde}T00:00:00`).getTime() : null,
      hastaTs: hasta ? new Date(`${hasta}T23:59:59`).getTime() : null,
    }),
    [desde, hasta],
  );

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const { desdeTs, hastaTs } = rango;

    return filas.filter((f) => {
      if (tab !== "todas" && tab !== "documentos" && f.categoria !== tab) return false;
      if (estado === "sin-estado" && f.estado) return false;
      if (estado !== "todos" && estado !== "sin-estado" && f.estado !== estado) return false;
      if (desdeTs !== null && f.orden && f.orden < desdeTs) return false;
      if (hastaTs !== null && f.orden && f.orden > hastaTs) return false;
      if (!q) return true;
      return [f.nombre, f.cedula, f.cargo, f.idCore, f.detalle, f.motivo, f.autorizadoPor, f.estado]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [filas, tab, estado, busqueda, rango]);

  /** Los documentos se filtran por búsqueda, clase y rango de fechas. */
  const documentosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const { desdeTs, hastaTs } = rango;

    return documentos.filter((d) => {
      if (clase !== "todas" && d.clase !== clase) return false;
      const ts = d.fecha ? new Date(`${d.fecha}T12:00:00`).getTime() : 0;
      if (desdeTs !== null && ts && ts < desdeTs) return false;
      if (hastaTs !== null && ts && ts > hastaTs) return false;
      if (!q) return true;
      return [d.titulo, d.nombre, d.cedula, ESTILO_CATEGORIA[d.categoria].etiqueta]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [documentos, clase, busqueda, rango]);

  // Al cambiar cualquier filtro se reinicia la paginación
  useEffect(() => setVisibles(25), [tab, estado, clase, busqueda, desde, hasta]);

  const resumen = useMemo(() => {
    const contar = (predicado: (f: Fila) => boolean) => filtradas.filter(predicado).length;
    const e = (f: Fila) => f.estado.toLowerCase();
    return {
      total: filtradas.length,
      pendientes: contar((f) => e(f) === "pendiente" || !f.estado),
      aprobadas: contar((f) =>
        ["concedido", "aprobado", "autorizado", "resuelto"].includes(e(f)),
      ),
      rechazadas: contar((f) => ["rechazado", "no autorizado"].includes(e(f))),
    };
  }, [filtradas]);

  const escaparCsv = (v: string) =>
    `"${(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

  function descargarCsv(nombre: string, lineas: string[]) {
    // BOM para que Excel en español reconozca los acentos
    const blob = new Blob(["\uFEFF" + lineas.join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarDocumentosCsv() {
    const lineas = [
      ["Tipo", "Documento", "Clase", "Colaborador", "Cedula", "Fecha", "Enlace"].join(","),
      ...documentosFiltrados.map((d) =>
        [
          ESTILO_CATEGORIA[d.categoria].etiqueta,
          d.titulo,
          CLASES[d.clase].etiqueta,
          d.nombre,
          d.cedula,
          d.fecha,
          d.url.startsWith("/") ? `${window.location.origin}${d.url}` : d.url,
        ]
          .map(escaparCsv)
          .join(","),
      ),
    ];
    descargarCsv("historico-documentos", lineas);
  }

  function exportarCsv() {
    if (tab === "documentos") return exportarDocumentosCsv();

    const columnas = [
      "Tipo", "Nombre", "Cedula", "Cargo", "ID Empleado", "Detalle", "Radicado",
      "Estado", "Autorizado por", "Fecha autorizacion", "Motivo", "Comentario",
    ];
    const lineas = [
      columnas.join(","),
      ...filtradas.map((f) =>
        [
          ESTILO_CATEGORIA[f.categoria].etiqueta, f.nombre, f.cedula, f.cargo, f.idCore,
          f.detalle, f.fechaRadicado, f.estado, f.autorizadoPor, f.fechaAutorizacion,
          f.motivo, f.comentario,
        ]
          .map(escaparCsv)
          .join(","),
      ),
    ];
    descargarCsv("historico-solicitudes", lineas);
  }

  const limpiarFiltros = () => {
    setEstado("todos");
    setClase("todas");
    setBusqueda("");
    setDesde("");
    setHasta("");
  };

  const hayFiltros =
    estado !== "todos" || clase !== "todas" || Boolean(busqueda) || Boolean(desde) || Boolean(hasta);

  if (cargando) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/4 rounded bg-gray-200" />
          <div className="h-4 w-1/2 rounded bg-gray-200" />
          <div className="mt-6 space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-6">
        <p className="font-medium text-red-800">Error: {error}</p>
        <button
          onClick={cargar}
          className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const conteos: Record<Tab, number> = {
    todas: filas.length,
    permisos: filas.filter((f) => f.categoria === "permisos").length,
    vacaciones: filas.filter((f) => f.categoria === "vacaciones").length,
    novedades: filas.filter((f) => f.categoria === "novedades").length,
    documentos: documentos.length,
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Encabezado + resumen */}
      <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              Histórico de solicitudes
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {datos?.alcance === "propio"
                ? "Todas sus solicitudes de permiso, vacaciones y novedades de nómina"
                : datos?.alcance === "areas"
                  ? "Solicitudes de los colaboradores de sus áreas"
                  : "Solicitudes de todos los colaboradores"}
            </p>
            {tab === "documentos" && (
              <p className="mt-1 text-xs text-gray-500">
                Todos los archivos asociados: documentos de autorización, firmas, adjuntos
                y documentos del sistema anterior
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={exportarCsv}
              disabled={
                tab === "documentos" ? documentosFiltrados.length === 0 : filtradas.length === 0
              }
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                />
              </svg>
              Exportar CSV
            </button>
            <button
              onClick={cargar}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 006.3 5.3M4 15a8 8 0 0013.7 3.7"
                />
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tab === "documentos" ? (
            <>
              <Metrica etiqueta="Documentos" valor={documentosFiltrados.length} tono="slate" />
              <Metrica
                etiqueta="Autorizaciones"
                valor={documentosFiltrados.filter((d) => d.clase === "autorizacion").length}
                tono="emerald"
              />
              <Metrica
                etiqueta="Firmas"
                valor={documentosFiltrados.filter((d) => d.clase === "firma").length}
                tono="violet"
              />
              <Metrica
                etiqueta="Adjuntos"
                valor={documentosFiltrados.filter((d) => d.clase === "adjunto").length}
                tono="sky"
              />
            </>
          ) : (
            <>
              <Metrica etiqueta="Total" valor={resumen.total} tono="slate" />
              <Metrica etiqueta="Pendientes" valor={resumen.pendientes} tono="amber" />
              <Metrica etiqueta="Aprobadas" valor={resumen.aprobadas} tono="emerald" />
              <Metrica etiqueta="Rechazadas" valor={resumen.rechazadas} tono="rose" />
            </>
          )}
        </dl>
      </div>

      {/* Pestañas */}
      <div className="flex gap-5 overflow-x-auto border-b border-gray-100 px-6 sm:px-8">
        {(["todas", "permisos", "vacaciones", "novedades", "documentos"] as Tab[]).map((t) => {
          const activo = tab === t;
          const estiloActivo =
            t === "todas" || t === "documentos"
              ? "border-gray-900 text-gray-900"
              : ESTILO_CATEGORIA[t].activo;
          const etiqueta =
            t === "todas"
              ? "Todas"
              : t === "documentos"
                ? "Documentos"
                : ESTILO_CATEGORIA[t].etiqueta + "s";
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                activo ? estiloActivo : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {etiqueta} ({conteos[t]})
            </button>
          );
        })}
      </div>

      {/* Carga de la lista de asistencia — solo para quien ve toda la empresa:
          el archivo del biométrico trae los datos de todos los colaboradores. */}
      {tab === "novedades" && datos?.alcance === "todos" && <CargarListaAsistencia />}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-4 sm:px-8">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">Buscar</label>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, cédula, tipo, motivo…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </div>
        {tab === "documentos" ? (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Clase de documento</label>
            <select
              value={clase}
              onChange={(e) => setClase(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
            >
              <option value="todas">Todas</option>
              {Object.entries(CLASES).map(([valor, c]) => (
                <option key={valor} value={valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Estado</label>
            <select
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
            >
              <option value="todos">Todos</option>
              {estados.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
              <option value="sin-estado">Sin estado</option>
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </div>
        {hayFiltros && (
          <button
            onClick={limpiarFiltros}
            className="rounded-lg px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-200/70 hover:text-gray-700"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla de documentos */}
      {tab === "documentos" ? (
        documentosFiltrados.length === 0 ? (
          <div className="px-8 py-16 text-center">
            <p className="font-medium text-gray-600">
              {documentos.length === 0
                ? "Todavía no hay documentos registrados"
                : "Ningún documento coincide con los filtros"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="px-6 py-3 font-medium sm:px-8">Documento</th>
                    <th className="px-3 py-3 font-medium">Clase</th>
                    <th className="px-3 py-3 font-medium">Solicitud</th>
                    <th className="px-3 py-3 font-medium">Colaborador</th>
                    <th className="px-3 py-3 font-medium">Fecha</th>
                    <th className="px-3 py-3 font-medium">Tamaño</th>
                    <th className="px-3 py-3 pr-6 font-medium sm:pr-8">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {documentosFiltrados.slice(0, visibles).map((d) => (
                    <FilaDocumento key={d.id} documento={d} />
                  ))}
                </tbody>
              </table>
            </div>

            {documentosFiltrados.length > visibles && (
              <div className="border-t border-gray-100 px-8 py-5 text-center">
                <button
                  onClick={() => setVisibles((v) => v + 25)}
                  className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Mostrar más ({documentosFiltrados.length - visibles} restantes)
                </button>
              </div>
            )}
          </>
        )
      ) : /* Tabla de solicitudes */
      filtradas.length === 0 ? (
        <div className="px-8 py-16 text-center">
          <p className="font-medium text-gray-600">
            {filas.length === 0
              ? "Todavía no hay solicitudes registradas"
              : "Ninguna solicitud coincide con los filtros"}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-6 py-3 font-medium sm:px-8">Tipo</th>
                  <th className="px-3 py-3 font-medium">Colaborador</th>
                  <th className="px-3 py-3 font-medium">Detalle</th>
                  <th className="px-3 py-3 font-medium">Radicado</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Autorizó</th>
                  <th className="px-3 py-3 pr-6 font-medium sm:pr-8">Documento</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.slice(0, visibles).map((f) => {
                  const abierta = expandida === `${f.categoria}-${f.id}`;
                  return (
                    <FilaHistorico
                      key={`${f.categoria}-${f.id}`}
                      fila={f}
                      abierta={abierta}
                      onToggle={() =>
                        setExpandida(abierta ? null : `${f.categoria}-${f.id}`)
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtradas.length > visibles && (
            <div className="border-t border-gray-100 px-8 py-5 text-center">
              <button
                onClick={() => setVisibles((v) => v + 25)}
                className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Mostrar más ({filtradas.length - visibles} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const TONOS: Record<string, string> = {
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
};

function FilaDocumento({ documento: d }: { documento: Documento }) {
  const clase = CLASES[d.clase];
  const estiloCategoria = ESTILO_CATEGORIA[d.categoria];

  return (
    <tr className="border-b border-gray-50 transition-colors hover:bg-gray-50/70">
      <td className="max-w-[280px] px-6 py-3 sm:px-8">
        <div className="flex items-center gap-2.5">
          <svg
            className="h-4 w-4 flex-shrink-0 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={clase.icono} />
          </svg>
          <span className="truncate font-medium text-gray-900" title={d.titulo}>
            {d.titulo}
          </span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-semibold ${clase.chip}`}
        >
          {clase.etiqueta}
        </span>
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${estiloCategoria.chip}`}
        >
          {estiloCategoria.etiqueta}
        </span>
      </td>
      <td className="max-w-[190px] px-3 py-3">
        <p className="truncate text-gray-700">{d.nombre}</p>
        {d.cedula && <p className="text-xs text-gray-500">CC {d.cedula}</p>}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-gray-600">{fmtFecha(d.fecha)}</td>
      <td className="whitespace-nowrap px-3 py-3 text-gray-500">{fmtTamano(d.tamano)}</td>
      <td className="px-3 py-3 pr-6 sm:pr-8">
        <a
          href={d.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
        >
          Abrir
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      </td>
    </tr>
  );
}

function Metrica({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${TONOS[tono]}`}>
      <dt className="text-xs font-medium opacity-80">{etiqueta}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}

function FilaHistorico({
  fila,
  abierta,
  onToggle,
}: {
  fila: Fila;
  abierta: boolean;
  onToggle: () => void;
}) {
  const estilo = ESTILO_CATEGORIA[fila.categoria];

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50/70"
      >
        <td className="px-6 py-3 sm:px-8">
          <span
            className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${estilo.chip}`}
          >
            {estilo.etiqueta}
          </span>
        </td>
        <td className="max-w-[200px] px-3 py-3">
          <p className="truncate font-medium text-gray-900">{fila.nombre}</p>
          {fila.cedula && <p className="text-xs text-gray-500">CC {fila.cedula}</p>}
        </td>
        <td className="max-w-[200px] px-3 py-3">
          <p className="truncate text-gray-700" title={fila.detalle}>
            {fila.detalle || "—"}
          </p>
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-gray-600">
          {fmtFecha(fila.fechaRadicado)}
        </td>
        <td className="px-3 py-3">
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${estiloEstado(fila.estado)}`}
          >
            {fila.estado || "Sin estado"}
          </span>
        </td>
        <td className="max-w-[160px] px-3 py-3">
          {fila.autorizadoPor ? (
            <>
              <p className="truncate text-gray-700">{fila.autorizadoPor}</p>
              <p className="text-xs text-gray-500">{fmtFecha(fila.fechaAutorizacion)}</p>
            </>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
        <td className="px-3 py-3 pr-6 sm:pr-8">
          {fila.documento ? (
            <a
              href={fila.documento}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              PDF
            </a>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </td>
      </tr>

      {abierta && (
        <tr className="border-b border-gray-100 bg-gray-50/80">
          <td colSpan={7} className="px-6 py-5 sm:px-8">
            <div className="grid gap-5 lg:grid-cols-3">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 lg:col-span-2">
                {fila.cargo && (
                  <div>
                    <dt className="text-xs text-gray-500">Cargo</dt>
                    <dd className="text-sm font-medium text-gray-900">{fila.cargo}</dd>
                  </div>
                )}
                {fila.idCore && (
                  <div>
                    <dt className="text-xs text-gray-500">ID empleado</dt>
                    <dd className="text-sm font-medium text-gray-900">{fila.idCore}</dd>
                  </div>
                )}
                {fila.extras.map((e) => (
                  <div key={e.etiqueta}>
                    <dt className="text-xs text-gray-500">{e.etiqueta}</dt>
                    <dd className="text-sm font-medium text-gray-900">{e.valor}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-3">
                {fila.motivo && (
                  <div className="rounded-lg border border-gray-200 bg-white p-3">
                    <p className="text-xs text-gray-500">
                      {fila.categoria === "novedades" ? "Descripción" : "Motivo"}
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-gray-800">{fila.motivo}</p>
                  </div>
                )}
                {fila.comentario && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
                    <p className="text-xs text-blue-700">Comentario de quien autorizó</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-gray-800">
                      {fila.comentario}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
