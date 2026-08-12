"use client";

import { useState } from "react";
import {
  FirmaCanvas,
  PlanCompensacion,
  SelectorFecha,
  DATOS_PLAN_VACIOS,
  type DatosPlan,
} from "@sirius/solicitudes";
import { FIELDS } from "@/lib/airtable-schema";
import {
  PLAN_RETO,
  PLAN_SABADO,
  diasEntre,
  esSabado,
  generarDiasCompensacion,
  horasAReponer,
  type DiaCompensacion,
} from "@/lib/compensacion";

/** Valores tal como los devuelve la API de Airtable. */
export type CampoAirtable = string | number | boolean | string[] | undefined | null;

interface Solicitud {
  id: string;
  fields: Record<string, CampoAirtable>;
}

interface Props {
  /**
   * Solo permisos y vacaciones: las novedades de nómina son un registro
   * informativo, no un trámite que se apruebe o rechace.
   */
  tipo: "permiso" | "vacaciones";
  solicitud: Solicitud;
  onClose: () => void;
  onSuccess: () => void;
}

const TITULOS = {
  permiso: "Permiso",
  vacaciones: "Vacaciones",
} as const;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Convierte fechas de Airtable a formato colombiano legible: "31 jul 2026". */
function fmtFecha(valor: CampoAirtable): string {
  if (!valor || typeof valor !== "string") return "—";

  // Los campos `date` de Airtable llegan como "YYYY-MM-DD": new Date() los
  // interpretaría como medianoche UTC y en Colombia (-5) restaría un día.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const d = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor);

  if (isNaN(d.getTime())) return valor;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

/** Campo de fecha de Airtable a ISO "YYYY-MM-DD" — los dateTime traen la hora. */
function iso(valor: CampoAirtable): string {
  return typeof valor === "string" ? valor.slice(0, 10) : "";
}

function txt(valor: CampoAirtable): string {
  if (valor === undefined || valor === null || valor === "") return "—";
  return String(valor);
}

export function ModalAutorizarSolicitud({ tipo, solicitud, onClose, onSuccess }: Props) {
  const [accion, setAccion] = useState<"aprobar" | "rechazar" | null>(null);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const f = solicitud.fields;

  // Horas que el trabajador debe reponer si el permiso se declara compensatorio:
  // las del permiso por horas, o una jornada completa por cada día pedido.
  const horasTotal = horasAReponer(
    f[FIELDS.PERMISO.HORAS],
    diasEntre(iso(f[FIELDS.PERMISO.FECHA_INICIO]), iso(f[FIELDS.PERMISO.FECHA_FIN]))
  );

  // Estados específicos para permisos
  const [remunerado, setRemunerado] = useState(Boolean(f[FIELDS.PERMISO.REMUNERADO]));
  const [compensado, setCompensado] = useState(Boolean(f[FIELDS.PERMISO.COMPENSADO]));
  // El plan es opcional: si se deja sin elegir, el colaborador escoge cómo repone
  // desde su lista de solicitudes.
  const [plan, setPlan] = useState("");
  const [datosPlan, setDatosPlan] = useState<DatosPlan>(DATOS_PLAN_VACIOS);
  const [diasCompensacion, setDiasCompensacion] = useState<DiaCompensacion[]>([
    { fecha: "", horas: 0, descripcion: "" },
  ]);

  // Firma digital
  const [firmaBlob, setFirmaBlob] = useState<Blob | null>(null);

  /**
   * El plan es el que arma la agenda: al elegirlo (o cambiar sus fechas) se
   * regeneran los días. Quedan editables debajo para ajustes puntuales.
   */
  function cambiarPlan(nuevo: string) {
    setPlan(nuevo);
    setDiasCompensacion(regenerar(nuevo, datosPlan));
  }

  function cambiarDatosPlan(nuevos: DatosPlan) {
    setDatosPlan(nuevos);
    setDiasCompensacion(regenerar(plan, nuevos));
  }

  function regenerar(planId: string, datos: DatosPlan): DiaCompensacion[] {
    const dias = generarDiasCompensacion(planId, {
      horasTotal,
      fechas: datos.fechas,
      desde: datos.desde,
      fechaLimite: datos.fechaLimite,
      reto: datos.reto,
    });
    return dias.length > 0 ? dias : [{ fecha: "", horas: 0, descripcion: "" }];
  }

  function agregarDiaCompensacion() {
    setDiasCompensacion([...diasCompensacion, { fecha: "", horas: 0, descripcion: "" }]);
  }

  function eliminarDiaCompensacion(index: number) {
    setDiasCompensacion(diasCompensacion.filter((_, i) => i !== index));
  }

  function actualizarDiaCompensacion(
    index: number,
    campo: keyof DiaCompensacion,
    valor: string | number
  ) {
    const nuevos = [...diasCompensacion];
    nuevos[index] = { ...nuevos[index], [campo]: valor };
    setDiasCompensacion(nuevos);
  }

  async function handleSubmit() {
    if (!accion) {
      setError("Debe seleccionar aprobar o rechazar");
      return;
    }

    if (accion === "rechazar" && !comentario.trim()) {
      setError("El comentario es obligatorio al rechazar una solicitud");
      return;
    }

    if (!firmaBlob) {
      setError("Debe confirmar su firma antes de enviar");
      return;
    }

    // Validar campos específicos de permiso. El plan es opcional: sin plan el
    // permiso queda marcado como compensatorio y el colaborador elige después.
    if (tipo === "permiso" && accion === "aprobar" && compensado && plan) {
      if (plan === PLAN_SABADO && datosPlan.fechas.some((d) => d && !esSabado(d))) {
        setError("Las fechas del plan de sábado deben caer en sábado");
        return;
      }
      if (plan === PLAN_RETO && !datosPlan.reto.trim()) {
        setError("Describa en qué consiste el reto");
        return;
      }
      const diasValidos = diasCompensacion.filter((d) => d.fecha && d.horas > 0);
      if (diasValidos.length === 0) {
        setError("Complete las fechas del plan de reposición");
        return;
      }
    }

    try {
      setLoading(true);
      setError(null);

      // Convertir firma a base64
      const firmaBase64 = await blobToBase64(firmaBlob);

      // Preparar body
      const body: Record<string, unknown> = {
        tabla: tipo,
        recordId: solicitud.id,
        accion,
        comentario: comentario.trim() || undefined,
        firmaBase64,
      };

      // Agregar campos específicos de permiso
      if (tipo === "permiso" && accion === "aprobar") {
        body.remunerado = remunerado;
        body.compensado = compensado;

        if (compensado && plan) {
          body.planCompensacion = plan;
          body.diasCompensacion = diasCompensacion.filter((d) => d.fecha && d.horas > 0);
        }
      }

      const res = await fetch("/api/solicitudes/autorizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al autorizar solicitud");
      }

      // Éxito
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  const nombre = txt(f["Nombre"]);
  const cedula = txt(f["Cedula"] ?? f["Numero Documento"]);
  const cargo = txt(f["Cargo"]);
  const idCore = txt(f["ID Personal Core"]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#040711]/80 p-4 backdrop-blur-md">
      <div className="anim-entrada flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-[#0b1120] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.95)]">
        {/* Header — incluye la identidad del solicitante para no repetirla en una tarjeta aparte */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-black/30 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-white">
              Autorizar {TITULOS[tipo]}
            </h2>
            <p className="mt-1 truncate text-sm text-white/80">
              {nombre} · CC {cedula}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/65">
              {cargo} · {idCore}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            aria-label="Cerrar"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-white/65 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          {/* Detalles de la solicitud + firma del trabajador */}
          <DetallesSolicitud tipo={tipo} fields={f}>
            {Boolean(f["Firma_S3_Key"]) && (
              <div className="mt-4 flex items-center gap-2.5 border-t border-white/10 pt-4">
                <svg
                  className="h-4 w-4 flex-shrink-0 text-emerald-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-sm text-white/80">
                  Firmado por el trabajador
                  {f["Fecha_Firma_Trabajador"] ? ` el ${fmtFecha(f["Fecha_Firma_Trabajador"])}` : ""}
                </p>
                <a
                  href={`/api/documentos/${tipo}/${solicitud.id}/firma-trabajador`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm font-medium text-[#7cc4f5] transition-colors hover:text-white"
                >
                  Ver firma
                </a>
              </div>
            )}
          </DetallesSolicitud>

          {/* Decisión — control persistente: sustituye el panel duplicado con botón "Cambiar" */}
          <div>
            <p className="mb-2 text-sm font-medium text-white/85">Decisión</p>
            <div className="grid grid-cols-2 gap-3">
              <BotonDecision
                activo={accion === "aprobar"}
                onClick={() => setAccion("aprobar")}
                etiqueta="Aprobar"
                tono="emerald"
                icono="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
              <BotonDecision
                activo={accion === "rechazar"}
                onClick={() => setAccion("rechazar")}
                etiqueta="Rechazar"
                tono="rose"
                icono="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </div>
          </div>

          {accion && (
            <>
              {/* Condiciones del permiso */}
              {tipo === "permiso" && accion === "aprobar" && (
                <CamposPermiso
                  remunerado={remunerado}
                  setRemunerado={setRemunerado}
                  compensado={compensado}
                  setCompensado={setCompensado}
                  plan={plan}
                  setPlan={cambiarPlan}
                  datosPlan={datosPlan}
                  setDatosPlan={cambiarDatosPlan}
                  horasTotal={horasTotal}
                  diasCompensacion={diasCompensacion}
                  agregarDia={agregarDiaCompensacion}
                  eliminarDia={eliminarDiaCompensacion}
                  actualizarDia={actualizarDiaCompensacion}
                />
              )}

              {/* Comentario */}
              <div>
                <label
                  htmlFor="comentario-autorizacion"
                  className="mb-2 block text-sm font-medium text-white/85"
                >
                  Comentario{" "}
                  <span className="font-normal text-white/60">
                    {accion === "rechazar" ? "(obligatorio)" : "(opcional)"}
                  </span>
                </label>
                <textarea
                  id="comentario-autorizacion"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder={
                    accion === "rechazar"
                      ? "Explique el motivo del rechazo..."
                      : "Observaciones sobre esta autorización..."
                  }
                  rows={3}
                  className="campo-oscuro w-full resize-none rounded-xl border border-white/12 bg-white/[0.06] px-3.5 py-2.5 text-sm text-white placeholder:text-white/60 focus:border-[#29b6e8]/60 focus:ring-2 focus:ring-[#29b6e8]/25 focus:outline-none"
                />
              </div>

              {/* Firma del autorizador — FirmaCanvas ya trae su propia instrucción */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-white/85">Su firma</label>
                  {firmaBlob && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Firma confirmada
                    </span>
                  )}
                </div>
                <FirmaCanvas
                  onFirmaCapturada={setFirmaBlob}
                  onLimpiar={() => setFirmaBlob(null)}
                  color={accion === "aprobar" ? "#059669" : "#e11d48"}
                />
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/35 bg-rose-500/12 p-3.5">
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-rose-800">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-black/30 px-6 py-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            Cancelar
          </button>

          <button
            onClick={handleSubmit}
            disabled={loading || !accion || !firmaBlob}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/60 disabled:shadow-none disabled:hover:brightness-100 ${
              accion === "rechazar" ? "bg-rose-600" : "bg-emerald-600"
            }`}
          >
            {loading
              ? "Procesando..."
              : accion === "rechazar"
                ? "Rechazar y firmar"
                : "Aprobar y firmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BotonDecision({
  activo,
  onClick,
  etiqueta,
  tono,
  icono,
}: {
  activo: boolean;
  onClick: () => void;
  etiqueta: string;
  tono: "emerald" | "rose";
  icono: string;
}) {
  const activoCls =
    tono === "emerald"
      ? "border-emerald-400 bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400"
      : "border-rose-400 bg-rose-500/20 text-rose-100 ring-1 ring-rose-400";
  const inactivoCls =
    "border-white/12 bg-white/[0.05] text-white/80 hover:border-white/25 hover:bg-white/10 hover:text-white";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
        activo ? activoCls : inactivoCls
      }`}
    >
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icono} />
      </svg>
      {etiqueta}
    </button>
  );
}

/** Fila etiqueta/valor de una ficha de detalles. */
function Dato({ label, valor }: { label: string; valor: CampoAirtable }) {
  return (
    <div>
      <dt className="text-xs text-white/65">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-white/90">{txt(valor)}</dd>
    </div>
  );
}

function Ficha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">{titulo}</h3>
      {children}
    </div>
  );
}

function TextoLargo({ label, valor }: { label: string; valor: CampoAirtable }) {
  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="text-xs text-white/65">{label}</p>
      <p className="mt-1 text-sm whitespace-pre-wrap text-white/85">{txt(valor)}</p>
    </div>
  );
}

function DetallesSolicitud({
  tipo,
  fields,
  children,
}: {
  tipo: string;
  fields: Record<string, CampoAirtable>;
  children?: React.ReactNode;
}) {
  if (tipo === "permiso") {
    return (
      <Ficha titulo="Detalles del Permiso">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <Dato label="Tipo" valor={fields["Tipo_Permiso"]} />
          <Dato label="Desde" valor={fmtFecha(fields["Fecha de permiso"])} />
          {Boolean(fields["Fecha fin de permiso"]) && (
            <Dato label="Hasta" valor={fmtFecha(fields["Fecha fin de permiso"])} />
          )}
          <Dato label="Horas" valor={fields["Horas Permiso"]} />
        </dl>
        {Boolean(fields["Motivo_Permiso"]) && (
          <TextoLargo label="Motivo" valor={fields["Motivo_Permiso"]} />
        )}
        {children}
      </Ficha>
    );
  }

  return (
    <Ficha titulo="Detalles de Vacaciones">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Dato label="Inicio" valor={fmtFecha(fields["Fecha Inicio"])} />
        <Dato label="Fin" valor={fmtFecha(fields["Fecha Fin"])} />
        <Dato label="Reintegro" valor={fmtFecha(fields["Fecha Reintegro"])} />
        <Dato label="Días" valor={fields["Dias Vacaciones"] ?? 0} />
      </dl>
      {Boolean(fields["Motivo"]) && <TextoLargo label="Motivo" valor={fields["Motivo"]} />}
      {children}
    </Ficha>
  );
}

function Toggle({
  checked,
  onChange,
  titulo,
  descripcion,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  descripcion: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
        checked
          ? "border-[#4d8ee8]/50 bg-[#1a51a8]/20"
          : "border-white/12 bg-white/[0.04] hover:bg-white/[0.08]"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="campo-oscuro mt-0.5 h-4 w-4 rounded border-white/25 accent-[#29b6e8] focus:ring-2 focus:ring-[#29b6e8]/40"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-white/90">{titulo}</span>
        <span className="mt-0.5 block text-xs text-white/70">{descripcion}</span>
      </span>
    </label>
  );
}

const inputCls =
  "campo-oscuro w-full rounded-lg border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/60 focus:border-[#29b6e8]/60 focus:ring-2 focus:ring-[#29b6e8]/25 focus:outline-none";

function CamposPermiso({
  remunerado,
  setRemunerado,
  compensado,
  setCompensado,
  plan,
  setPlan,
  datosPlan,
  setDatosPlan,
  horasTotal,
  diasCompensacion,
  agregarDia,
  eliminarDia,
  actualizarDia,
}: {
  remunerado: boolean;
  setRemunerado: (v: boolean) => void;
  compensado: boolean;
  setCompensado: (v: boolean) => void;
  plan: string;
  setPlan: (v: string) => void;
  datosPlan: DatosPlan;
  setDatosPlan: (v: DatosPlan) => void;
  horasTotal: number;
  diasCompensacion: DiaCompensacion[];
  agregarDia: () => void;
  eliminarDia: (i: number) => void;
  actualizarDia: (i: number, c: keyof DiaCompensacion, v: string | number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          checked={remunerado}
          onChange={setRemunerado}
          titulo="Remunerado"
          descripcion="El tiempo será pagado normalmente"
        />
        <Toggle
          checked={compensado}
          onChange={setCompensado}
          titulo="Compensatorio"
          descripcion="El trabajador compensará el tiempo"
        />
      </div>

      {compensado && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <h4 className="text-sm font-semibold text-white">
            ¿Cómo repone las {horasTotal} h?{" "}
            <span className="font-normal text-white/60">(opcional)</span>
          </h4>
          <p className="mt-1 mb-3 text-xs text-white/70">
            Si no elige un plan, el colaborador escogerá cómo repone desde su lista de
            solicitudes y quedará avisado allí.
          </p>
          <PlanCompensacion
            plan={plan}
            onPlanChange={setPlan}
            datos={datosPlan}
            onDatosChange={setDatosPlan}
            horasTotal={horasTotal}
          />

          {/* La agenda concreta solo tiene sentido con un plan elegido */}
          {plan && (
            <>
              <div className="mt-4 mb-3 flex items-center justify-between border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white">Días de compensación</h4>
                <button
                  type="button"
                  onClick={agregarDia}
                  className="rounded-lg px-2 py-1 text-sm font-medium text-[#7cc4f5] transition-colors hover:bg-white/10 hover:text-white"
                >
                  + Agregar día
                </button>
              </div>

              <div className="space-y-3">
                {diasCompensacion.map((dia, index) => (
              <div key={index} className="rounded-lg border border-white/[0.08] bg-black/25 p-3">
                <div className="flex items-end gap-3">
                  <div className="w-48">
                    <label className="mb-1 block text-xs text-white/70">Fecha</label>
                    {/* Un día ajustado a mano puede caer en cualquier fecha: aquí
                        el calendario no restringe días de la semana. */}
                    <SelectorFecha
                      valor={dia.fecha}
                      onChange={(fecha) => actualizarDia(index, "fecha", fecha)}
                      ariaLabel={`Fecha del día de compensación ${index + 1}`}
                      permitirPasado
                    />
                  </div>
                  <div className="w-24">
                    <label className="mb-1 block text-xs text-white/70">Horas</label>
                    <input
                      type="number"
                      value={dia.horas || ""}
                      onChange={(e) => actualizarDia(index, "horas", parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.5"
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                  {diasCompensacion.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarDia(index)}
                      aria-label="Eliminar día"
                      className="ml-auto rounded-lg p-2 text-white/65 transition-colors hover:bg-rose-500/15 hover:text-rose-300"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs text-white/70">Descripción</label>
                  <input
                    type="text"
                    value={dia.descripcion}
                    onChange={(e) => actualizarDia(index, "descripcion", e.target.value)}
                    placeholder="Ej: Trabajará sábado en turno extra"
                    className={inputCls}
                  />
                </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
