import Link from "next/link";

/* ─────────────────────────────────────────────────────────────────────────────
   Sistema de diseño del módulo de Solicitudes
   Primitivas compartidas por los 3 formularios y el overview.
   ────────────────────────────────────────────────────────────────────────── */

export type ModuloKey = "permiso" | "vacaciones" | "novedades";

export const MODULOS: Record<
  ModuloKey,
  { label: string; desc: string; color: string; dark: string; icon: React.ReactNode }
> = {
  permiso: {
    label: "Permiso",
    desc: "Médico, personal, calamidad y más",
    color: "#1a51a8",
    dark: "#123a7a",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
  },
  vacaciones: {
    label: "Vacaciones",
    desc: "Registra tu período de descanso",
    color: "#6bb543",
    dark: "#4d8430",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    ),
  },
  novedades: {
    label: "Novedad",
    desc: "Horas extra, incapacidad, cambios de horario",
    color: "#e07b39",
    dark: "#b45f26",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    ),
  },
};

/* ── Iconografía compartida ─────────────────────────────────────────────── */

export function Icon({
  path,
  className = "w-5 h-5",
  stroke = "currentColor",
  strokeWidth = 1.5,
}: {
  path: React.ReactNode;
  className?: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke={stroke} strokeWidth={strokeWidth}>
      {path}
    </svg>
  );
}

export const ICON_CHEVRON_LEFT = (
  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
);
export const ICON_CHEVRON_RIGHT = (
  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
);
export const ICON_CHECK = (
  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
);
export const ICON_CHECK_CIRCLE = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
  />
);

/* ── Clases de campos ───────────────────────────────────────────────────── */

/**
 * `campo-oscuro` (definida en globals.css) es obligatoria en TODO campo: pone
 * `color-scheme: dark` para que el calendario de `type="date"` y el desplegable
 * del `<select>` —que los pinta el sistema— no salgan claros con texto blanco.
 */
const INPUT_BASE =
  "campo-oscuro w-full rounded-xl border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/35 hover:border-white/20 hover:bg-white/[0.09] focus:ring-2";

// Clases literales — Tailwind escanea el código fuente, no acepta interpolación en runtime.
const FOCUS_RING: Record<ModuloKey, string> = {
  permiso:    "focus:border-[#4d8ee8] focus:ring-[#1a51a8]/40",
  vacaciones: "focus:border-[#8fd363] focus:ring-[#6bb543]/35",
  novedades:  "focus:border-[#f0a06a] focus:ring-[#e07b39]/35",
};

/** Input estándar con el focus ring del módulo. */
export function inputCls(modulo: ModuloKey) {
  return `${INPUT_BASE} ${FOCUS_RING[modulo]}`;
}

export const readonlyCls =
  "campo-oscuro w-full cursor-default truncate rounded-xl border border-white/8 bg-black/20 px-4 py-2.5 text-sm text-white/55";

/* ── Campo con etiqueta ─────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const obligatorio = label.trim().endsWith("*");
  const texto = obligatorio ? label.trim().slice(0, -1).trim() : label;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-baseline gap-1.5 text-sm font-medium text-white/80">
        <span>{texto}</span>
        {obligatorio && <span className="text-rose-400">*</span>}
        {hint && <span className="text-xs font-normal text-white/40">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Encabezado del formulario ──────────────────────────────────────────── */

export function FormHeader({
  modulo,
  titulo,
  subtitulo,
  backHref,
}: {
  modulo: ModuloKey;
  titulo: string;
  subtitulo: string;
  backHref: string;
}) {
  const m = MODULOS[modulo];

  return (
    <div className="anim-entrada mb-6 flex items-center gap-4">
      <Link
        href={backHref}
        aria-label="Volver a solicitudes"
        className="glass flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white/60 transition-all hover:-translate-x-0.5 hover:text-white"
      >
        <Icon path={ICON_CHEVRON_LEFT} className="h-4 w-4" strokeWidth={2} />
      </Link>

      <div
        className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ring-white/10"
        style={{ background: `${m.color}26`, boxShadow: `0 12px 30px -18px ${m.color}` }}
      >
        <Icon path={m.icon} className="h-5 w-5" stroke={m.color} strokeWidth={1.7} />
      </div>

      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold tracking-tight text-white sm:text-2xl">{titulo}</h1>
        <p className="text-sm text-white/45">{subtitulo}</p>
      </div>
    </div>
  );
}

/* ── Título de sección con acento de color ──────────────────────────────── */

