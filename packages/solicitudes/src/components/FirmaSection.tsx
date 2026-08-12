"use client";

import { FirmaCanvas } from "./FirmaCanvas";
import { Icon, ICON_CHECK_CIRCLE, SectionTitle } from "./ui";

interface Props {
  color: string;
  paso?: number;
  firmaConfirmada: boolean;
  onFirmar: (blob: Blob) => void;
  onLimpiar: () => void;
}

/**
 * Sección de firma del trabajador — obligatoria en solicitudes formales.
 * Muestra el canvas hasta que la firma se confirma; luego un estado de éxito.
 */
export function FirmaSection({ color, paso, firmaConfirmada, onFirmar, onLimpiar }: Props) {
  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-5">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle color={color} paso={paso}>
          Firma del trabajador *
        </SectionTitle>
        {firmaConfirmada && (
          <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-[11px] font-medium text-green-300 ring-1 ring-inset ring-green-400/30">
            <Icon path={ICON_CHECK_CIRCLE} className="h-3.5 w-3.5" strokeWidth={2} />
            Firmado
          </span>
        )}
      </div>

      {!firmaConfirmada ? (
        <>
          <p className="text-xs text-white/70">
            Dibuja tu firma en el recuadro. Es obligatoria para enviar la solicitud.
          </p>
          <FirmaCanvas onFirmaCapturada={onFirmar} onLimpiar={onLimpiar} color={color} />
        </>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-green-400/30 bg-green-500/12 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Icon
              path={ICON_CHECK_CIRCLE}
              className="h-5 w-5 flex-shrink-0 text-green-400"
              strokeWidth={2}
            />
            <p className="text-sm font-medium text-green-200">Firma capturada correctamente</p>
          </div>
          <button
            type="button"
            onClick={onLimpiar}
            className="text-xs font-medium text-green-300 underline decoration-green-400/50 underline-offset-2 transition-colors hover:text-green-100"
          >
            Volver a firmar
          </button>
        </div>
      )}
    </div>
  );
}
