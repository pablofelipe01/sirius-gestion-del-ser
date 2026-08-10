import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { verifyJWT } from "@/lib/auth";
import { SolicitudesOverview } from "@sirius/solicitudes";
import { DiasPactoWidget } from "@/components/DiasPactoWidget";
import DashboardAutorizaciones from "@/components/DashboardAutorizaciones";

export default async function SolicitudesPage() {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) redirect("/login");

  // El fondo nocturno lo aporta el layout del dashboard.
  return (
    <>
      {/*
        El widget de días de pacto entra como slot del overview y no antes: en
        esta vista el título va primero, sobre el cielo, y meter un aviso encima
        del encabezado partía la composición en dos.
      */}
      <SolicitudesOverview idCore={payload.idCore} nombre={payload.nombre}>
        <Suspense fallback={<div className="glass h-24 animate-pulse rounded-2xl print:hidden" />}>
          <DiasPactoWidget />
        </Suspense>
      </SolicitudesOverview>

      {/* Dashboard de autorizaciones (si tiene permisos) - ABAJO */}
      <div className="mx-auto max-w-5xl px-4 pb-14 sm:px-8">
        <DashboardAutorizaciones />
      </div>
    </>
  );
}
