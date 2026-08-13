import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyJWT } from "@/lib/auth";
import { obtenerPermisosEmpleado } from "@/lib/permisos";
import CargarListaAsistencia from "@/components/CargarListaAsistencia";
import ReporteAsistencia from "@/components/ReporteAsistencia";

export const metadata = {
  title: "Asistencia — Sirius Gestión del Ser",
};

export default async function AsistenciaPage() {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) redirect("/login");

  // El módulo dejó de ser la marcación personal: ahora es el monitoreo del
  // biométrico, que trae los datos de todos. Mismo criterio que usan
  // /api/asistencia/reporte y /api/asistencia/lista — aquí solo se evita
  // mostrar una pantalla que igual respondería 403.
  const permisos = await obtenerPermisosEmpleado(payload.sub);
  const alcanceTodos = permisos.some((p) => p.ambito === "Todos");

  if (!alcanceTodos) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-8">
        <div className="glass-solid anim-entrada rounded-2xl px-8 py-12 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-white">Asistencia</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/75">
            El reporte del biométrico consolida las marcaciones de toda la empresa, así que
            solo lo ve quien monitorea la asistencia. Si necesitas revisar las tuyas,
            escríbele a Gestión del Ser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-8 py-8">
      <div className="glass-solid anim-entrada overflow-hidden rounded-2xl">
        <CargarListaAsistencia enlaceReporte={false} />
      </div>
      <ReporteAsistencia />
    </div>
  );
}
