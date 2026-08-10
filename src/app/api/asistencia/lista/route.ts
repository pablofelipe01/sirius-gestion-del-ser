/**
 * Envío de la lista de asistencia (Excel del biométrico) al flujo de n8n que la
 * procesa.
 *
 * El archivo pasa por el servidor y no va directo del navegador al webhook. Dos
 * razones: la URL del flujo no queda expuesta en el bundle del cliente —donde
 * cualquiera podría llamarla sin sesión— y aquí se puede exigir que quien sube
 * la lista tenga autoridad sobre toda la empresa, porque el archivo trae los
 * datos de todos los colaboradores.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";
import { obtenerPermisosEmpleado } from "@/lib/permisos";

/** Formatos que exporta el biométrico. */
const EXTENSIONES = [".xlsx", ".xls", ".csv"];

/** Tope de tamaño: una lista mensual completa no pasa de unos pocos MB. */
const LIMITE_BYTES = 15 * 1024 * 1024;

/** El flujo de n8n puede tardar en procesar toda la lista. */
const TIMEOUT_MS = 120_000;

export async function POST(req: NextRequest) {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // La lista trae la asistencia de toda la empresa, así que se exige la misma
  // autoridad que ya permite consultar el histórico completo: ámbito "Todos".
  const permisos = await obtenerPermisosEmpleado(payload.sub);
  if (!permisos.some((p) => p.ambito === "Todos")) {
    return NextResponse.json(
      { error: "No tienes permisos para procesar la lista de asistencia" },
      { status: 403 },
    );
  }

  const webhook = process.env.N8N_WEBHOOK_ASISTENCIA;
  if (!webhook) {
    console.error("[asistencia/lista] Falta N8N_WEBHOOK_ASISTENCIA");
    return NextResponse.json(
      { error: "El procesamiento de listas no está configurado en este entorno" },
      { status: 500 },
    );
  }

  let archivo: File | null = null;
  try {
    const form = await req.formData();
    const valor = form.get("archivo");
    if (valor instanceof File) archivo = valor;
  } catch {
    return NextResponse.json({ error: "No se pudo leer el archivo" }, { status: 400 });
  }

  if (!archivo || archivo.size === 0) {
    return NextResponse.json({ error: "Adjunta el archivo de la lista" }, { status: 400 });
  }

  const nombre = archivo.name ?? "lista-asistencia";
  if (!EXTENSIONES.some((ext) => nombre.toLowerCase().endsWith(ext))) {
    return NextResponse.json(
      { error: `Formato no admitido. Debe ser ${EXTENSIONES.join(", ")}` },
      { status: 400 },
    );
  }

  if (archivo.size > LIMITE_BYTES) {
    return NextResponse.json(
      { error: `El archivo pesa demasiado (máximo ${LIMITE_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }

  // Se reenvía como multipart para que n8n lo reciba como archivo binario, junto
  // con quién lo subió: el flujo deja rastro de la persona, no solo del archivo.
  const salida = new FormData();
  salida.append("archivo", archivo, nombre);
  salida.append("nombreArchivo", nombre);
  salida.append("subidoPorNombre", payload.nombre);
  salida.append("subidoPorIdCore", payload.idCore);
  salida.append("subidoPorCedula", payload.cedula);
  salida.append("enviadoEn", new Date().toISOString());

  try {
    const res = await fetch(webhook, {
      method: "POST",
      body: salida,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const cuerpo = await res.text();

    if (!res.ok) {
      console.error("[asistencia/lista] n8n respondió", res.status, cuerpo.slice(0, 500));
      // 404 en una URL /webhook-test/ significa casi siempre que el flujo no está
      // escuchando: es el error más común y merece decirse con todas las letras.
      const pista =
        res.status === 404 && webhook.includes("/webhook-test/")
          ? "El flujo de n8n no está escuchando. Abre el flujo y pulsa «Execute workflow», o usa la URL de producción."
          : `El procesador respondió con error ${res.status}.`;
      return NextResponse.json({ error: pista, detalle: cuerpo.slice(0, 500) }, { status: 502 });
    }

    // n8n devuelve JSON casi siempre, pero un flujo puede responder texto plano.
    let respuesta: unknown = cuerpo;
    try {
      respuesta = cuerpo ? JSON.parse(cuerpo) : null;
    } catch {
      /* se deja el texto tal cual */
    }

    return NextResponse.json({ ok: true, archivo: nombre, respuesta });
  } catch (error) {
    const expiro = error instanceof Error && error.name === "TimeoutError";
    console.error("[asistencia/lista] fallo al enviar a n8n:", error);
    return NextResponse.json(
      {
        error: expiro
          ? "El procesador tardó demasiado en responder. La lista pudo haberse procesado igual: revisa en n8n antes de reenviarla."
          : "No se pudo contactar al procesador de listas.",
      },
      { status: 504 },
    );
  }
}
