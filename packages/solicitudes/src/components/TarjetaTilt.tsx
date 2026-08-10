"use client";

import { useRef, type MouseEvent, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /**
   * Divisor de la rotación: más alto, más suave. El original del que salió este
   * efecto usaba 12 (hasta ~13° en una tarjeta de 320 px), que en un panel de
   * trabajo marea; 26 deja un máximo de ~4° — se siente, no distrae.
   */
  suavidad?: number;
  /** Color del resplandor al inclinar. Por defecto el cian de marca. */
  glow?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Grados máximos de inclinación, pase lo que pase con el tamaño de la tarjeta. */
const TOPE_GRADOS = 5;

/**
 * Tarjeta que se inclina siguiendo el mouse (perspectiva 3D).
 *
 * Solo se usa en tarjetas **clicables** (módulos del dashboard, acciones de
 * solicitudes). En formularios, tablas y modales estorba: mover el lienzo bajo
 * un campo que se está llenando o una fila que se está leyendo cuesta precisión
 * y no aporta nada.
 *
 * El efecto es de puntero fino, no de dedo: en táctil no hay `mousemove` que
 * seguir y en móvil el `mousemove` sintético del tap dejaría la tarjeta torcida.
 * Con `prefers-reduced-motion` no se inclina.
 *
 * ⚠️ **No intentes darle profundidad al contenido con `translateZ`.** El original
 * del que sale este efecto lo hacía (`.info { transform: translateZ(40px) }`),
 * pero ahí la tarjeta era blanca y opaca. Nuestras tarjetas son `.glass`, y tanto
 * `backdrop-filter` como `overflow: hidden` son propiedades de agrupación: fuerzan
 * `transform-style: flat` en el elemento. Cualquier `translateZ` dentro de una
 * tarjeta de vidrio es CSS muerto — la inclinación sí se ve, el relieve interno no.
 */
export function TarjetaTilt({
  children,
  suavidad = 26,
  glow = "#29b6e8",
  className = "",
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  /** Se consulta en cada evento, no al montar: el usuario puede cambiarlo. */
  function permitido() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function seguir(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || !permitido()) return;

    const r = el.getBoundingClientRect();
    const limitar = (g: number) => Math.max(-TOPE_GRADOS, Math.min(TOPE_GRADOS, g));
    const rotY = limitar((e.clientX - r.left - r.width / 2) / suavidad);
    const rotX = limitar(-(e.clientY - r.top - r.height / 2) / suavidad);

    // El levantamiento entra aquí y no por `hover:-translate-y`: el transform
    // inline gana al de la clase, y si no lo incluyera la tarjeta se hundiría
    // al empezar a inclinarse.
    el.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px) scale(1.02)`;
    el.style.boxShadow = `0 30px 60px -25px ${glow}, 0 18px 40px -24px rgba(0,0,0,0.8)`;
  }

  function soltar() {
    const el = ref.current;
    if (!el) return;
    // Se vacía en vez de fijar 0°: así vuelve a mandar el CSS de la tarjeta.
    el.style.transform = "";
    el.style.boxShadow = "";
  }

  return (
    <div
      ref={ref}
      onMouseMove={seguir}
      onMouseLeave={soltar}
      className={`h-full transition-transform duration-200 ease-out ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