export function SectionTitle({
  children,
  color,
  paso,
}: {
  children: React.ReactNode;
  color: string;
  paso?: number;
}) {
  return (
    <div className="flex items-center gap-2.5">
      {paso !== undefined ? (
        <span
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ring-1 ring-inset ring-white/10"
          style={{ background: `${color}33`, color: "#fff" }}
        >
          {paso}
        </span>
      ) : (
        <span
          className="h-3.5 w-1 flex-shrink-0 rounded-full"
          style={{ background: color, boxShadow: `0 0 8px ${color}` }}
        />
      )}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{children}</p>
    </div>
  );
}

/* ── Bloque de datos del empleado (auto-llenado) ────────────────────────── */

export function DatosEmpleado({
  me,
  color,
  compacto = false,
}: {
  me: { nombre: string; cedula: string; idCore: string; cargo: string } | null;
  color: string;
  compacto?: boolean;
}) {
  const iniciales = me?.nombre
    ? me.nombre
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase()
    : "··";

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ring-1 ring-inset ring-white/15"
          style={{ background: color, boxShadow: `0 10px 24px -14px ${color}` }}
        >
          {iniciales}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {me?.nombre ?? "Cargando..."}
          </p>
          <p className="truncate text-xs text-white/45">{me?.cargo || "Sin cargo asignado"}</p>
        </div>
        <span className="hidden flex-shrink-0 rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-white/55 ring-1 ring-inset ring-white/10 sm:inline">
          {me?.idCore ?? "—"}
        </span>
      </div>

      {!compacto && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/10 pt-3 text-xs">
          <div className="flex flex-col gap-0.5">
            <dt className="text-white/35">Cédula</dt>
            <dd className="font-medium text-white/80">{me?.cedula ?? "—"}</dd>
          </div>
          <div className="flex flex-col gap-0.5 sm:hidden">
            <dt className="text-white/35">ID empleado</dt>
            <dd className="font-medium text-white/80">{me?.idCore ?? "—"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/* ── Mensaje de error ───────────────────────────────────────────────────── */

export function ErrorMsg({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/12 px-4 py-3 text-sm text-rose-200"
    >
      <Icon
        path={
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        }
        className="mt-px h-4 w-4 flex-shrink-0"
        strokeWidth={2}
      />
      <span>{children}</span>
    </div>
  );
}

/* ── Botón de envío ─────────────────────────────────────────────────────── */

export function SubmitButton({
  color,
  loading,
  disabled,
  children,
}: {
  color: string;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0 disabled:hover:brightness-100"
      style={{ background: color, boxShadow: `0 16px 34px -18px ${color}` }}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M22 12a10 10 0 01-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

/* ── Pantalla de éxito ──────────────────────────────────────────────────── */

export function SuccessCard({
  color,
  titulo,
  mensaje,
  onReset,
  resetLabel,
  basePath,
}: {
  color: string;
  titulo: string;
  mensaje: string;
  onReset: () => void;
  resetLabel: string;
  basePath: string;
}) {
  return (
    <div className="mx-auto max-w-2xl p-4 pt-8 sm:p-8 sm:pt-12">
      <div className="glass-solid anim-entrada relative overflow-hidden rounded-2xl">
        <div className="h-1.5" style={{ background: color }} />

        {/* El color del módulo celebra el envío detrás del vidrio */}
        <span
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-72 -translate-x-1/2 rounded-full opacity-30 blur-3xl"
          style={{ background: color }}
        />

        <div className="relative flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-10">
          <div
            className="flex h-16 w-16 items-center justify-center rounded-full ring-1 ring-inset ring-white/15"
            style={{ background: `${color}33`, boxShadow: `0 18px 40px -20px ${color}` }}
          >
            <Icon path={ICON_CHECK} className="h-8 w-8" stroke="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">{titulo}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-white/50">{mensaje}</p>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
            <button
              onClick={onReset}
              className="rounded-xl border border-white/12 bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-white/75 transition-colors hover:bg-white/12 hover:text-white"
            >
              {resetLabel}
            </button>
            <Link
              href={basePath}
              className="rounded-xl px-5 py-2.5 text-center text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:brightness-110"
              style={{ background: color, boxShadow: `0 14px 30px -16px ${color}` }}
            >
              Ver mis solicitudes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Utilidades de formato ──────────────────────────────────────────────── */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Formatea "2026-07-28" → "28 jul 2026" sin desfase de zona horaria. */
export function formatFecha(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso || "—";
  const [, y, mes, d] = m;
  return `${Number(d)} ${MESES[Number(mes) - 1]} ${y}`;
}
