import Image from "next/image";

/**
 * Fondo de la vista de solicitudes: la foto nocturna del cielo de Sirius.
 *
 * Va como `absolute inset-0` dentro del contenedor de la página, **nunca
 * `fixed`**: el layout del dashboard tiene el sidebar como hermano del área de
 * contenido, y un fondo fijo al viewport se le montaría encima.
 *
 * La foto ocupa la franja superior y se disuelve en el azul noche del resto de
 * la página. Estirarla a toda la altura del scroll obligaría a recortarla tanto
 * que se perdería el árbol, que es lo único reconocible de la imagen.
 */
interface Props {
  /**
   * `true` cuando el contenedor mide una pantalla y el contenido va centrado
   * (el login): la foto ocupa todo y no se disuelve a mitad de camino.
   */
  completo?: boolean;
}

export function FondoNocturno({ completo = false }: Props) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden print:hidden"
      style={{ background: "#070c18" }}
    >
      {/* Foto + deriva lenta */}
      <div
        className={`absolute inset-x-0 top-0 overflow-hidden ${
          completo ? "bottom-0" : "h-[min(78vh,780px)]"
        }`}
      >
        <Image
          src="/vlcsnap-2026-08-10-08h28m10s623.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="anim-deriva object-cover object-center will-change-transform"
        />

        {/* Velo: la foto se ve, el texto encima se lee. */}
        <div
          className="absolute inset-0"
          style={{
            background: completo
              ? "linear-gradient(160deg, rgba(7,12,24,0.55) 0%, rgba(10,22,40,0.62) 50%, rgba(4,7,17,0.78) 100%)"
              : "linear-gradient(180deg, rgba(7,12,24,0.35) 0%, rgba(7,12,24,0.55) 42%, rgba(7,12,24,0.88) 78%, #070c18 100%)",
          }}
        />
      </div>

      {/* Resplandores de color en movimiento — el ámbar del cielo y el cian de marca */}
      <div
        className="anim-aurora absolute -left-24 top-24 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(217,160,106,0.16), transparent 70%)" }}
      />
      <div
        className="anim-aurora absolute -right-32 top-[38%] h-[560px] w-[560px] rounded-full blur-3xl"
        style={{
          background: "radial-gradient(circle, rgba(41,182,232,0.13), transparent 70%)",
          animationDelay: "-13s",
        }}
      />

      {/* Estrellas: pocas y discretas, para que el fondo respire */}
      {ESTRELLAS.map((e, i) => (
        <span
          key={i}
          className="anim-titilar absolute rounded-full bg-white"
          style={{
            left: e.left,
            top: e.top,
            width: e.size,
            height: e.size,
            animationDelay: e.delay,
            boxShadow: "0 0 6px rgba(255,255,255,0.8)",
          }}
        />
      ))}
    </div>
  );
}

/** Posiciones fijas: aleatorizarlas rompería la hidratación del server component. */
const ESTRELLAS = [
  { left: "12%", top: "8%", size: 2, delay: "0s" },
  { left: "23%", top: "18%", size: 3, delay: "-1.4s" },
  { left: "38%", top: "6%", size: 2, delay: "-2.6s" },
  { left: "57%", top: "13%", size: 2, delay: "-0.8s" },
  { left: "68%", top: "5%", size: 3, delay: "-3.2s" },
  { left: "81%", top: "16%", size: 2, delay: "-2s" },
  { left: "91%", top: "9%", size: 2, delay: "-1s" },
  { left: "47%", top: "22%", size: 2, delay: "-3.8s" },
];
