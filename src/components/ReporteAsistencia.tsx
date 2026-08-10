"use client";

/**
 * Monitoreo del reporte del biométrico.
 *
 * La pantalla está armada alrededor de una pregunta: ¿qué jornadas quedaron mal
 * y hay que gestionar? Por eso las incidencias se cuentan aparte, se pueden
 * aislar con un clic, y las que tienen permiso o vacaciones aprobadas se
 * muestran resueltas en vez de sumar ruido.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  EVENTOS,
  esIncidencia,
  formatearMinutos,
  horaCorta,
  type JornadaReporte,
  type ResumenReporte,
} from "@/lib/reporte-asistencia";

interface Respuesta {
  rango: { desde: string; hasta: string };
  resumen: ResumenReporte;
  jornadas: JornadaReporte[];
}

const ESTILO_ESTADO: Record<string, { fondo: string; texto: string; etiqueta: string }> = {
  [EVENTOS.COMPLETA]:    { fondo: "bg-emerald-50", texto: "text-emerald-700", etiqueta: "Completa" },
  [EVENTOS.SIN_SALIDA]:  { fondo: "bg-amber-50",   texto: "text-amber-700",   etiqueta: "Sin salida" },
  [EVENTOS.SIN_ENTRADA]: { fondo: "bg-orange-50",  texto: "text-orange-700",  etiqueta: "Sin entrada" },
  [EVENTOS.INVALIDO]:    { fondo: "bg-rose-50",    texto: "text-rose-700",    etiqueta: "Inválido" },
};

const FILTROS_ESTADO = [
  { valor: "todas", etiqueta: "Todas las jornadas" },
  { valor: "incidencias", etiqueta: "Solo incidencias" },
  { valor: "sin-justificar", etiqueta: "Incidencias sin justificar" },
  { valor: EVENTOS.COMPLETA, etiqueta: "Completas" },
  { valor: EVENTOS.SIN_SALIDA, etiqueta: "Sin salida" },
  { valor: EVENTOS.SIN_ENTRADA, etiqueta: "Sin entrada" },
  { valor: EVENTOS.INVALIDO, etiqueta: "Inválidas" },
];

/** "jue 30 jul" — con el día de la semana, que es lo que ubica al que revisa. */
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function restarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d - dias)).toISOString().slice(0, 10);
}

