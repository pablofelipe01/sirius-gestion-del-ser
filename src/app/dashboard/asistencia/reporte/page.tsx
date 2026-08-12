import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyJWT } from "@/lib/auth";
import ReporteAsistencia from "@/components/ReporteAsistencia";

export const metadata = {
  title: "Reporte de asistencia — Sirius Gestión del Ser",
};

export default async function ReporteAsistenciaPage() {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) redirect("/login");

  // El control real de quién puede ver el reporte lo hace /api/asistencia/reporte
  // con los permisos de autorización: aquí solo se exige sesión.
  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <Link
        href="/dashboard/historico"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-white/75 transition-all hover:-translate-x-0.5 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Volver al histórico
      </Link>
      <ReporteAsistencia />
    </div>
  );
}
