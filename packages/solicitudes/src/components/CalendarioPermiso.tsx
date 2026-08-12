"use client";

import { useState } from "react";
import { esFestivo } from "../lib/festivos";
import { Icon, ICON_CHEVRON_LEFT, ICON_CHEVRON_RIGHT, MODULOS, formatFecha } from "./ui";

/**
 * `multiple` — días independientes (permisos, días sirianos).
 * `rango`    — período: el primer clic fija el inicio y el segundo el fin. Una vez
 *              cerrado el período, cada clic agrega o quita un día puntual.
 */
type Modo = "multiple" | "rango";

interface Props {
  /** Todas las fechas seleccionadas en ISO "YYYY-MM-DD". En modo rango incluye los días intermedios. */
  fechasSeleccionadas: string[];
  onChange: (fechas: string[]) => void;
  maxDias?: number; // Límite máximo de días seleccionables
  modo?: Modo;
  color?: string;
  /** Bloquea domingos — no son días hábiles para vacaciones (Art. 186 CST). */
  excluirDomingos?: boolean;
  /** Bloquea festivos colombianos. */
  excluirFestivos?: boolean;
  /**
   * Días de la semana elegibles (0 = domingo … 6 = sábado). Sin esta prop
   * cualquier día sirve. La usan los planes de compensación: el de sábados solo
   * admite [6] y el de una hora diaria solo días hábiles.
   */
  diasSemanaPermitidos?: number[];
  /** Permite elegir días ya pasados — para agendar sobre permisos antiguos. */
  permitirPasado?: boolean;
  /** Primera fecha elegible en ISO "YYYY-MM-DD" — bloquea todo lo anterior. */
  minimo?: string;
}

const NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const NOMBRES_DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const NOMBRES_DIAS_LARGO = [
  "domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados",
];

