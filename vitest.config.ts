import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Inyecta la firma sintética de Gestión del Ser: el trazo real vive en una
    // variable de entorno y no está en el repositorio.
    setupFiles: ["./src/test/setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
    ],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**"],
      exclude: ["src/lib/env.ts"],
    },
  },
});
