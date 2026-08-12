import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";
import { escapeAirtableValue } from "@/lib/security";
import { TABLES, FIELDS, PERIODO_ACTUAL } from "@/lib/airtable-schema";

const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

export async function GET() {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;

  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const idCore = escapeAirtableValue(payload.idCore);
  const periodo = escapeAirtableValue(PERIODO_ACTUAL);

  const formula = encodeURIComponent(
    `AND({${FIELDS.DIAS_SIRIANOS.ID_COLABORADOR}}='${idCore}', {${FIELDS.DIAS_SIRIANOS.PERIODO}}='${periodo}')`
  );

  const url = `https://api.airtable.com/v0/${BASE}/${encodeURIComponent(TABLES.DIAS_SIRIANOS)}?filterByFormula=${formula}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });

  if (!res.ok) {
    const error = await res.text();
    console.error("[dias-sirianos/saldo GET]", error);
    return NextResponse.json({ error: "Error al consultar Airtable" }, { status: 500 });
  }

  const data = await res.json();
  const records = data.records ?? [];

  if (records.length === 0) {
    return NextResponse.json({
      saldo_disponible: 0,
      saldo_usado: 0,
      periodo: PERIODO_ACTUAL,
      fecha_ultimo_uso: null,
    });
  }

  const record = records[0];
  const fields = record.fields;

  return NextResponse.json({
    saldo_disponible: fields[FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE] ?? 0,
    saldo_usado: fields[FIELDS.DIAS_SIRIANOS.SALDO_USADO] ?? 0,
    periodo: fields[FIELDS.DIAS_SIRIANOS.PERIODO] ?? PERIODO_ACTUAL,
    fecha_ultimo_uso: fields[FIELDS.DIAS_SIRIANOS.FECHA_ULTIMO_USO] ?? null,
  });
}
