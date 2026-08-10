"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FondoNocturno } from "@/components/FondoNocturno";

export default function LoginPage() {
  const router = useRouter();
  const [cedula, setCedula] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Credenciales incorrectas. Intenta de nuevo.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Error de conexión. Verifica tu red e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Mismo campo que el resto de la aplicación: `campo-oscuro` deja en oscuro los
  // controles que pinta el sistema (autocompletado, gestor de contraseñas).
  const campoCls =
    "campo-oscuro rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white transition-all duration-200 placeholder:text-white/40 focus:border-[#29b6e8] focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-[#29b6e8]/25";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* El mismo cielo nocturno que el resto de la aplicación */}
      <FondoNocturno completo />

      <div className="relative z-10 mx-4 w-full max-w-sm">
        <div className="glass anim-entrada rounded-2xl p-8">
          <div className="mb-8 flex justify-center">
            <div className="rounded-xl bg-white px-5 py-3 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.9)]">
              <Image src="/Logo-Sirius.png" alt="Sirius" width={148} height={51} priority />
            </div>
          </div>

          <h2 className="mb-1 text-center text-xl font-semibold text-white">Bienvenido</h2>
          <p className="mb-7 text-center text-sm text-white/50">
            Ingresa tus credenciales para continuar
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="cedula" className="text-sm font-medium text-white/80">
                Número de cédula
              </label>
              <input
                id="cedula"
                type="text"
                inputMode="numeric"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Ingresa tu cédula"
                required
                autoComplete="username"
                className={campoCls}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-white/80">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className={campoCls}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-rose-400/35 bg-rose-500/15 px-4 py-3 text-sm text-rose-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 cursor-pointer rounded-xl py-3.5 font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
              style={{ background: "#1a51a8", boxShadow: "0 18px 40px -18px #1a51a8" }}
            >
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
