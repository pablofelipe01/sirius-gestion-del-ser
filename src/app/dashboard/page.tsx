import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { TarjetaTilt } from "@sirius/solicitudes";
import { verifyJWT } from "@/lib/auth";

const MODULES = [
  {
    label: "Asistencia",
    desc: "Reporte del biométrico: jornadas por colaborador y carga de la lista.",
    href: "/dashboard/asistencia",
    color: "#1a51a8",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    ),
    ready: true,
  },
  {
    label: "Solicitudes",
    desc: "Vacaciones, permisos y novedades de nómina.",
    href: "/dashboard/solicitudes",
    color: "#6bb543",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
    ),
    ready: true,
  },
  {
    label: "Contratos",
    desc: "Gestión de contratos, renovaciones y alertas de vencimiento.",
    href: "/dashboard/contratos",
    color: "#e07b39",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    ),
    ready: false,
  },
  {
    label: "Documentos",
    desc: "Cumplimiento documental y carga de archivos.",
    href: "/dashboard/documentos",
    color: "#8b5cf6",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    ),
    ready: false,
  },
  {
    label: "Horarios",
    desc: "Turnos, cronogramas y configuración de jornadas.",
    href: "/dashboard/horarios",
    color: "#0891b2",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    ),
    ready: false,
  },
  {
    label: "Asistente IA",
    desc: "Consulta datos de RRHH con lenguaje natural.",
    href: "/dashboard/asistente",
    color: "#29b6e8",
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
    ),
    ready: false,
  },
];

/**
 * El saludo se calcula en el servidor, así que la hora local del proceso no
 * sirve: en despliegue es UTC y después de las 19:00 en Colombia diría
 * "Buenos días". Toda hora de esta aplicación es hora de Bogotá.
 */
function greeting() {
  const h = Number(
    new Intl.DateTimeFormat("es-CO", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Bogota",
    }).format(new Date()),
  );
  if (h < 12) return "Buenos días";
  if (h < 18) return "Buenas tardes";
  return "Buenas noches";
}

/*
 * Tres capas, y cada una por un motivo:
 *   envoltorio  → `anim-entrada` (usa `forwards`, deja fijado `transform: none`
 *                 y en el mismo elemento anularía el hover)
 *   TarjetaTilt → la inclinación 3D siguiendo el mouse (solo si es clicable)
 *   tarjeta     → el vidrio y los estados de hover del contenido
 */
function ModuleCard({ mod, orden }: { mod: (typeof MODULES)[0]; orden: number }) {
  const card = (
    <div className="glass relative flex h-full flex-col gap-4 overflow-hidden rounded-2xl p-5 transition-all duration-300">
      {/* Resplandor del color del módulo — solo en los que ya se pueden abrir */}
      {mod.ready && (
        <span
          className="pointer-events-none absolute -bottom-16 left-1/2 h-32 w-44 -translate-x-1/2 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-60"
          style={{ background: mod.color }}
        />
      )}

      <div className="relative flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset ring-white/10 transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${mod.color}26` }}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={mod.color} strokeWidth={1.6}>
            {mod.icon}
          </svg>
        </div>
        {!mod.ready && (
          <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-xs font-medium text-white/65 ring-1 ring-inset ring-white/10">
            Próximamente
          </span>
        )}
      </div>
      <div className="relative">
        <h3 className="mb-1 font-semibold text-white">{mod.label}</h3>
        <p className="text-sm leading-relaxed text-white/70">{mod.desc}</p>
      </div>
    </div>
  );

  const delay = { animationDelay: `${260 + orden * 70}ms` } as const;

  return (
    <div className="anim-entrada h-full" style={delay}>
      {mod.ready ? (
        // Los módulos pendientes no se inclinan: el efecto invita a hacer clic y
        // ahí no hay nada que abrir.
        <TarjetaTilt glow={mod.color}>
          <Link href={mod.href} className="group block h-full">
            {card}
          </Link>
        </TarjetaTilt>
      ) : (
        <div className="h-full opacity-60">{card}</div>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) redirect("/login");

  const firstName = payload.nombre.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-8 sm:pt-12">
      {/* ── Encabezado sobre el cielo ──────────────────────────────────────── */}
      <div className="anim-entrada mb-10">
        <p className="mb-2 text-sm text-white/70">{greeting()},</p>
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
          {firstName}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium text-white"
            style={{ background: "#1a51a8", boxShadow: "0 10px 24px -14px #1a51a8" }}
          >
            {payload.rol}
          </span>
          <span className="glass rounded-full px-2.5 py-1 text-xs font-medium text-white/80">
            {payload.idCore}
          </span>
        </div>
      </div>

      {/* ── Tarjeta de bienvenida ───────────────────────────────────────────── */}
      <div
        className="glass-solid anim-entrada relative mb-10 flex items-center gap-6 overflow-hidden rounded-2xl p-6"
        style={{ animationDelay: "120ms" }}
      >
        {/* La estrella de Sirius: el cian de marca encendido detrás del vidrio */}
        <span
          className="anim-aurora pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full blur-3xl"
          style={{ background: "radial-gradient(circle, rgba(41,182,232,0.35), transparent 70%)" }}
        />
        <div className="relative flex-1">
          <h2 className="mb-1 text-lg font-semibold text-white">
            Bienvenido a Sirius Gestión del Ser
          </h2>
          <p className="max-w-xl text-sm leading-relaxed text-white/75">
            Plataforma integral de talento humano. Los módulos se irán habilitando progresivamente.
          </p>
        </div>
        <div
          className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ring-white/15"
          style={{ background: "rgba(41,182,232,0.18)", boxShadow: "0 16px 40px -20px #29b6e8" }}
        >
          <svg className="h-7 w-7 text-[#29b6e8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </div>
      </div>

      {/* ── Módulos ─────────────────────────────────────────────────────────── */}
      <div className="anim-entrada mb-4 flex items-center gap-3" style={{ animationDelay: "200ms" }}>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
          Módulos
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((mod, i) => (
          <ModuleCard key={mod.href} mod={mod} orden={i} />
        ))}
      </div>
    </div>
  );
}
