"use client";

import { useState, useEffect, FormEvent } from "react";
import { TIPOS_PERMISO, TIPO_DIA_PACTO, TIPO_PERMISO_OTRO } from "../lib/constants";
import { CalendarioPermiso } from "./CalendarioPermiso";
import { SelectorFecha } from "./SelectorFecha";
import { FirmaSection } from "./FirmaSection";
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
type DiasPactoData = { saldo_disponible: number };

const COLOR = MODULOS.permiso.color;
const CLS = inputCls("permiso");

export function PermisoForm({ apiBasePath = "", basePath = "/dashboard/solicitudes" }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [diasPacto, setDiasPacto] = useState<DiasPactoData | null>(null);
  const [tipo, setTipo] = useState("");
  const [tipoOtro, setTipoOtro] = useState("");
  const [modalidad, setModalidad] = useState<"dias" | "horas">("dias");
  const [fechasSeleccionadas, setFechasSeleccionadas] = useState<string[]>([]);
  const [horas, setHoras] = useState("");
  const [motivo, setMotivo] = useState("");
  const [firmaBlob, setFirmaBlob] = useState<Blob | null>(null);
  const [firmaConfirmada, setFirmaConfirmada] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const esDiaPacto = tipo === TIPO_DIA_PACTO;
  const esOtro = tipo === TIPO_PERMISO_OTRO;

  useEffect(() => {
    fetch(`${apiBasePath}/api/me`)
      .then((r) => r.json())
      .then(setMe)
      .catch((err) => console.error("[PermisoForm] Error fetching /api/me:", err));
  }, [apiBasePath]);

  useEffect(() => {
    if (esDiaPacto) {
      fetch(`${apiBasePath}/api/dias-pacto/saldo`)
        .then((r) => r.json())
        .then(setDiasPacto)
        .catch((err) => console.error("[PermisoForm] Error fetching dias-pacto:", err));
    }
  }, [esDiaPacto, apiBasePath]);

  function resetForm() {
    setSuccess(false);
    setTipo("");
    setTipoOtro("");
    setModalidad("dias");
    setFechasSeleccionadas([]);
    setHoras("");
    setMotivo("");
    setFirmaBlob(null);
    setFirmaConfirmada(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tipo || !motivo) {
      setError("Completa los campos obligatorios.");
      return;
    }

    if (esOtro && !tipoOtro.trim()) {
      setError("Especifica qué tipo de permiso necesitas.");
      return;
    }

    if (!firmaConfirmada || !firmaBlob) {
      setError("Debes firmar la solicitud antes de enviar.");
      return;
    }

    if (modalidad === "dias" && fechasSeleccionadas.length === 0) {
      setError("Debes seleccionar al menos un día de permiso.");
      return;
    }

    // Con el calendario ya no hay un `required` del navegador que lo cubra: sin
    // esta comprobación el permiso saldría sin fecha de inicio.
    if (modalidad === "horas" && fechasSeleccionadas.length === 0) {
      setError("Debes seleccionar la fecha del permiso.");
      return;
    }

    if (modalidad === "horas" && !horas) {
      setError("Debes especificar las horas de permiso.");
      return;
    }

    if (modalidad === "horas" && Number(horas) > 4) {
      setError("Las horas de permiso no pueden ser mayores a 4.");
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
          resolve(result.split(",")[1]); // Extraer solo el base64 sin el prefijo data:image/png;base64,
        };
        reader.onerror = reject;
        reader.readAsDataURL(firmaBlob);
      });

      const body: Record<string, unknown> = {
        // "Otro" viaja como "Otro: <especificación>" — Tipo_Permiso es texto libre
        // en Airtable, así que el detalle queda visible en la tabla y en el PDF.
        tipo: esOtro ? `${TIPO_PERMISO_OTRO}: ${tipoOtro.trim()}` : tipo,
        motivo,
        cargo: me?.cargo || "",
        firmaBase64,
      };

      if (modalidad === "dias") {
        body.fechaInicio = fechasSeleccionadas[0];
        if (fechasSeleccionadas.length > 1) {
          body.fechaFin = fechasSeleccionadas[fechasSeleccionadas.length - 1];
        }
        // Días de pacto: se envían todas las fechas elegidas para descontar
        // el saldo real (antes solo se descontaba 1 día sin importar cuántos).
        if (esDiaPacto) {
          body.fechasPacto = fechasSeleccionadas;
        }
      } else {
        body.fechaInicio = fechasSeleccionadas[0];
        body.horas = horas;
      }

      const res = await fetch(`${apiBasePath}/api/solicitudes/permiso`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error);
        return;
      }

      setSuccess(true);

      if (esDiaPacto) {
        setTimeout(() => (window.location.href = basePath), 1500);
      }
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (success)
    return (
      <SuccessCard
        color={COLOR}
        titulo={esDiaPacto ? "Día de pacto autorizado" : "Solicitud enviada"}
        mensaje={
          esDiaPacto
            ? "Tu día de pacto quedó autorizado automáticamente y su comprobante en PDF fue archivado. No requiere aprobación de tu jefe."
            : "Tu solicitud de permiso fue registrada exitosamente. RRHH la revisará pronto."
        }
        onReset={resetForm}
        resetLabel="Nueva solicitud"
        basePath={basePath}
      />
    );

  const sinSaldo = esDiaPacto && diasPacto !== null && diasPacto.saldo_disponible === 0;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <FormHeader
        modulo="permiso"
        titulo="Solicitud de Permiso"
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

          {/* ── 2. Detalle del permiso ───────────────────────────────────── */}
          <div className="flex flex-col gap-4 border-t border-white/10 pt-5">
            <SectionTitle color={COLOR} paso={2}>
              Detalle del permiso
            </SectionTitle>

            <Field label="Tipo de permiso *">
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                required
                className={CLS}
              >
                <option value="">Selecciona un tipo...</option>
                {TIPOS_PERMISO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            {/* "Otro": el tipo se especifica en texto libre */}
            {esOtro && (
              <Field label="Especifica el tipo de permiso *">
                <input
                  type="text"
                  value={tipoOtro}
                  onChange={(e) => setTipoOtro(e.target.value)}
                  required
                  maxLength={80}
                  placeholder="Ej: Diligencia bancaria, mudanza, grado de un familiar..."
                  className={CLS}
                />
              </Field>
            )}

            {/* Día de Pacto: calendario de un solo día — una solicitud por día */}
            {esDiaPacto && diasPacto && (
              <Field
                label="Selecciona el día de pacto *"
                hint="un día por solicitud"
              >
                <CalendarioPermiso
                  fechasSeleccionadas={fechasSeleccionadas}
                  onChange={(fechas) => {
                    if (fechas.length <= 1) {
                      setFechasSeleccionadas(fechas);
                    }
                  }}
                  maxDias={1}
                  excluirFestivos
                />
              </Field>
            )}

            {/* Otros permisos: selector de modalidad */}
            {tipo && !esDiaPacto && (
              <Field label="Modalidad del permiso *">
                <div className="grid grid-cols-2 gap-2.5">
                  {(
                    [
                      { v: "dias", label: "Por días", desc: "Uno o varios días" },
                      { v: "horas", label: "Por horas", desc: "Máximo 4 horas" },
                    ] as const
                  ).map((o) => {
                    const activo = modalidad === o.v;
                    return (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setModalidad(o.v)}
                        aria-pressed={activo}
                        className="rounded-xl border px-4 py-3 text-left transition-all hover:-translate-y-0.5"
                        style={{
                          borderColor: activo ? COLOR : "rgba(255,255,255,0.12)",
                          background: activo ? `${COLOR}2e` : "rgba(255,255,255,0.05)",
                          boxShadow: activo ? `0 0 0 1px ${COLOR}, 0 14px 30px -20px ${COLOR}` : undefined,
                        }}
                      >
                        <p
                          className="text-sm font-medium"
                          style={{ color: activo ? "#fff" : "rgba(255,255,255,0.75)" }}
                        >
                          {o.label}
                        </p>
                        <p className="mt-0.5 text-xs text-white/45">{o.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}

            {/* Calendario para permisos por días (NO día de pacto) */}
            {tipo && !esDiaPacto && modalidad === "dias" && (
              <Field label="Selecciona los días de permiso *">
                <CalendarioPermiso
                  fechasSeleccionadas={fechasSeleccionadas}
                  onChange={setFechasSeleccionadas}
                  excluirFestivos
                />
              </Field>
            )}

            {/* Permiso por horas */}
            {tipo && !esDiaPacto && modalidad === "horas" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Fecha del permiso *">
                  <SelectorFecha
                    valor={fechasSeleccionadas[0] || ""}
                    onChange={(fecha) => setFechasSeleccionadas(fecha ? [fecha] : [])}
                    placeholder="Elegir el día"
                    ariaLabel="Fecha del permiso"
                    color={COLOR}
                    excluirFestivos
                  />
                </Field>
                <Field label="Horas de permiso *" hint="máx. 4">
                  <input
                    type="number"
                    min="0.5"
                    max="4"
                    step="0.5"
                    value={horas}
                    onChange={(e) => setHoras(e.target.value)}
                    placeholder="Ej: 2"
                    required={modalidad === "horas"}
                    className={CLS}
                  />
                </Field>
              </div>
            )}

            <Field label="Motivo *">
              <div className="flex flex-col gap-2.5">
                <VoiceNoteButton
                  onTranscript={(transcript) => {
                    // Agregar transcripción al final del texto actual
                    setMotivo((prev) => (prev ? `${prev} ${transcript}` : transcript));
                  }}
                  disabled={loading}
                  color={COLOR}
                />
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  required
                  rows={3}
                  placeholder="Describe brevemente el motivo del permiso..."
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
            disabled={loading || !me || sinSaldo || !firmaConfirmada}
          >
            {loading ? "Enviando..." : sinSaldo ? "Sin días de pacto disponibles" : "Enviar solicitud"}
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
