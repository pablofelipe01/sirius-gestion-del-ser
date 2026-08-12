"use client";

/**
 * Campo de una sola fecha que se elige en un calendario, no escribiéndola.
 *
 * Existe porque `<input type="date">` obliga a teclear "dd/mm/aaaa" o a pelear
 * con el picker del navegador, que cambia en cada uno. Aquí el desplegable es
 * siempre el mismo `CalendarioPermiso` del resto del módulo, así que las reglas
 * de días hábiles, festivos y sábados se ven igual en todas partes.
 */

import { useEffect, useRef, useState } from "react";
import { CalendarioPermiso } from "./CalendarioPermiso";
import { MODULOS, formatFecha } from "./ui";

interface Props {
  /** Fecha en ISO "YYYY-MM-DD", o cadena vacía si aún no hay ninguna. */
  valor: string;
  onChange: (fecha: string) => void;
  placeholder?: string;
  color?: string;
  disabled?: boolean;
  /** Se propagan al calendario — ver CalendarioPermiso. */
  diasSemanaPermitidos?: number[];
  excluirFestivos?: boolean;
  permitirPasado?: boolean;
  minimo?: string;
  /** Etiqueta accesible del botón cuando no hay una <label> asociada. */
  ariaLabel?: string;
}

const ICON_CALENDARIO =
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5";

export function SelectorFecha({
  valor,
  onChange,
  placeholder = "Elegir fecha",
  color = MODULOS.permiso.color,
  disabled = false,
  diasSemanaPermitidos,
  excluirFestivos = false,
  permitirPasado = false,
  minimo,
  ariaLabel,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Un calendario abierto tapa el formulario: se cierra al hacer clic fuera o
  // con Escape, como cualquier desplegable.
  useEffect(() => {
    if (!abierto) return;

    function alClicFuera(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }

    document.addEventListener("mousedown", alClicFuera);
    document.addEventListener("keydown", alEscape);
    return () => {
      document.removeEventListener("mousedown", alClicFuera);
      document.removeEventListener("keydown", alEscape);
    };
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        className="flex w-full items-center gap-2 rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-left text-sm transition-colors hover:border-white/25 hover:bg-white/[0.09] focus:outline-none focus:ring-2 focus:ring-white/15 disabled:cursor-not-allowed disabled:opacity-40"
        style={abierto ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
      >
        <svg
          className="h-4 w-4 flex-shrink-0"
          style={{ color: valor ? color : "rgba(255,255,255,0.4)" }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d={ICON_CALENDARIO}
          />
        </svg>
        <span className={valor ? "text-white" : "text-white/65"}>
          {valor ? formatFecha(valor) : placeholder}
        </span>
      </button>

      {abierto && (
        <div className="glass-solid absolute left-0 z-30 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl">
          <CalendarioPermiso
            fechasSeleccionadas={valor ? [valor] : []}
            // maxDias = 1: el clic en otro día reemplaza la fecha en vez de bloquearse.
            maxDias={1}
            onChange={(fechas) => {
              onChange(fechas[0] ?? "");
              if (fechas.length > 0) setAbierto(false);
            }}
            color={color}
            diasSemanaPermitidos={diasSemanaPermitidos}
            excluirFestivos={excluirFestivos}
            permitirPasado={permitirPasado}
            minimo={minimo}
          />
        </div>
      )}
    </div>
  );
}
