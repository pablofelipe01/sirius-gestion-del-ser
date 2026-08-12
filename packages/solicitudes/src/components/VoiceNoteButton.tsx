"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MODULOS } from "./ui";

interface Props {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  color?: string;
}

/** Tope de seguridad: si nadie detiene, se corta sola. */
const DURACION_MAXIMA_MS = 3 * 60 * 1000;
/** Reinicios seguidos que fallan de inmediato antes de rendirse. */
const MAX_REINICIOS_FALLIDOS = 4;

export function VoiceNoteButton({
  onTranscript,
  disabled = false,
  color = MODULOS.permiso.color,
}: Props) {
  const [escuchando, setEscuchando] = useState(false);
  const [parcial, setParcial] = useState("");
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  // El usuario quiere seguir dictando: sobrevive a los cortes de Chrome.
  const debeEscucharRef = useRef(false);
  const reinicioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limiteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inicioSesionRef = useRef(0);
  const reiniciosFallidosRef = useRef(0);

  // onTranscript llega como arrow inline desde los formularios: cambia de
  // identidad en cada render. Guardarla en un ref evita que el efecto que crea
  // el reconocimiento se vuelva a ejecutar y aborte la grabación en curso.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const detenerTimers = useCallback(() => {
    if (reinicioTimerRef.current) clearTimeout(reinicioTimerRef.current);
    if (limiteTimerRef.current) clearTimeout(limiteTimerRef.current);
    reinicioTimerRef.current = null;
    limiteTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Sin soporte no se crea nada: el aviso lo da el click sobre el botón.
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition() as SpeechRecognitionInstance;
    recognition.lang = "es-CO"; // Español colombiano
    // continuous: sin esto el motor corta en la primera pausa larga del habla.
    recognition.continuous = true;
    // interimResults: da texto en vivo y mantiene la sesión con actividad.
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      inicioSesionRef.current = Date.now();
      setEscuchando(true);
    };

    recognition.onresult = (event: SpeechRecognitionEventType) => {
      // Hubo voz: la racha de reinicios vacíos se reinicia.
      reiniciosFallidosRef.current = 0;

      let definitivo = "";
      let provisional = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultado = event.results[i];
        const texto = resultado[0].transcript;
        if (resultado.isFinal) definitivo += texto;
        else provisional += texto;
      }

      setParcial(provisional.trim());

      // Se emite solo lo definitivo: el contrato con los formularios es
      // "agrega este fragmento al final del campo".
      const limpio = definitivo.trim();
      if (limpio) onTranscriptRef.current(limpio);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventType) => {
      switch (event.error) {
        // Cortes normales del motor mientras el usuario piensa: onend reinicia.
        case "no-speech":
        case "aborted":
          return;
        case "not-allowed":
        case "service-not-allowed":
          debeEscucharRef.current = false;
          setError(
            "Permiso de micrófono denegado. Habilítalo en el candado de la barra de direcciones."
          );
          return;
        case "audio-capture":
          debeEscucharRef.current = false;
          setError("No se detectó micrófono. Conecta uno y vuelve a intentar.");
          return;
        case "network":
          debeEscucharRef.current = false;
          setError("Sin conexión con el servicio de voz. Revisa tu internet.");
          return;
        default:
          debeEscucharRef.current = false;
          setError("Error al procesar el audio. Intenta de nuevo.");
      }
    };

    recognition.onend = () => {
      setParcial("");

      if (!debeEscucharRef.current) {
        setEscuchando(false);
        return;
      }

      // Chrome termina la sesión por su cuenta tras unos segundos de silencio.
      // Mientras el usuario no haya pulsado "Detener", se reanuda sola.
      const duracion = Date.now() - inicioSesionRef.current;
      if (duracion < 500) reiniciosFallidosRef.current += 1;
      else reiniciosFallidosRef.current = 0;

      if (reiniciosFallidosRef.current >= MAX_REINICIOS_FALLIDOS) {
        debeEscucharRef.current = false;
        setEscuchando(false);
        setError("El micrófono no responde. Recarga la página e intenta de nuevo.");
        return;
      }

      reinicioTimerRef.current = setTimeout(() => {
        if (!debeEscucharRef.current) return;
        try {
          recognition.start();
        } catch {
          // start() sobre una sesión aún viva lanza InvalidStateError: se ignora,
          // el reconocimiento ya está corriendo.
        }
      }, 250);
    };

    recognitionRef.current = recognition;

    return () => {
      debeEscucharRef.current = false;
      detenerTimers();
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, [detenerTimers]);

  const detener = useCallback(() => {
    debeEscucharRef.current = false;
    detenerTimers();
    setParcial("");
    setEscuchando(false);
    recognitionRef.current?.stop();
  }, [detenerTimers]);

  function alternarGrabacion() {
    if (!recognitionRef.current) {
      setError("Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.");
      return;
    }

    if (debeEscucharRef.current) {
      detener();
      return;
    }

    setError("");
    reiniciosFallidosRef.current = 0;
    debeEscucharRef.current = true;
    setEscuchando(true);

    try {
      recognitionRef.current.start();
    } catch {
      // Ya estaba iniciando: el onstart pendiente confirma el estado.
    }

    limiteTimerRef.current = setTimeout(detener, DURACION_MAXIMA_MS);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={alternarGrabacion}
        disabled={disabled}
        className={`inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
          escuchando
            ? "border-rose-400/40 bg-rose-500/15 text-rose-200"
            : "border-white/12 bg-white/[0.06] text-white/85 hover:border-white/25 hover:bg-white/12 hover:text-white"
        }`}
        title={escuchando ? "Haz clic para detener" : "Haz clic y habla"}
      >
        {escuchando ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span>Detener grabación</span>
          </>
        ) : (
          <>
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke={color}
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <span>Dictar por voz</span>
          </>
        )}
      </button>

      {error && (
        <p className="rounded-lg border border-rose-400/35 bg-rose-500/12 px-3 py-2 text-xs text-rose-200">{error}</p>
      )}

      {escuchando && (
        <p className="text-xs italic text-white/75">
          {parcial
            ? parcial
            : "Escuchando... habla con normalidad y pulsa “Detener grabación” al terminar."}
        </p>
      )}
    </div>
  );
}

// Tipos para Web Speech API
interface SpeechRecognitionResultType {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: {
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionEventType {
  readonly resultIndex: number;
  readonly results: {
    readonly length: number;
    [index: number]: SpeechRecognitionResultType;
  };
}

interface SpeechRecognitionErrorEventType {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventType) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventType) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}
