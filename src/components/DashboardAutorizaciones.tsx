"use client";

import { useState, useEffect, useMemo } from "react";
import { ModalAutorizarSolicitud, type CampoAirtable } from "./ModalAutorizarSolicitud";
import { FIELDS, FK_ID_CORE } from "@/lib/airtable-schema";

interface Permiso {
  tipo: string;
  ambito: string;
  notas?: string;
}

interface Solicitud {
  id: string;
  fields: Record<string, CampoAirtable>;
}

/**
 * Las novedades de nómina no aparecen aquí: son un registro informativo del
 * colaborador, no un trámite que se apruebe o rechace.
 */
type Categoria = "permisos" | "vacaciones";
type Tab = "todas" | Categoria;

interface DatosAutorizacion {
  permisos: Permiso[];
  solicitudes: Record<Categoria, Solicitud[]>;
  ambito: string;
}

/** Cuántas tarjetas se muestran antes de pedir "Mostrar más". */
const PAGINA = 15;

/** Chips y pestañas en versión oscura: la vista va sobre la foto nocturna. */
const ESTILO_CATEGORIA: Record<Categoria, { etiqueta: string; chip: string; activo: string }> = {
  permisos: {
    etiqueta: "Permiso",
    chip: "bg-[#1a51a8]/25 text-[#9cc4ff] border-[#1a51a8]/50",
    activo: "border-[#4d8ee8] text-[#9cc4ff]",
  },
  vacaciones: {
    etiqueta: "Vacaciones",
    chip: "bg-[#6bb543]/20 text-[#b3e694] border-[#6bb543]/45",
    activo: "border-[#8fd363] text-[#b3e694]",
  },
};

