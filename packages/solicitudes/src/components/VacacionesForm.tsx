"use client";

import { useState, useEffect, FormEvent } from "react";
import { VoiceNoteButton } from "./VoiceNoteButton";
import { FirmaSection } from "./FirmaSection";
import { CalendarioPermiso } from "./CalendarioPermiso";
import { SelectorFecha } from "./SelectorFecha";
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

const COLOR = MODULOS.vacaciones.color;
const CLS = inputCls("vacaciones");

export function VacacionesForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  // El calendario en modo rango devuelve todos los días del período, no solo los extremos.
  const [fechas, setFechas] = useState<string[]>([]);
  const [fechaReintegro, setFechaReintegro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [firmaBlob, setFirmaBlob] = useState<Blob | null>(null);
  const [firmaConfirmada, setFirmaConfirmada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${apiBasePath}/api/me`).then((r) => r.json()).then(setMe);
  }, [apiBasePath]);

  const fechaInicio = fechas[0] ?? "";
  const fechaFin = fechas[fechas.length - 1] ?? "";
  const dias = fechas.length;

  function resetForm() {
    setSuccess(false);
    setFechas([]);
    setFechaReintegro("");
    setMotivo("");
    setFirmaBlob(null);
    setFirmaConfirmada(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (dias === 0) { setError("Selecciona en el calendario los días de vacaciones."); return; }

    if (!firmaConfirmada || !firmaBlob) {
      setError("Debes firmar la solicitud antes de enviar.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      // Convertir blob a base64
      const reader = new FileReader();
      const firmaBase64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // Extraer solo el base64 sin el prefijo
        };
        reader.onerror = reject;
        reader.readAsDataURL(firmaBlob);
      });

      const res = await fetch(`${apiBasePath}/api/solicitudes/vacaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaInicio,
          fechaFin,
          fechaReintegro: fechaReintegro || undefined,
          dias,
          motivo,
          cargo: me?.cargo,
          firmaBase64
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
        titulo="Solicitud enviada"
        mensaje="Tu solicitud de vacaciones fue registrada. RRHH la revisará y te notificará."
        onReset={resetForm}
        resetLabel="Nueva solicitud"
        basePath={basePath}
      />
    );

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <FormHeader
        modulo="vacaciones"
        titulo="Solicitud de Vacaciones"
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
            <DatosEmpleado me={me} color={COLOR} />
          </div>

          {/* ── 2. Período ───────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
            <SectionTitle color={COLOR} paso={2}>
              Período de vacaciones
            </SectionTitle>

            <Field label="Días de vacaciones *" hint="selecciona el primer y último día">
              <CalendarioPermiso
                modo="rango"
                color={COLOR}
                fechasSeleccionadas={fechas}
                onChange={setFechas}
                excluirDomingos
                excluirFestivos
              />
            </Field>

            <Field label="Fecha de reintegro" hint="opcional">
              <SelectorFecha
                valor={fechaReintegro}
                onChange={setFechaReintegro}
                placeholder="Elegir el día de reintegro"
                ariaLabel="Fecha de reintegro"
                color={COLOR}
                // No se puede volver antes de terminar las vacaciones.
                minimo={fechaFin}
              />
            </Field>

            <Field label="Motivo o comentario" hint="opcional">
              <div className="flex flex-col gap-2.5">
                <VoiceNoteButton
                  onTranscript={(transcript) => {
                    setMotivo((prev) => (prev ? `${prev} ${transcript}` : transcript));
                  }}
                  disabled={loading}
                  color={COLOR}
                />
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Agrega contexto si lo consideras necesario."
                  className={CLS + " resize-none"}
                />
              </div>
            </Field>
          </div>

          {/* ── 3. Firma ─────────────────────────────────────────────────── */}
          <FirmaSection
            color={COLOR}
            paso={3}
            firmaConfirmada={firmaConfirmada}
            onFirmar={(blob) => {
              setFirmaBlob(blob);
              setFirmaConfirmada(true);
            }}
            onLimpiar={() => {
              setFirmaBlob(null);
              setFirmaConfirmada(false);
            }}
          />

          <ErrorMsg>{error}</ErrorMsg>

          <SubmitButton
            color={COLOR}
            loading={loading}
            disabled={loading || !me || !firmaConfirmada}
          >
            {loading ? "Enviando..." : "Enviar solicitud"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
