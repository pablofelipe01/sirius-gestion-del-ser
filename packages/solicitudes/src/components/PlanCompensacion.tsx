"use client";

/**
 * Selector del plan con el que se repone un permiso compensable.
 *
 * Lo usan las dos puntas del flujo: el trabajador lo propone al radicar el
 * permiso y Gestión del Ser lo confirma —o lo cambia— al autorizar. La lógica de
 * los planes vive en `src/lib/compensacion.ts`; aquí solo está la interfaz.
 */

import {
  PLANES_COMPENSACION,
  PLAN_SABADO,
  PLAN_HORA_DIARIA,
  PLAN_RETO,
  sabadosNecesarios,
  generarDiasCompensacion,
} from "@/lib/compensacion";
import { CalendarioPermiso } from "./CalendarioPermiso";
import { SelectorFecha } from "./SelectorFecha";
import { formatFecha } from "./ui";

/** Sábado y días hábiles, como los numera Date.getDay(). */
const SABADO = [6];
const DIAS_HABILES = [1, 2, 3, 4, 5];

export interface DatosPlan {
  /** Plan 1: sábados elegidos. */
  fechas: string[];
  /** Plan 2: primer día de la reposición. */
  desde: string;
  /** Plan 3: fecha límite del reto. */
  fechaLimite: string;
  /** Plan 3: en qué consiste el reto. */
  reto: string;
}

export const DATOS_PLAN_VACIOS: DatosPlan = {
  fechas: [],
  desde: "",
  fechaLimite: "",
  reto: "",
};

interface Props {
  plan: string;
  onPlanChange: (plan: string) => void;
  datos: DatosPlan;
  onDatosChange: (datos: DatosPlan) => void;
  /** Horas que hay que reponer — define cuántas jornadas genera cada plan. */
  horasTotal: number;
  color?: string;
  disabled?: boolean;
}

const campoCls =
  "campo-oscuro w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-white/25 focus:outline-none focus:ring-2 focus:ring-white/15";

export function PlanCompensacion({
  plan,
  onPlanChange,
  datos,
  onDatosChange,
  horasTotal,
  color = "#1a51a8",
  disabled = false,
}: Props) {
  const dias = generarDiasCompensacion(plan, {
    horasTotal,
    fechas: datos.fechas,
    desde: datos.desde,
    fechaLimite: datos.fechaLimite,
    reto: datos.reto,
  });
  const horasCubiertas = dias.reduce((suma, d) => suma + d.horas, 0);

  function actualizar(cambios: Partial<DatosPlan>) {
    onDatosChange({ ...datos, ...cambios });
  }

  const sabadosElegidos = datos.fechas.filter(Boolean);
  const faltantes = Math.max(0, sabadosNecesarios(horasTotal) - sabadosElegidos.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2.5">
        {PLANES_COMPENSACION.map((opcion) => {
          const activo = plan === opcion.id;
          return (
            <button
              key={opcion.id}
              type="button"
              disabled={disabled}
              onClick={() => onPlanChange(activo ? "" : opcion.id)}
              aria-pressed={activo}
              className="rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-60"
              style={{
                borderColor: activo ? color : "rgba(255,255,255,0.12)",
                background: activo ? `${color}2e` : "rgba(255,255,255,0.05)",
                boxShadow: activo ? `0 0 0 1px ${color}, 0 14px 30px -20px ${color}` : undefined,
              }}
            >
              <p
                className="text-sm font-medium"
                style={{ color: activo ? "#fff" : "rgba(255,255,255,0.75)" }}
              >
                {opcion.nombre}
              </p>
              <p className="mt-0.5 text-xs text-white/70">{opcion.resumen}</p>
            </button>
          );
        })}
      </div>

      {/* Plan 1 — sábados de 7:00 a. m. a 12:00 m. */}
      {plan === PLAN_SABADO && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
          <p className="mb-2 text-xs font-medium text-white/85">
            Marca en el calendario los sábados en los que asistirá
          </p>

          {/* El calendario solo habilita sábados: no hay forma de elegir un día
              que después el servidor rechace. */}
          <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
            <CalendarioPermiso
              fechasSeleccionadas={sabadosElegidos}
              onChange={(fechas) => actualizar({ fechas })}
              diasSemanaPermitidos={SABADO}
              color={color}
            />
          </div>

          {sabadosElegidos.length > 0 && (
            <p className="mt-2 text-xs text-white/85">
              {sabadosElegidos.map(formatFecha).join(" · ")}
            </p>
          )}
          {faltantes > 0 && (
            <p className="mt-2 text-xs text-white/70">
              Con jornadas de 5 h faltan {faltantes} sábado{faltantes > 1 ? "s" : ""} para
              cubrir las {horasTotal} h.
            </p>
          )}
        </div>
      )}

      {/* Plan 2 — una hora diaria hasta completar */}
      {plan === PLAN_HORA_DIARIA && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3.5">
          <label className="mb-1.5 block text-xs font-medium text-white/85">
            Desde qué día empieza a reponer
          </label>
          <SelectorFecha
            valor={datos.desde}
            onChange={(desde) => actualizar({ desde })}
            placeholder="Elegir el primer día"
            ariaLabel="Desde qué día empieza a reponer"
            // La reposición es de lunes a viernes: empezarla un fin de semana
            // solo correría la cuenta al lunes siguiente sin decirlo.
            diasSemanaPermitidos={DIAS_HABILES}
            color={color}
            disabled={disabled}
          />
          <p className="mt-2 text-xs text-white/70">
            Se agenda una hora por día hábil (lunes a viernes) hasta completar las{" "}
            {horasTotal} h.
          </p>
        </div>
      )}

      {/* Plan 3 — reto */}
      {plan === PLAN_RETO && (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/85">
              ¿En qué consiste el reto?
            </label>
            <textarea
              value={datos.reto}
              disabled={disabled}
              onChange={(e) => actualizar({ reto: e.target.value })}
              rows={3}
              placeholder="Ej: liderar la capacitación de bioinsumos del equipo de campo"
              className={campoCls + " resize-none"}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/85">
              Fecha límite para cumplirlo
            </label>
            <SelectorFecha
              valor={datos.fechaLimite}
              onChange={(fechaLimite) => actualizar({ fechaLimite })}
              placeholder="Elegir la fecha límite"
              ariaLabel="Fecha límite para cumplir el reto"
              color={color}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {dias.length > 0 && (
        <p className="text-xs text-white/70">
          {dias.length} jornada{dias.length > 1 ? "s" : ""} · {horasCubiertas} h de{" "}
          {horasTotal} h por reponer.
        </p>
      )}
    </div>
  );
}
