"use client";

import { useState, useEffect, FormEvent } from "react";
import { TIPOS_NOVEDAD, TIPO_HORAS_EXTRA, TIPO_NOVEDAD_OTRA } from "../lib/constants";
import { VoiceNoteButton } from "./VoiceNoteButton";
import {
  DatosEmpleado,
  ErrorMsg,
  Field,
  FormHeader,
  MODULOS,
  SectionTitle,
  SubmitButton,
  SuccessCard,
  inputCls,
} from "./ui";

interface Props {
  apiBasePath?: string;
  basePath?: string;
}

type Me = { nombre: string; cedula: string; idCore: string; cargo: string };

const COLOR = MODULOS.novedades.color;
const CLS = inputCls("novedades");

export function NovedadesForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [tipo, setTipo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [horasExtra, setHorasExtra] = useState("");
  const [otraTipo, setOtraTipo] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBasePath}/api/me`).then((r) => r.json()).then(setMe);
  }, [apiBasePath]);

  function resetForm() {
    setSuccess(false);
    setTipo("");
    setDescripcion("");
    setHorasExtra("");
    setOtraTipo("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !descripcion) { setError("Selecciona el tipo y agrega una descripción."); return; }
    if (tipo === TIPO_NOVEDAD_OTRA && !otraTipo) { setError("Especifica el tipo de novedad."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${apiBasePath}/api/solicitudes/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          descripcion,
          horasExtra: tipo === TIPO_HORAS_EXTRA ? horasExtra : undefined,
          otraTipo: tipo === TIPO_NOVEDAD_OTRA ? otraTipo : undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error); return; }
      setSuccess(true);
    } catch { setError("Error de conexión. Intenta de nuevo."); }
    finally { setLoading(false); }
  }

  if (success)
    return (
      <SuccessCard
        color={COLOR}
        titulo="Novedad reportada"
        mensaje="Tu novedad fue registrada. El área de nómina la revisará."
        onReset={resetForm}
        resetLabel="Reportar otra"
        basePath={basePath}
      />
    );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <FormHeader
        modulo="novedades"
        titulo="Reportar Novedad de Nómina"
        subtitulo="Los campos con * son obligatorios"
        backHref={basePath}
      />

      <form
        onSubmit={handleSubmit}
        className="glass-solid anim-entrada overflow-hidden rounded-2xl"
      >
        <div className="h-1" style={{ background: COLOR }} />

        <div className="flex flex-col gap-6 p-5 sm:p-6">
          {/* ── 1. Datos del solicitante ─────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <SectionTitle color={COLOR} paso={1}>
              Tus datos
            </SectionTitle>
            <DatosEmpleado me={me} color={COLOR} compacto />
          </div>

          {/* ── 2. Detalle de la novedad ─────────────────────────────────── */}
          <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
            <SectionTitle color={COLOR} paso={2}>
              Detalle de la novedad
            </SectionTitle>

            <Field label="Tipo de novedad *">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                required
                className={CLS}
              >
                <option value="">Selecciona un tipo...</option>
                {TIPOS_NOVEDAD.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            {tipo === TIPO_HORAS_EXTRA && (
              <Field label="Número de horas extra *">
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={horasExtra}
                  onChange={(e) => setHorasExtra(e.target.value)}
                  required
                  placeholder="Ej: 2.5"
                  className={CLS}
                />
              </Field>
            )}

            {tipo === TIPO_NOVEDAD_OTRA && (
              <Field label="Especifica el tipo de novedad *">
                <input
                  type="text"
                  value={otraTipo}
                  onChange={(e) => setOtraTipo(e.target.value)}
                  required
                  placeholder="Ej: Cambio de EPS..."
                  className={CLS}
                />
              </Field>
            )}

            <Field label="Descripción *">
              <div className="flex flex-col gap-2.5">
                <VoiceNoteButton
                  onTranscript={(transcript) => {
                    setDescripcion((prev) => (prev ? `${prev} ${transcript}` : transcript));
                  }}
                  disabled={loading}
                  color={COLOR}
                />
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  required
                  rows={4}
                  placeholder="Describe con detalle la novedad que deseas reportar..."
                  className={CLS + " resize-none"}
                />
              </div>
            </Field>
          </div>

          <ErrorMsg>{error}</ErrorMsg>

          <SubmitButton color={COLOR} loading={loading} disabled={loading || !me}>
            {loading ? "Enviando..." : "Reportar novedad"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
