import Link from "next/link";
import { escapeAirtableValue } from "../lib/security";
import { TABLES, FIELDS, FK_ID_CORE, ESTADOS_APROBADOS } from "../lib/schema";
import {
  MODULOS,
  ModuloKey,
  Icon,
  ICON_CHEVRON_RIGHT,
  formatFecha,
} from "./ui";
import { AvisoCompensacion, type PermisoSinPlan } from "./AvisoCompensacion";
import { diasEntre, horasAReponer } from "@/lib/compensacion";

interface Props {
  idCore: string;
  /** Nombre completo del colaborador — solo para el saludo del encabezado. */
  nombre?: string;
  basePath?: string;
  apiBasePath?: string;
  /** Se inserta entre el encabezado y las acciones (avisos contextuales). */
  children?: React.ReactNode;
}

type AirtableRecord = { id: string; fields: Record<string, unknown> };

/**
 * Estilos de estado para fondo oscuro: el relleno y el texto son translúcidos
 * sobre la foto, no los pasteles claros que usaba la versión sobre blanco —
 * ahí el badge se convertía en una mancha sin contraste.
 */
const ESTADO_STYLE: Record<string, { bg: string; color: string; dot: string }> = {
  Pendiente:       { bg: "rgba(234,179,8,0.16)",  color: "#fde68a", dot: "#eab308" },
  Concedido:       { bg: "rgba(34,197,94,0.16)",  color: "#86efac", dot: "#22c55e" },
  Aprobado:        { bg: "rgba(34,197,94,0.16)",  color: "#86efac", dot: "#22c55e" },
  Rechazado:       { bg: "rgba(239,68,68,0.16)",  color: "#fca5a5", dot: "#ef4444" },
  Revisado:        { bg: "rgba(59,130,246,0.16)", color: "#93c5fd", dot: "#3b82f6" },
  Resuelto:        { bg: "rgba(34,197,94,0.14)",  color: "#86efac", dot: "#22c55e" },
  Autorizado:      { bg: "rgba(34,197,94,0.16)",  color: "#86efac", dot: "#22c55e" },
  "No autorizado": { bg: "rgba(239,68,68,0.16)",  color: "#fca5a5", dot: "#ef4444" },
};

const ESTADO_DEFAULT = { bg: "rgba(255,255,255,0.08)", color: "#cbd5e1", dot: "#94a3b8" };

function esEstadoAprobado(estado: string): boolean {
  return (ESTADOS_APROBADOS as readonly string[]).includes(estado);
}

type Row = { modulo: ModuloKey; tipo: string; subtipo: string; fecha: string; estado: string };

async function fetchRecientes(idCore: string): Promise<Row[]> {
  const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
  const KEY  = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

  const formula    = encodeURIComponent(`{${FK_ID_CORE}}='${escapeAirtableValue(idCore)}'`);
  const sortPerm   = encodeURIComponent(FIELDS.PERMISO.FECHA_SOLICITUD);
  const sortVac    = encodeURIComponent(FIELDS.VACACIONES.FECHA_PRESENTACION);
  const sortNov    = encodeURIComponent(FIELDS.NOVEDADES.FECHA_CREACION);
  const headers    = { Authorization: `Bearer ${KEY}` };
  const opts       = { headers, cache: "no-store" } as const;

  const [permisos, vacaciones, novedades] = await Promise.allSettled([
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.PERMISO)}?filterByFormula=${formula}&sort[0][field]=${sortPerm}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.VACACIONES)}?filterByFormula=${formula}&sort[0][field]=${sortVac}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
    fetch(`https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.NOVEDADES)}?filterByFormula=${formula}&sort[0][field]=${sortNov}&sort[0][direction]=desc&maxRecords=5`, opts).then((r) => r.json()),
  ]);

  const rows: Row[] = [];

  if (permisos.status === "fulfilled") {
    for (const r of (permisos.value.records ?? []) as AirtableRecord[]) {
      rows.push({
        modulo:  "permiso",
        tipo:    "Permiso",
        subtipo: String(r.fields[FIELDS.PERMISO.TIPO] ?? "—"),
        fecha:   String(r.fields[FIELDS.PERMISO.FECHA_SOLICITUD] ?? "—"),
        estado:  String(r.fields[FIELDS.PERMISO.ESTADO] ?? "Pendiente"),
      });
    }
  }
  if (vacaciones.status === "fulfilled") {
    for (const r of (vacaciones.value.records ?? []) as AirtableRecord[]) {
      const ini = r.fields[FIELDS.VACACIONES.FECHA_INICIO];
      const fin = r.fields[FIELDS.VACACIONES.FECHA_FIN];
      rows.push({
        modulo:  "vacaciones",
        tipo:    "Vacaciones",
        subtipo: `${ini ? formatFecha(String(ini)) : "?"} → ${fin ? formatFecha(String(fin)) : "?"}`,
        fecha:   String(r.fields[FIELDS.VACACIONES.FECHA_PRESENTACION] ?? "—"),
        estado:  String(r.fields[FIELDS.VACACIONES.ESTADO] ?? "—"),
      });
    }
  }
  if (novedades.status === "fulfilled") {
    for (const r of (novedades.value.records ?? []) as AirtableRecord[]) {
      rows.push({
        modulo:  "novedades",
        tipo:    "Novedad",
        subtipo: String(r.fields[FIELDS.NOVEDADES.TIPO] ?? "—"),
        fecha:   String(r.fields[FIELDS.NOVEDADES.FECHA_CREACION] ?? "—"),
        estado:  String(r.fields[FIELDS.NOVEDADES.ESTADO] ?? "Pendiente"),
      });
    }
  }

  return rows.sort((a, b) => (b.fecha > a.fecha ? 1 : -1)).slice(0, 10);
}

