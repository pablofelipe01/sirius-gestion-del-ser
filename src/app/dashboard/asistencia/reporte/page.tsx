import { redirect } from "next/navigation";

/**
 * El reporte se movió a /dashboard/asistencia, que dejó de ser la marcación
 * personal. Esta ruta queda como redirección para los enlaces ya repartidos.
 */
export default function ReporteAsistenciaPage() {
  redirect("/dashboard/asistencia");
}