/** Convierte a "YYYY-MM-DD" en zona local — toISOString() desfasa el día. */
function toISODate(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Expande un rango inclusivo a la lista de días que contiene. */
function expandirRango(desde: string, hasta: string): string[] {
  const fechas: string[] = [];
  const cursor = new Date(desde + "T12:00:00");
  const fin = new Date(hasta + "T12:00:00");
  while (cursor <= fin) {
    fechas.push(toISODate(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return fechas;
}

export function CalendarioPermiso({
  fechasSeleccionadas,
  onChange,
  maxDias,
  modo = "multiple",
  color = MODULOS.permiso.color,
  excluirDomingos = false,
  excluirFestivos = false,
  diasSemanaPermitidos,
  permitirPasado = false,
  minimo,
}: Props) {
  const hoy = new Date();
  const [mesActual, setMesActual] = useState(hoy.getMonth());
  const [anioActual, setAnioActual] = useState(hoy.getFullYear());
  // Modo rango: primer día elegido mientras esperamos el segundo clic.
  const [anclaPendiente, setAnclaPendiente] = useState<string | null>(null);

  const esRango = modo === "rango";
  // Con maxDias = 1 el clic en otro día reemplaza la selección en vez de bloquearse.
  const seleccionUnica = !esRango && maxDias === 1;
  const limiteAlcanzado =
    !esRango &&
    !seleccionUnica &&
    maxDias !== undefined &&
    fechasSeleccionadas.length >= maxDias;

  const primera = fechasSeleccionadas[0];
  const ultima = fechasSeleccionadas[fechasSeleccionadas.length - 1];

  function obtenerDiasDelMes(mes: number, anio: number): (number | null)[] {
    const primerDia = new Date(anio, mes, 1);
    const ultimoDia = new Date(anio, mes + 1, 0);
    const dias: (number | null)[] = [];

    // Espacios vacíos al inicio (para alinear el primer día)
    for (let i = 0; i < primerDia.getDay(); i++) {
      dias.push(null);
    }

    // Días del mes
    for (let dia = 1; dia <= ultimoDia.getDate(); dia++) {
      dias.push(dia);
    }

    return dias;
  }

  /** Motivo por el que una fecha no se puede elegir, o null si está disponible. */
  function motivoNoDisponible(iso: string): "domingo" | "festivo" | "dia-semana" | null {
    const diaSemana = new Date(iso + "T12:00:00").getDay();
    if (excluirDomingos && diaSemana === 0) return "domingo";
    if (diasSemanaPermitidos && !diasSemanaPermitidos.includes(diaSemana)) return "dia-semana";
    if (excluirFestivos && esFestivo(iso)) return "festivo";
    return null;
  }

  /** "sábados" · "lunes a viernes" — para explicar por qué el resto está bloqueado. */
  const nombreDiasPermitidos = diasSemanaPermitidos
    ? diasSemanaPermitidos.map((d) => NOMBRES_DIAS_LARGO[d]).join(", ")
    : "";

  function toggleDia(fechaStr: string) {
    if (fechasSeleccionadas.includes(fechaStr)) {
      onChange(fechasSeleccionadas.filter((f) => f !== fechaStr));
      return;
    }
    if (seleccionUnica) {
      onChange([fechaStr]);
      return;
    }
    if (maxDias !== undefined && fechasSeleccionadas.length >= maxDias) return;
    onChange([...fechasSeleccionadas, fechaStr].sort());
  }

  function clickDia(dia: number) {
    const fechaStr = toISODate(anioActual, mesActual, dia);

    if (esRango) {
      // Con ancla: cerramos el período (el orden lo resuelve el sort) y descartamos
      // los días no hábiles que caigan dentro.
      if (anclaPendiente) {
        const [desde, hasta] = [anclaPendiente, fechaStr].sort();
        const rango = expandirRango(desde, hasta).filter((f) => !motivoNoDisponible(f));
        if (maxDias !== undefined && rango.length > maxDias) return;

        onChange(rango);
        setAnclaPendiente(null);
        return;
      }

      // Sin nada seleccionado: este clic abre un período nuevo.
      if (fechasSeleccionadas.length === 0) {
        setAnclaPendiente(fechaStr);
        onChange([fechaStr]);
        return;
      }

      // Período ya cerrado: cada clic ajusta un día puntual.
      toggleDia(fechaStr);
      return;
    }

    toggleDia(fechaStr);
  }

  function limpiar() {
    setAnclaPendiente(null);
    onChange([]);
  }

  function esFechaSeleccionada(dia: number): boolean {
    return fechasSeleccionadas.includes(toISODate(anioActual, mesActual, dia));
  }

  /** En modo rango, los extremos se pintan sólidos y el interior suave. */
  function posicionEnRango(dia: number): "inicio" | "fin" | "medio" | "unico" {
    const f = toISODate(anioActual, mesActual, dia);
    if (fechasSeleccionadas.length === 1) return "unico";
    if (f === primera) return "inicio";
    if (f === ultima) return "fin";
    return "medio";
  }

  function esFechaPasada(dia: number): boolean {
    if (permitirPasado) return false;
    const fecha = new Date(anioActual, mesActual, dia);
    fecha.setHours(0, 0, 0, 0);
    const hoyInicio = new Date();
    hoyInicio.setHours(0, 0, 0, 0);
    return fecha < hoyInicio;
  }

  function esHoy(dia: number): boolean {
    return (
      dia === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear()
    );
  }

  function cambiarMes(delta: number) {
    let nuevoMes = mesActual + delta;
    let nuevoAnio = anioActual;

    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio--;
    } else if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAnio++;
    }

    setMesActual(nuevoMes);
    setAnioActual(nuevoAnio);
  }

  const dias = obtenerDiasDelMes(mesActual, anioActual);
  const navBtn =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white/80 transition-colors hover:bg-white/12 hover:text-white";

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      {/* Header del calendario */}
      <div className="mb-4 flex items-center justify-between">
        <button type="button" onClick={() => cambiarMes(-1)} aria-label="Mes anterior" className={navBtn}>
          <Icon path={ICON_CHEVRON_LEFT} className="h-3.5 w-3.5" strokeWidth={2} />
        </button>

        <div className="text-sm font-semibold text-white">
          {NOMBRES_MESES[mesActual]} <span className="font-normal text-white/65">{anioActual}</span>
        </div>

        <button type="button" onClick={() => cambiarMes(1)} aria-label="Mes siguiente" className={navBtn}>
          <Icon path={ICON_CHEVRON_RIGHT} className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>

      {/* Instrucción en modo rango */}
      {esRango && (
        <p className="mb-3 rounded-lg bg-white/[0.06] px-3 py-2 text-center text-xs text-white/80">
          {anclaPendiente
            ? "Ahora selecciona el último día del período"
            : fechasSeleccionadas.length === 0
              ? "Selecciona el primer día del período"
              : "Haz clic en un día para agregarlo o quitarlo"}
        </p>
      )}

      {/* Nombres de días */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {NOMBRES_DIAS.map((nombre, i) => (
          <div
            key={nombre}
            className={`py-1 text-center text-[11px] font-medium uppercase tracking-wide ${
              i === 0 || i === 6 ? "text-white/45" : "text-white/65"
            }`}
          >
            {nombre}
          </div>
        ))}
      </div>

      {/* Días del mes */}
      <div className="grid grid-cols-7 gap-1">
        {dias.map((dia, idx) => {
          if (dia === null) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const iso = toISODate(anioActual, mesActual, dia);
          const seleccionado = esFechaSeleccionada(dia);
          // Comparar ISO como texto basta: "YYYY-MM-DD" ordena igual que la fecha.
          const pasado = esFechaPasada(dia) || (minimo ? iso < minimo : false);
          const noDisponible = motivoNoDisponible(iso);
          const bloqueado = pasado || !!noDisponible || (limiteAlcanzado && !seleccionado);

          // En modo rango el interior del período se pinta suave.
          const pos = seleccionado && esRango ? posicionEnRango(dia) : null;
          const esExtremo = !esRango || pos === "inicio" || pos === "fin" || pos === "unico";

          let estilo: React.CSSProperties | undefined;
          if (seleccionado) {
            estilo = esExtremo
              ? { background: color, color: "#fff" }
              : { background: `${color}40`, color: "#fff" };
          }

          return (
            <button
              key={dia}
              type="button"
              onClick={() => !bloqueado && clickDia(dia)}
              disabled={bloqueado}
              aria-pressed={seleccionado}
              aria-label={
                noDisponible === "festivo"
                  ? `${dia} — festivo, no disponible`
                  : noDisponible === "domingo"
                    ? `${dia} — domingo, no disponible`
                    : noDisponible === "dia-semana"
                      ? `${dia} — solo se pueden elegir ${nombreDiasPermitidos}`
                      : undefined
              }
              title={
                noDisponible === "festivo"
                  ? "Festivo — no disponible"
                  : noDisponible === "domingo"
                    ? "Domingo — no disponible"
                    : noDisponible === "dia-semana"
                      ? `Solo se pueden elegir ${nombreDiasPermitidos}`
                      : undefined
              }
              className={`relative flex aspect-square items-center justify-center text-sm font-medium transition-all ${
                seleccionado && !esExtremo ? "rounded-none" : "rounded-lg"
              } ${
                seleccionado
                  ? "shadow-sm"
                  : noDisponible
                    ? "cursor-not-allowed bg-white/[0.03] text-white/40 line-through decoration-white/25"
                    : bloqueado
                      ? "cursor-not-allowed text-white/40"
                      : "text-white/80 hover:bg-white/12 active:scale-95"
              }`}
              style={estilo}
            >
              {dia}
              {noDisponible === "festivo" && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-rose-400/80" />
              )}
              {esHoy(dia) && !seleccionado && !noDisponible && (
                <span
                  className="absolute bottom-1 h-1 w-1 rounded-full"
                  style={{ background: color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda de días no disponibles */}
      {(excluirDomingos || excluirFestivos || diasSemanaPermitidos) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-white/65">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-white/[0.06] ring-1 ring-inset ring-white/15" />
            No disponible
          </span>
          {excluirFestivos && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400/80" />
              Festivo
            </span>
          )}
          <span className="text-white/65">
            {diasSemanaPermitidos
              ? `Solo se pueden elegir ${nombreDiasPermitidos}.`
              : excluirDomingos && excluirFestivos
                ? "Los domingos y festivos no cuentan como días de vacaciones."
                : excluirDomingos
                  ? "Los domingos no están disponibles."
                  : "Los festivos no están disponibles."}
          </span>
        </div>
      )}

      {/* Resumen de la selección */}
      {fechasSeleccionadas.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-baseline gap-1.5 text-sm text-white/85">
            <span className="font-semibold" style={{ color }}>
              {fechasSeleccionadas.length}
            </span>
            {!esRango && maxDias && !seleccionUnica ? (
              <span className="text-white/65">de {maxDias}</span>
            ) : null}
            <span>
              {fechasSeleccionadas.length === 1 ? "día" : "días"}
              {excluirDomingos || excluirFestivos
                ? fechasSeleccionadas.length === 1
                  ? " hábil"
                  : " hábiles"
                : ""}
            </span>
            {esRango && fechasSeleccionadas.length > 1 && (
              <span className="text-xs text-white/65">
                · {formatFecha(primera)} → {formatFecha(ultima)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={limpiar}
            className="text-xs font-medium text-white/70 underline underline-offset-2 transition-colors hover:text-white/80"
          >
            Limpiar
          </button>
        </div>
      )}

      {/* Contador vacío cuando hay un tope definido */}
      {fechasSeleccionadas.length === 0 && !esRango && maxDias ? (
        <p className="mt-3 border-t border-white/10 pt-3 text-center text-sm text-white/65">
          {seleccionUnica ? "Selecciona un día" : `0 de ${maxDias} días seleccionados`}
        </p>
      ) : null}
    </div>
  );
}