/**
 * Permisos aprobados como compensatorios a los que Gestión del Ser no les definió
 * el plan: el colaborador tiene que elegir cómo repone. Va en una consulta aparte
 * de las 5 recientes porque un permiso puede quedar pendiente mucho tiempo.
 *
 * El estado aprobado es parte del filtro, no un detalle: quien decide si un
 * permiso se repone es Gestión del Ser al autorizar. Mientras el permiso siga
 * pendiente no hay nada que reponer todavía — y podría terminar rechazado.
 *
 * Tampoco basta con que el plan esté vacío: si el registro ya trae los días de
 * compensación, la reposición quedó acordada aunque nadie nombrara un plan.
 * Preguntarle al colaborador ahí lo haría rehacer un compromiso ya cerrado.
 */
async function fetchSinPlanCompensacion(idCore: string): Promise<PermisoSinPlan[]> {
  const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
  const KEY  = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

  const aprobado = ESTADOS_APROBADOS.map(
    (e) => `{${FIELDS.PERMISO.ESTADO}}='${escapeAirtableValue(e)}'`
  ).join(", ");

  const formula = encodeURIComponent(
    `AND({${FK_ID_CORE}}='${escapeAirtableValue(idCore)}', ` +
      `{${FIELDS.PERMISO.COMPENSADO}}, ` +
      `OR(${aprobado}), ` +
      `{${FIELDS.PERMISO.PLAN_COMPENSACION}}='', ` +
      `{${FIELDS.PERMISO.DIAS_COMPENSACION}}='')`
  );

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.PERMISO)}?filterByFormula=${formula}&maxRecords=10`,
      { headers: { Authorization: `Bearer ${KEY}` }, cache: "no-store" }
    );
    if (!res.ok) return [];

    const data = await res.json();
    return ((data.records ?? []) as AirtableRecord[]).map((r) => {
      const inicio = String(r.fields[FIELDS.PERMISO.FECHA_INICIO] ?? "").slice(0, 10);
      const fin    = String(r.fields[FIELDS.PERMISO.FECHA_FIN] ?? "").slice(0, 10);
      return {
        id: r.id,
        tipo: String(r.fields[FIELDS.PERMISO.TIPO] ?? "Permiso"),
        fecha: inicio,
        horasTotal: horasAReponer(r.fields[FIELDS.PERMISO.HORAS], diasEntre(inicio, fin)),
      };
    });
  } catch (error) {
    // El aviso es informativo: si Airtable falla, la página igual se muestra.
    console.error("[SolicitudesOverview] compensaciones sin plan:", error);
    return [];
  }
}

/* ── Badge de estado ────────────────────────────────────────────────────── */

function EstadoBadge({ estado }: { estado: string }) {
  const s = ESTADO_STYLE[estado] ?? ESTADO_DEFAULT;
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {estado}
    </span>
  );
}

/* ── Resumen numérico ───────────────────────────────────────────────────── */

function Resumen({ rows }: { rows: Row[] }) {
  const pendientes = rows.filter((r) => r.estado === "Pendiente").length;
  const aprobadas  = rows.filter((r) => esEstadoAprobado(r.estado)).length;

  const stats = [
    { label: "Pendientes", valor: pendientes,  color: "#eab308", pista: "en revisión" },
    { label: "Aprobadas",  valor: aprobadas,   color: "#22c55e", pista: "con documento" },
    { label: "Total",      valor: rows.length, color: "#29b6e8", pista: "últimas 10" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 sm:gap-4">
      {stats.map((s, i) => (
        /*
          Dos elementos y no uno: `anim-entrada` corre con `forwards`, deja fijado
          `transform: none` y en el mismo nodo se comería el hover.
        */
        <div key={s.label} className="anim-entrada" style={{ animationDelay: `${180 + i * 90}ms` }}>
        <div
          className="glass group relative h-full overflow-hidden rounded-2xl px-4 py-4 transition-transform duration-300 hover:-translate-y-0.5"
        >
          {/* Halo del color del indicador — sube al pasar el cursor */}
          <span
            className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
            style={{ background: s.color }}
          />
          <div className="relative flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }}
            />
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/55">
              {s.label}
            </p>
          </div>
          <p className="relative mt-1 text-3xl font-bold leading-none tracking-tight text-white tabular-nums">
            {s.valor}
          </p>
          <p className="relative mt-1 text-[11px] text-white/40">{s.pista}</p>
        </div>
        </div>
      ))}
    </div>
  );
}

/* ── Encabezado sobre la foto ───────────────────────────────────────────── */

const FMT_FECHA_LARGA = new Intl.DateTimeFormat("es-CO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "America/Bogota",
});

function Hero({ nombre, rows }: { nombre?: string; rows: Row[] }) {
  const primerNombre = nombre?.trim().split(" ")[0] ?? "";
  const hoy = FMT_FECHA_LARGA.format(new Date());

  return (
    <header className="mb-8 print:hidden">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="anim-entrada max-w-xl" style={{ animationDelay: "60ms" }}>
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium text-white/70">
            <span
              className="anim-titilar h-1.5 w-1.5 rounded-full bg-[#29b6e8]"
              style={{ boxShadow: "0 0 8px #29b6e8" }}
            />
            Gestión del Ser · <span className="capitalize">{hoy}</span>
          </span>

          <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Solicitudes
          </h1>

          <p className="mt-3 text-sm leading-relaxed text-white/55 sm:text-base">
            {primerNombre ? `${primerNombre}, aquí ` : "Aquí "}
            gestionas tus permisos, vacaciones y novedades de nómina — y sigues el estado
            de cada trámite hasta su documento firmado.
          </p>
        </div>

        <div className="w-full lg:max-w-md">
          <Resumen rows={rows} />
        </div>
      </div>
    </header>
  );
}

/* ── Página ─────────────────────────────────────────────────────────────── */

export async function SolicitudesOverview({
  idCore,
  nombre,
  basePath = "/dashboard/solicitudes",
  apiBasePath = "",
  children,
}: Props) {
  const [recientes, sinPlan] = await Promise.all([
    fetchRecientes(idCore),
    fetchSinPlanCompensacion(idCore),
  ]);

  const acciones: { key: ModuloKey; label: string; href: string }[] = [
    { key: "permiso",    label: "Solicitar Permiso",    href: `${basePath}/permiso` },
    { key: "vacaciones", label: "Solicitar Vacaciones", href: `${basePath}/vacaciones` },
    { key: "novedades",  label: "Reportar Novedad",     href: `${basePath}/novedades` },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-10 pt-8 sm:px-8 sm:pt-12">
      {/* ── Encabezado sobre la foto ────────────────────────────────────── */}
      <Hero nombre={nombre} rows={recientes} />

      {/* ── Avisos contextuales del host (días de pacto) ────────────────── */}
      {children && (
        <div className="anim-entrada mb-6 print:hidden" style={{ animationDelay: "420ms" }}>
          {children}
        </div>
      )}

      {/* ── Aviso: permisos compensatorios sin plan de reposición ───────── */}
      <AvisoCompensacion permisos={sinPlan} apiBasePath={apiBasePath} />

      {/* ── Acciones ────────────────────────────────────────────────────── */}
      <div className="mb-4 flex items-center gap-3 print:hidden">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Nueva solicitud
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3 print:hidden">
        {acciones.map((a, i) => {
          const m = MODULOS[a.key];
          return (
            <div
              key={a.href}
              className="anim-entrada"
              style={{ animationDelay: `${480 + i * 90}ms` }}
            >
            <Link
              href={a.href}
              className="glass group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1"
            >
              {/* Resplandor del color del módulo — aparece al pasar el cursor */}
              <span
                className="pointer-events-none absolute -bottom-16 left-1/2 h-32 w-40 -translate-x-1/2 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
                style={{ background: m.color }}
              />
              <span
                className="absolute inset-x-0 top-0 h-px origin-left scale-x-0 transition-transform duration-500 group-hover:scale-x-100"
                style={{ background: `linear-gradient(90deg, transparent, ${m.color}, transparent)` }}
              />
              <div className="relative flex items-start justify-between">
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ring-white/10 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${m.color}26` }}
                >
                  <Icon path={m.icon} className="h-5 w-5" stroke={m.color} strokeWidth={1.7} />
                </div>
                <Icon
                  path={ICON_CHEVRON_RIGHT}
                  className="h-4 w-4 text-white/25 transition-all duration-300 group-hover:translate-x-1 group-hover:text-white/70"
                  strokeWidth={2}
                />
              </div>
              <div className="relative">
                <p className="text-sm font-semibold text-white">{a.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/45">{m.desc}</p>
              </div>
            </Link>
            </div>
          );
        })}
      </div>

      {/* ── Historial ───────────────────────────────────────────────────── */}
      <div
        className="glass-solid anim-entrada overflow-hidden rounded-2xl"
        style={{ animationDelay: "760ms" }}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-white/90">Mis solicitudes recientes</h2>
          {recientes.length > 0 && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/60">
              {recientes.length}
            </span>
          )}
        </div>

        {recientes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10">
              <Icon
                path={
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                }
                className="h-6 w-6 text-white/35"
              />
            </div>
            <div>
              <p className="text-sm font-medium text-white/80">Aún no tienes solicitudes</p>
              <p className="mt-1 text-xs text-white/40">
                Usa las tarjetas de arriba para crear la primera.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Escritorio — tabla */}
            <table className="hidden w-full text-sm sm:table print:table">
              <thead>
                <tr className="bg-white/[0.04]">
                  <th className="px-6 py-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Tipo</th>
                  <th className="px-6 py-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Detalle</th>
                  <th className="px-6 py-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Fecha</th>
                  <th className="px-6 py-3 text-right text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.07]">
                {recientes.map((row, i) => {
                  const m = MODULOS[row.modulo];
                  const esAprobado = row.tipo === "Permiso" ? esEstadoAprobado(row.estado) : true;
                  return (
                    <tr
                      key={i}
                      className={`group transition-colors hover:bg-white/[0.05] ${esAprobado ? "" : "print:hidden"}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10 transition-transform duration-200 group-hover:scale-110"
                            style={{ background: `${m.color}26` }}
                          >
                            <Icon path={m.icon} className="h-3.5 w-3.5" stroke={m.color} strokeWidth={1.8} />
                          </span>
                          <span className="font-medium text-white/90">{row.tipo}</span>
                        </div>
                      </td>
                      <td className="max-w-xs truncate px-6 py-4 text-white/55">{row.subtipo}</td>
                      <td className="whitespace-nowrap px-6 py-4 text-white/45">{formatFecha(row.fecha)}</td>
                      <td className="px-6 py-4 text-right">
                        <EstadoBadge estado={row.estado} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Móvil — lista de tarjetas */}
            <ul className="divide-y divide-white/[0.07] sm:hidden print:hidden">
              {recientes.map((row, i) => {
                const m = MODULOS[row.modulo];
                const esAprobado = row.tipo === "Permiso" ? esEstadoAprobado(row.estado) : true;
                return (
                  <li key={i} className={`flex gap-3 px-5 py-4 ${esAprobado ? "" : "print:hidden"}`}>
                    <span
                      className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ring-white/10"
                      style={{ background: `${m.color}26` }}
                    >
                      <Icon path={m.icon} className="h-4 w-4" stroke={m.color} strokeWidth={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-white/90">{row.tipo}</p>
                        <EstadoBadge estado={row.estado} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-white/55">{row.subtipo}</p>
                      <p className="mt-1 text-xs text-white/40">{formatFecha(row.fecha)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
