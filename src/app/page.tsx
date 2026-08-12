import Image from "next/image";
import Link from "next/link";
import { FondoNocturno } from "@/components/FondoNocturno";

export default function HomePage() {
  return (
    <main className="superficie-noche relative flex min-h-screen items-center justify-center overflow-hidden">
      {/*
        La landing usa el mismo cielo que el login y el dashboard. Antes traía
        otra foto (21032025-DSCF8676.jpg) y el salto se notaba al pasar a
        /login: dos fotografías distintas seguidas leen como dos productos.
      */}
      <FondoNocturno completo />

      <div className="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
        <div
          className="anim-entrada mb-10 rounded-2xl bg-white px-8 py-5 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]"
        >
          <Image src="/Logo-Sirius.png" alt="Sirius" width={240} height={83} priority />
        </div>

        <h1
          className="anim-entrada mb-3 text-3xl font-light tracking-wide text-white md:text-4xl"
          style={{ animationDelay: "120ms" }}
        >
          Gestión del Ser
        </h1>
        <p
          className="anim-entrada mb-12 max-w-md text-base leading-relaxed text-white/80 md:text-lg"
          style={{ animationDelay: "220ms" }}
        >
          Plataforma integral de talento humano, contratos y cumplimiento laboral
        </p>

        <div className="anim-entrada" style={{ animationDelay: "320ms" }}>
          <Link
            href="/login"
            className="inline-flex cursor-pointer select-none items-center gap-2 rounded-full bg-[#1a51a8] px-14 py-4 text-lg font-semibold text-white transition-all duration-300 hover:-translate-y-1 hover:brightness-110"
            style={{ boxShadow: "0 24px 55px -20px #1a51a8" }}
          >
            Acceder
          </Link>
        </div>
      </div>
    </main>
  );
}