export default function ReporteAsistencia() {
  const hoy = new Date().toISOString().slice(0, 10);
  const [desde, setDesde] = useState(() => restarDias(hoy, 30));
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todas");
  const [punto, setPunto] = useState("todos");
  const [turno, setTurno] = useState("todos");
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`/api/asistencia/reporte?desde=${desde}&hasta=${hasta}`, {
        cache: "no-store",
      });
      const cuerpo = await res.json();
      if (!res.ok) throw new Error(cuerpo?.error ?? "fallo");
      setDatos(cuerpo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const puntos = useMemo(
    () => [...new Set((datos?.jornadas ?? []).map((j) => j.punto).filter(Boolean))].sort(),
    [datos],
  );
  const turnos = useMemo(
    () => [...new Set((datos?.jornadas ?? []).map((j) => j.turno).filter(Boolean))].sort(),
    [datos],
  );

  const filtradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return (datos?.jornadas ?? []).filter((j) => {
      if (texto && !`${j.nombre} ${j.documento}`.toLowerCase().includes(texto)) return false;
      if (punto !== "todos" && j.punto !== punto) return false;
      if (turno !== "todos" && j.turno !== turno) return false;

      if (estado === "incidencias") return esIncidencia(j);
      if (estado === "sin-justificar") return esIncidencia(j) && !j.justificacion;
      if (estado !== "todas") return j.estado === estado;
      return true;
    });
  }, [datos, busqueda, estado, punto, turno]);

  /** Las jornadas filtradas, agrupadas por colaborador con sus subtotales. */
  const porColaborador = useMemo(() => {
    const mapa = new Map<string, JornadaReporte[]>();
    for (const jornada of filtradas) {
      const grupo = mapa.get(jornada.documento);
      if (grupo) grupo.push(jornada);
      else mapa.set(jornada.documento, [jornada]);
    }

    return [...mapa.entries()]
      .map(([documento, jornadas]) => ({
        documento,
        nombre: jornadas[0].nombre,
        turno: jornadas[0].turno,
        jornadas,
        minutos: jornadas.reduce((t, j) => t + (j.minutosTrabajados ?? 0), 0),
        incidencias: jornadas.filter(esIncidencia).length,
        sinJustificar: jornadas.filter((j) => esIncidencia(j) && !j.justificacion).length,
      }))
      // Primero quien tiene más pendientes por gestionar: es la lista de trabajo.
      .sort((a, b) => b.sinJustificar - a.sinJustificar || a.nombre.localeCompare(b.nombre));
  }, [filtradas]);

  function alternar(conjunto: Set<string>, clave: string, set: (v: Set<string>) => void) {
    const copia = new Set(conjunto);
    if (copia.has(clave)) copia.delete(clave);
    else copia.add(clave);
    set(copia);
  }

  function exportarCsv() {
    const filas = [
      ["Documento", "Nombre", "Fecha", "Turno", "Punto", "Entrada", "Salida", "Minutos", "Estado", "Justificación"],
      ...filtradas.map((j) => [
        j.documento,
        j.nombre,
        j.fecha,
        j.turno,
        j.punto,
        j.entrada ?? "",
        j.salida ?? "",
        j.minutosTrabajados ?? "",
        j.estado,
        j.justificacion ? `${j.justificacion.tipo}: ${j.justificacion.detalle}` : "",
      ]),
    ];

    const csv = filas
      .map((fila) => fila.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
      .join("\n");

    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `asistencia_${desde}_${hasta}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  const resumen = datos?.resumen;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Encabezado */}
      <div className="border-b border-gray-100 px-6 py-6 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
              Reporte de asistencia
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Marcaciones del biométrico consolidadas por colaborador y día
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportarCsv}
              disabled={filtradas.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              Exportar CSV
            </button>
            <button
              onClick={cargar}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              Actualizar
            </button>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metrica etiqueta="Colaboradores" valor={resumen?.colaboradores ?? 0} tono="slate" />
          <Metrica etiqueta="Jornadas" valor={resumen?.jornadas ?? 0} tono="slate" />
          <Metrica etiqueta="Completas" valor={resumen?.completas ?? 0} tono="emerald" />
          <Metrica
            etiqueta="Por gestionar"
            valor={resumen?.incidenciasSinJustificar ?? 0}
            tono="rose"
            pista="Incidencias sin permiso ni vacaciones"
          />
          <Metrica
            etiqueta="Horas registradas"
            valor={formatearMinutos(resumen?.minutosTotales ?? 0)}
            tono="slate"
          />
        </dl>

        {resumen && resumen.jornadas > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            {resumen.marcaciones} marcaciones · {resumen.dias} días ·{" "}
            {resumen.sinSalida} sin salida · {resumen.sinEntrada} sin entrada ·{" "}
            {resumen.invalidas} inválidas
          </p>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-4 sm:px-8">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">Buscar</label>
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre o cédula…"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </div>
        <Campo etiqueta="Desde">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </Campo>
        <Campo etiqueta="Hasta">
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          />
        </Campo>
        <Campo etiqueta="Estado">
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
          >
            {FILTROS_ESTADO.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        {puntos.length > 1 && (
          <Campo etiqueta="Punto">
            <select
              value={punto}
              onChange={(e) => setPunto(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
            >
              <option value="todos">Todos</option>
              {puntos.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {turnos.length > 1 && (
          <Campo etiqueta="Turno">
            <select
              value={turno}
              onChange={(e) => setTurno(e.target.value)}
              className="max-w-[220px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 focus:outline-none"
            >
              <option value="todos">Todos</option>
              {turnos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      {/* Contenido */}
      {cargando ? (
        <div className="space-y-3 p-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      ) : error ? (
        <div className="m-6 rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : porColaborador.length === 0 ? (
        <p className="px-8 py-16 text-center text-sm text-gray-400">
          No hay jornadas que coincidan con los filtros.
        </p>
      ) : (
        <div className="divide-y divide-gray-100">
          {porColaborador.map((persona) => {
            const colapsado = colapsadas.has(persona.documento);
            return (
              <section key={persona.documento}>
                {/* Cabecera del colaborador */}
                <button
                  type="button"
                  onClick={() => alternar(colapsadas, persona.documento, setColapsadas)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left transition-colors hover:bg-gray-50 sm:px-8"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <svg
                      className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${colapsado ? "" : "rotate-90"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{persona.nombre}</p>
                      <p className="truncate text-xs text-gray-500">
                        C.C. {persona.documento} · {persona.turno || "Sin turno"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">
                      {persona.jornadas.length}{" "}
                      {persona.jornadas.length === 1 ? "jornada" : "jornadas"}
                    </span>
                    <span className="rounded-full bg-gray-800 px-2.5 py-1 font-medium text-white">
                      {formatearMinutos(persona.minutos)}
                    </span>
                    {persona.sinJustificar > 0 ? (
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700">
                        {persona.sinJustificar} por gestionar
                      </span>
                    ) : persona.incidencias > 0 ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                        {persona.incidencias} justificada
                        {persona.incidencias === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>
                </button>

                {/* Jornadas del colaborador */}
                {!colapsado && (
                  <div className="overflow-x-auto pb-2">
                    <table className="w-full min-w-[760px] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                          <th className="py-2 pl-14 pr-3 font-medium">Día</th>
                          <th className="px-3 py-2 font-medium">Entrada</th>
                          <th className="px-3 py-2 font-medium">Salida</th>
                          <th className="px-3 py-2 font-medium">Trabajado</th>
                          <th className="px-3 py-2 font-medium">Punto</th>
                          <th className="px-3 py-2 font-medium">Estado</th>
                          <th className="px-6 py-2 font-medium sm:px-8">Observación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {persona.jornadas.map((jornada) => {
                          const abierta = abiertas.has(jornada.clave);
                          const estilo = ESTILO_ESTADO[jornada.estado] ?? ESTILO_ESTADO[EVENTOS.INVALIDO];
                          return (
                            <Fragment key={jornada.clave}>
                              <tr
                                onClick={() => alternar(abiertas, jornada.clave, setAbiertas)}
                                className="cursor-pointer border-t border-gray-50 hover:bg-gray-50/70"
                              >
                                <td className="py-2.5 pl-14 pr-3 whitespace-nowrap text-gray-700 capitalize">
                                  {fechaCorta(jornada.fecha)}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-gray-600">
                                  {horaCorta(jornada.entrada)}
                                </td>
                                <td className="px-3 py-2.5 tabular-nums text-gray-600">
                                  {horaCorta(jornada.salida)}
                                </td>
                                <td className="px-3 py-2.5 font-medium tabular-nums text-gray-800">
                                  {formatearMinutos(jornada.minutosTrabajados)}
                                </td>
                                <td className="px-3 py-2.5 text-xs text-gray-500">{jornada.punto}</td>
                                <td className="px-3 py-2.5">
                                  <span
                                    className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${estilo.fondo} ${estilo.texto}`}
                                  >
                                    {estilo.etiqueta}
                                  </span>
                                </td>
                                <td className="px-6 py-2.5 text-xs sm:px-8">
                                  {jornada.justificacion ? (
                                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                                      {jornada.justificacion.tipo === "vacaciones"
                                        ? "Vacaciones aprobadas"
                                        : `Permiso: ${jornada.justificacion.detalle}`}
                                    </span>
                                  ) : esIncidencia(jornada) ? (
                                    <span className="text-rose-600">Sin justificar</span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                              </tr>

                              {/* Marcaciones crudas del día */}
                              {abierta && (
                                <tr className="bg-gray-50/60">
                                  <td colSpan={7} className="px-6 py-3 sm:px-8">
                                    <p className="mb-2 pl-8 text-xs font-medium text-gray-500">
                                      Marcaciones registradas ({jornada.marcaciones.length})
                                    </p>
                                    <ul className="space-y-1 pl-8">
                                      {jornada.marcaciones.map((m) => (
                                        <li key={m.id} className="text-xs text-gray-600">
                                          <span className="inline-block w-20 tabular-nums font-medium text-gray-800">
                                            {m.hora}
                                          </span>
                                          <span className="inline-block w-24">{m.evento}</span>
                                          <span className="text-gray-500">
                                            {m.punto} · {m.turno}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500">{etiqueta}</label>
      {children}
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  tono,
  pista,
}: {
  etiqueta: string;
  valor: number | string;
  tono: "slate" | "emerald" | "rose";
  pista?: string;
}) {
  const tonos = {
    slate: "bg-slate-50 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-800",
    rose: "bg-rose-50 text-rose-800",
  };
  return (
    <div className={`rounded-xl px-4 py-3 ${tonos[tono]}`} title={pista}>
      <dt className="text-xs opacity-70">{etiqueta}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</dd>
    </div>
  );
}
