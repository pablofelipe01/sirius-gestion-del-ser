"use client";

import { useEffect, useState } from "react";

type DiasSirianosData = {
  saldo_disponible: number;
  saldo_usado: number;
  periodo: string;
  fecha_ultimo_uso: string | null;
};

export function DiasSirianosWidget() {
  const [data, setData] = useState<DiasSirianosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dias-sirianos/saldo")
      .then((res) => {
        if (!res.ok) throw new Error("Error al cargar días sirianos");
        return res.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[DiasSirianosWidget]", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="glass animate-pulse rounded-2xl p-5">
        <div className="mb-3 h-4 w-32 rounded bg-white/10"></div>
        <div className="h-8 w-full rounded bg-white/10"></div>
      </div>
    );
  }

  if (error) {
    return null; // No mostrar si hay error (no bloquear dashboard)
  }

  if (!data) {
    return null;
  }

  const { saldo_disponible, saldo_usado, fecha_ultimo_uso, periodo } = data;

  let mensaje: string;
  /** Un solo color por estado: tiñe el halo, el icono y el contador. */
  let acento: string;

  if (saldo_disponible === 2) {
    mensaje = "Tienes 2 días sirianos disponibles";
    acento = "#22c55e";
  } else if (saldo_disponible === 1) {
    mensaje = "Te queda 1 día siriano disponible";
    acento = "#eab308";
  } else {
    mensaje = "Ya usaste tus días sirianos. Cualquier permiso adicional debe negociarse con tu jefe.";
    acento = "#ef4444";
  }

  const total = saldo_disponible + saldo_usado;

  return (
    <div className="glass relative flex items-start gap-4 overflow-hidden rounded-2xl p-5">
      {/* Halo del estado — el saldo se lee de un vistazo antes que el texto */}
      <span
        className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full opacity-30 blur-3xl"
        style={{ background: acento }}
      />

      <div
        className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-white/10"
        style={{ backgroundColor: `${acento}26` }}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke={acento} strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      </div>

      <div className="relative flex-1">
        <h3 className="text-sm font-semibold text-white/90">Días Sirianos {periodo}</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/80">{mensaje}</p>
        {fecha_ultimo_uso && (
          <p className="mt-2 text-xs text-white/60">
            Último usado: {new Date(fecha_ultimo_uso).toLocaleDateString("es-CO")}
          </p>
        )}
      </div>

      {/* Marcador de saldo: un punto por día, los usados apagados */}
      {total > 0 && (
        <div className="relative flex flex-shrink-0 items-center gap-1.5 self-center">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className="h-2 w-2 rounded-full"
              style={
                i < saldo_disponible
                  ? { background: acento, boxShadow: `0 0 8px ${acento}` }
                  : { background: "rgba(255,255,255,0.15)" }
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