export default function DashboardAutorizaciones() {
  const [datos, setDatos] = useState<DatosAutorizacion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [visibles, setVisibles] = useState(PAGINA);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState<{
    tipo: "permiso" | "vacaciones";
    solicitud: Solicitud;
  } | null>(null);

  useEffect(() => {
    fetchDatos();
  }, []);

  async function fetchDatos() {
    try {
      setLoading(true);
      const res = await fetch("/api/solicitudes/pendientes");

      if (!res.ok) {
        throw new Error("Error al cargar solicitudes pendientes");
      }

      setDatos(await res.json());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  // Lista unificada y ordenada por fecha de solicitud (más reciente primero)
  const todas = useMemo(() => {
    if (!datos) return [];
    const items = (Object.keys(ESTILO_CATEGORIA) as Categoria[]).flatMap((categoria) =>
      (datos.solicitudes[categoria] ?? []).map((solicitud) => ({ categoria, solicitud })),
    );
    return items.sort(
      (a, b) => fechaOrden(b.categoria, b.solicitud) - fechaOrden(a.categoria, a.solicitud),
    );
  }, [datos]);

  const filtradas = useMemo(() => {
    const porTab = tab === "todas" ? todas : todas.filter((i) => i.categoria === tab);
    const q = busqueda.trim().toLowerCase();
    if (!q) return porTab;
    return porTab.filter(({ categoria, solicitud }) =>
      textoBuscable(categoria, solicitud).includes(q),
    );
  }, [todas, tab, busqueda]);

  // Al cambiar de pestaña o búsqueda se reinicia la paginación
  useEffect(() => setVisibles(PAGINA), [tab, busqueda]);

  if (loading) {
    return (
      <div className="glass-solid rounded-2xl p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-1/4 rounded bg-white/10"></div>
          <div className="h-4 w-1/2 rounded bg-white/10"></div>
          <div className="mt-6 space-y-3">
            <div className="h-24 rounded-xl bg-white/[0.07]"></div>
            <div className="h-24 rounded-xl bg-white/[0.07]"></div>
            <div className="h-24 rounded-xl bg-white/[0.07]"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="glass flex items-center justify-between gap-4 rounded-2xl p-6"
        style={{ borderColor: "rgba(239,68,68,0.35)" }}
      >
        <p className="font-medium text-red-200">Error: {error}</p>
        <button
          onClick={fetchDatos}
          className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!datos || datos.permisos.length === 0) {
    return null; // No mostrar nada si no tiene permisos de autorización
  }

  const conteos: Record<Tab, number> = {
    todas: todas.length,
    permisos: datos.solicitudes.permisos?.length ?? 0,
    vacaciones: datos.solicitudes.vacaciones?.length ?? 0,
  };

  return (
    <>
      <div className="glass-solid overflow-hidden rounded-2xl">
        {/* Header */}
        <div className="border-b border-white/10 px-6 py-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1a51a8]/30 ring-1 ring-inset ring-white/10">
                  <svg
                    className="h-5 w-5 text-[#7cb2ff]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </span>
                <div>
                  <h2 className="text-xl font-semibold text-white sm:text-2xl">
                    Panel de Autorizaciones
                  </h2>
                  <p className="text-sm text-white/75">
                    {conteos.todas === 0
                      ? "No hay solicitudes pendientes de su aprobación"
                      : `${conteos.todas} solicitud${conteos.todas !== 1 ? "es" : ""} pendiente${
                          conteos.todas !== 1 ? "s" : ""
                        } de su aprobación`}
                  </p>
                </div>
              </div>

              {/* Permisos de autorización del usuario */}
              <div className="mt-4 flex flex-wrap gap-2">
                {datos.permisos.map((p, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-medium text-white/80"
                    title={p.notas}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full bg-[#29b6e8]"
                      style={{ boxShadow: "0 0 8px #29b6e8" }}
                    ></span>
                    Autoriza: {p.tipo} · {p.ambito}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={fetchDatos}
              className="group inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white/85 transition-colors hover:bg-white/12 hover:text-white"
            >
              <svg
                className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
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

        {/* Tabs + búsqueda */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-6 sm:px-8">
          <div className="flex gap-5 overflow-x-auto">
            {(["todas", "permisos", "vacaciones"] as Tab[]).map((t) => {
              const activo = tab === t;
              const estiloActivo =
                t === "todas" ? "border-white text-white" : ESTILO_CATEGORIA[t].activo;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                    activo
                      ? estiloActivo
                      : "border-transparent text-white/70 hover:text-white/80"
                  }`}
                >
                  {t === "todas" ? "Todas" : ESTILO_CATEGORIA[t].etiqueta + "s"} ({conteos[t]})
                </button>
              );
            })}
          </div>

          {conteos.todas > 0 && (
            <div className="relative py-3 w-full sm:w-64">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-white/65"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
                />
              </svg>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, cédula o tipo"
                className="w-full rounded-lg border border-white/12 bg-white/[0.06] py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/60 focus:border-[#29b6e8]/60 focus:outline-none focus:ring-2 focus:ring-[#29b6e8]/25"
              />
            </div>
          )}
        </div>

        {/* Lista de solicitudes */}
        <div className="bg-black/15 p-6 sm:p-8">
          {filtradas.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-medium text-white/80">
                {conteos.todas === 0
                  ? "✓ No hay solicitudes pendientes de autorización"
                  : "Ninguna solicitud coincide con el filtro"}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {filtradas.slice(0, visibles).map(({ categoria, solicitud }) => (
                  <TarjetaSolicitud
                    key={`${categoria}-${solicitud.id}`}
                    solicitud={solicitud}
                    categoria={categoria}
                    onAutorizar={() =>
                      setSolicitudSeleccionada({
                        tipo: categoria === "permisos" ? "permiso" : categoria,
                        solicitud,
                      })
                    }
                  />
                ))}
              </div>

              {filtradas.length > visibles && (
                <div className="mt-6 text-center">
                  <button
                    onClick={() => setVisibles((v) => v + PAGINA)}
                    className="rounded-lg border border-white/12 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/12 hover:text-white"
                  >
                    Mostrar más ({filtradas.length - visibles} restantes)
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de autorización */}
      {solicitudSeleccionada && (
        <ModalAutorizarSolicitud
          tipo={solicitudSeleccionada.tipo}
          solicitud={solicitudSeleccionada.solicitud}
          onClose={() => setSolicitudSeleccionada(null)}
          onSuccess={() => {
            setSolicitudSeleccionada(null);
            fetchDatos(); // Recargar datos
          }}
        />
      )}
    </>
  );
}

function TarjetaSolicitud({
  solicitud,
  categoria,
  onAutorizar,
}: {
  solicitud: Solicitud;
  categoria: Categoria;
  onAutorizar: () => void;
}) {
  const f = solicitud.fields;
  const estilo = ESTILO_CATEGORIA[categoria];
  const nombre = (f[FIELDS.PERMISO.NOMBRE] as string) || "Sin nombre";
  const cedula = (f[FIELDS.PERMISO.CEDULA] as string) || "";
  const cargo = f[FIELDS.PERMISO.CARGO] as string | undefined;

  return (
    <div className="glass rounded-xl p-5 transition-all duration-300 hover:-translate-y-0.5 hover:bg-white/[0.09]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {/* Encabezado: categoría + persona */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${estilo.chip}`}
            >
              {estilo.etiqueta}
            </span>
            <h3 className="truncate font-semibold text-white">{nombre}</h3>
            {cedula && <span className="text-xs text-white/65">CC {cedula}</span>}
          </div>

          {cargo && <p className="mt-1 text-xs text-white/65">{cargo}</p>}

          {/* Datos de la solicitud */}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
            {datosSolicitud(categoria, solicitud).map(({ etiqueta, valor }) => (
              <div key={etiqueta} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-white/60">{etiqueta}</dt>
                <dd className="truncate font-medium text-white/90" title={valor}>
                  {valor}
                </dd>
              </div>
            ))}
          </dl>

          {/* Motivo / descripción */}
          {motivo(categoria, solicitud) && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-white/65">
                Motivo
              </p>
              <p className="mt-0.5 whitespace-pre-line text-sm text-white/90">
                {motivo(categoria, solicitud)}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onAutorizar}
          className="shrink-0 self-start rounded-lg bg-[#1a51a8] px-5 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
          style={{ boxShadow: "0 12px 26px -14px #1a51a8" }}
        >
          Revisar
        </button>
      </div>
    </div>
  );
}

// ── Helpers de presentación ───────────────────────────────────────────────────

function formatearFecha(valor: unknown): string {
  if (typeof valor !== "string" || !valor) return "—";
  const fecha = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
  if (isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  return String(valor).trim();
}

/** Fecha usada para ordenar la lista unificada. */
function fechaOrden(categoria: Categoria, s: Solicitud): number {
  const campo =
    categoria === "permisos"
      ? FIELDS.PERMISO.FECHA_SOLICITUD
      : FIELDS.VACACIONES.FECHA_PRESENTACION;
  const valor = s.fields[campo];
  const ts = typeof valor === "string" ? new Date(valor).getTime() : NaN;
  return isNaN(ts) ? 0 : ts;
}

function datosSolicitud(categoria: Categoria, s: Solicitud): { etiqueta: string; valor: string }[] {
  const f = s.fields;

  if (categoria === "permisos") {
    return [
      { etiqueta: "Tipo", valor: texto(f[FIELDS.PERMISO.TIPO]) },
      { etiqueta: "Desde", valor: formatearFecha(f[FIELDS.PERMISO.FECHA_INICIO]) },
      ...(f[FIELDS.PERMISO.FECHA_FIN]
        ? [{ etiqueta: "Hasta", valor: formatearFecha(f[FIELDS.PERMISO.FECHA_FIN]) }]
        : []),
      { etiqueta: "Horas", valor: texto(f[FIELDS.PERMISO.HORAS]) },
      { etiqueta: "Solicitado", valor: formatearFecha(f[FIELDS.PERMISO.FECHA_SOLICITUD]) },
    ];
  }

  return [
    { etiqueta: "Inicio", valor: formatearFecha(f[FIELDS.VACACIONES.FECHA_INICIO]) },
    { etiqueta: "Fin", valor: formatearFecha(f[FIELDS.VACACIONES.FECHA_FIN]) },
    { etiqueta: "Días", valor: texto(f[FIELDS.VACACIONES.DIAS]) },
    { etiqueta: "Reintegro", valor: formatearFecha(f[FIELDS.VACACIONES.FECHA_REINTEGRO]) },
    { etiqueta: "Presentada", valor: formatearFecha(f[FIELDS.VACACIONES.FECHA_PRESENTACION]) },
  ];
}

function motivo(categoria: Categoria, s: Solicitud): string {
  const campo =
    categoria === "permisos" ? FIELDS.PERMISO.MOTIVO : FIELDS.VACACIONES.MOTIVO;
  const valor = s.fields[campo];
  return typeof valor === "string" ? valor.trim() : "";
}

function textoBuscable(categoria: Categoria, s: Solicitud): string {
  return [
    ESTILO_CATEGORIA[categoria].etiqueta,
    s.fields[FIELDS.PERMISO.NOMBRE],
    s.fields[FIELDS.PERMISO.CEDULA],
    s.fields[FIELDS.PERMISO.CARGO],
    s.fields[FIELDS.PERMISO.TIPO],
    s.fields[FK_ID_CORE],
    motivo(categoria, s),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
