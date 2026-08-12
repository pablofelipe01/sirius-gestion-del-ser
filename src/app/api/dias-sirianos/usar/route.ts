import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";
import { escapeAirtableValue } from "@/lib/security";
import { TABLES, FIELDS, PERIODO_ACTUAL } from "@/lib/airtable-schema";

const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

export async function POST(req: NextRequest) {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;

  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { fecha_uso, motivo } = body;

  if (!fecha_uso) {
    return NextResponse.json({ error: "fecha_uso es requerida" }, { status: 400 });
  }

  const idCore = escapeAirtableValue(payload.idCore);
  const periodo = escapeAirtableValue(PERIODO_ACTUAL);

  // 1. Buscar registro actual
  const formula = encodeURIComponent(
    `AND({${FIELDS.DIAS_SIRIANOS.ID_COLABORADOR}}='${idCore}', {${FIELDS.DIAS_SIRIANOS.PERIODO}}='${periodo}')`
  );

  const urlGet = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.DIAS_SIRIANOS)}?filterByFormula=${formula}`;

  const resGet = await fetch(urlGet, {
    headers: { Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });

  if (!resGet.ok) {
    const error = await resGet.text();
    console.error("[dias-sirianos/usar GET]", error);
    return NextResponse.json({ error: "Error al consultar Airtable" }, { status: 500 });
  }

  const dataGet = await resGet.json();
  const records = dataGet.records ?? [];

  if (records.length === 0) {
    return NextResponse.json(
      { error: "No se encontró registro de días sirianos para este periodo" },
      { status: 404 }
    );
  }

  const record = records[0];
  const recordId = record.id;
  const fields = record.fields;

  const saldoDisponible = (fields[FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE] ?? 0) as number;
  const saldoUsado = (fields[FIELDS.DIAS_SIRIANOS.SALDO_USADO] ?? 0) as number;

  // 2. Validar saldo disponible
  if (saldoDisponible <= 0) {
    return NextResponse.json(
      { error: "Sin días sirianos disponibles" },
      { status: 400 }
    );
  }

  // 3. Actualizar registro
  const observacionesActuales = (fields[FIELDS.DIAS_SIRIANOS.OBSERVACIONES] ?? "") as string;
  const nuevaObservacion = motivo
    ? `${fecha_uso}: ${motivo}`
    : `${fecha_uso}: Día siriano usado`;
  const observacionesActualizadas = observacionesActuales
    ? `${observacionesActuales}\n${nuevaObservacion}`
    : nuevaObservacion;

  const nuevoSaldoDisponible = saldoDisponible - 1;
  const nuevoSaldoUsado = saldoUsado + 1;
  const nuevoEstado = nuevoSaldoDisponible === 0 ? "Agotado" : "Activo";

  const urlPatch = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.DIAS_SIRIANOS)}/${recordId}`;

  const resPatch = await fetch(urlPatch, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        [FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE]: nuevoSaldoDisponible,
        [FIELDS.DIAS_SIRIANOS.SALDO_USADO]: nuevoSaldoUsado,
        [FIELDS.DIAS_SIRIANOS.FECHA_ULTIMO_USO]: fecha_uso,
        [FIELDS.DIAS_SIRIANOS.OBSERVACIONES]: observacionesActualizadas,
        [FIELDS.DIAS_SIRIANOS.ESTADO]: nuevoEstado,
      },
    }),
  });

  if (!resPatch.ok) {
    const error = await resPatch.text();
    console.error("[dias-sirianos/usar PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar registro" }, { status: 500 });
  }

  const recordActualizado = await resPatch.json();

  return NextResponse.json({
    ok: true,
    saldo_disponible: nuevoSaldoDisponible,
    saldo_usado: nuevoSaldoUsado,
    fecha_ultimo_uso: fecha_uso,
    estado: nuevoEstado,
    record: recordActualizado,
  });
}
