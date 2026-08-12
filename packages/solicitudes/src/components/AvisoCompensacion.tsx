"use client";

/**
 * Aviso en la lista de solicitudes del colaborador: Gestión del Ser aprobó un
 * permiso como compensatorio pero dejó sin definir cómo se repone el tiempo.
 * Mientras el plan esté vacío, el permiso aparece aquí hasta que lo elija.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlanCompensacion, DATOS_PLAN_VACIOS, type DatosPlan } from "./PlanCompensacion";
import { MODULOS, formatFecha } from "./ui";
import { PLAN_RETO, PLAN_SABADO, esSabado, generarDiasCompensacion } from "@/lib/compensacion";

export interface PermisoSinPlan {
  id: string;
  tipo: string;
  fecha: string;
  horasTotal: number;
}

interface Props {
  permisos: PermisoSinPlan[];
  apiBasePath?: string;
}

const COLOR = MODULOS.permiso.color;

export function AvisoCompensacion({ permisos, apiBasePath = "" }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<PermisoSinPlan | null>(null);
  const [plan, setPlan] = useState("");
  const [datos, setDatos] = useState<DatosPlan>(DATOS_PLAN_VACIOS);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Resultado de la última definición de plan, ya cerrado el modal. */
  const [resultado, setResultado] = useState<{ texto: string; ok: boolean } | null>(null);

  // El aviso sobrevive a la desaparición del permiso de la lista: al guardar el
  // plan el permiso deja de estar pendiente, y sin esto el mensaje se perdería.
  if (permisos.length === 0 && !resultado) return null;

  function abrir(permiso: PermisoSinPlan) {
    setAbierto(permiso);
    setPlan("");
    setDatos(DATOS_PLAN_VACIOS);
    setError("");
  }

  async function guardar() {
    if (!abierto) return;

    if (!plan) {
      setError("Elige con cuál de los tres planes vas a reponer el tiempo.");
      return;
    }
    if (plan === PLAN_SABADO && datos.fechas.some((f) => f && !esSabado(f))) {
      setError("Las fechas deben caer en sábado.");
      return;
    }
    if (plan === PLAN_RETO && !datos.reto.trim()) {
      setError("Describe en qué consiste el reto.");
      return;
    }

    const dias = generarDiasCompensacion(plan, {
      horasTotal: abierto.horasTotal,
      fechas: datos.fechas,
      desde: datos.desde,
      fechaLimite: datos.fechaLimite,
      reto: datos.reto,
    });
    if (dias.length === 0) {
      setError("Completa las fechas del plan.");
      return;
    }

    setError("");
    setGuardando(true);

    try {
      const res = await fetch(`${apiBasePath}/api/solicitudes/permiso/compensacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: abierto.id,
          plan,
          fechas: datos.fechas,
          desde: datos.desde,
          fechaLimite: datos.fechaLimite,
          reto: datos.reto,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "No se pudo guardar el plan.");
        return;
      }

      const cuerpo = await res.json().catch(() => ({}));
      setAbierto(null);
      // El documento de autorización se reemite con el plan ya definido. Si eso
      // falla, el plan igual quedó guardado: se dice, no se oculta.
      setResultado(
        cuerpo.aviso
          ? { texto: cuerpo.aviso, ok: false }
          : {
              texto:
                "Listo. Tu plan quedó registrado y el documento de autorización se actualizó con los días pactados.",
              ok: true,
            },
      );
      router.refresh();
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      {resultado && (
        <div
          className={`glass mb-6 flex items-start gap-3 rounded-2xl px-5 py-4 print:hidden ${
            resultado.ok ? "text-green-200" : "text-amber-100"
          }`}
        >
          <svg className="mt-0.5 h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={
                resultado.ok
                  ? "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  : "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              }
            />
          </svg>
          <p className="text-sm leading-relaxed">{resultado.texto}</p>
        </div>
      )}

      {permisos.length > 0 && (
      <div
        className="glass relative mb-8 overflow-hidden rounded-2xl print:hidden"
        style={{ borderColor: "rgba(245,158,11,0.35)" }}
      >
        {/* El ámbar del aviso encendido detrás del vidrio: pide acción sin gritar */}
        <span
          className="pointer-events-none absolute -left-16 -top-20 h-48 w-72 rounded-full opacity-25 blur-3xl"
          style={{ background: "#f59e0b" }}
        />
        <div className="relative flex items-start gap-3 px-5 py-4 sm:px-6">
          <svg
            className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-2.994-1.5-3.86 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-100">
              {permisos.length === 1
                ? "Falta definir cómo repones un permiso"
                : `Falta definir cómo repones ${permisos.length} permisos`}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-100/60">
              Estos permisos se aprobaron como compensatorios. Elige con cuál plan vas a
              reponer el tiempo.
            </p>
          </div>
        </div>

        <ul className="relative divide-y divide-white/10 border-t border-white/10">
          {permisos.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-white/[0.04] sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/90">{p.tipo}</p>
                <p className="mt-0.5 text-xs text-white/70">
                  {formatFecha(p.fecha)} · {p.horasTotal} h por reponer
                </p>
              </div>
              <button
                type="button"
                onClick={() => abrir(p)}
                className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:brightness-110"
                style={{ background: COLOR, boxShadow: `0 10px 24px -12px ${COLOR}` }}
              >
                Definir cómo repongo
              </button>
            </li>
          ))}
        </ul>
      </div>
      )}

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040711]/80 p-4 backdrop-blur-md">
          <div className="anim-entrada flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b1120] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
            <div className="border-b border-white/10 px-6 py-5">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                ¿Cómo vas a reponer el tiempo?
              </h2>
              <p className="mt-1 text-sm text-white/70">
                {abierto.tipo} del {formatFecha(abierto.fecha)} · {abierto.horasTotal} h por
                reponer
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PlanCompensacion
                plan={plan}
                onPlanChange={setPlan}
                datos={datos}
                onDatosChange={setDatos}
                horasTotal={abierto.horasTotal}
                color={COLOR}
                disabled={guardando}
              />

              {error && (
                <p className="mt-4 rounded-xl border border-rose-400/35 bg-rose-500/12 p-3 text-sm text-rose-200">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/30 px-6 py-4">
              <button
                type="button"
                onClick={() => setAbierto(null)}
                disabled={guardando}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || !plan}
                className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/60"
                style={plan && !guardando ? { background: COLOR, boxShadow: `0 14px 30px -16px ${COLOR}` } : undefined}
              >
                {guardando ? "Guardando..." : "Confirmar plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
