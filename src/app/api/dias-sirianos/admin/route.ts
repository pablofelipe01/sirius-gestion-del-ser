import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";
import { escapeAirtableValue } from "@/lib/security";
import { TABLES, FIELDS, PERIODO_ACTUAL } from "@/lib/airtable-schema";

const BASE_NOMINA = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE!;
const KEY_NOMINA = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE!;
const BASE_NOVEDADES = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY_NOVEDADES = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

export async function GET() {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;

  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // RBAC: Solo Admin puede acceder
  if (payload.rol !== "Super Admin" && payload.rol !== "Admin Depto") {
    return NextResponse.json({ error: "Acceso denegado. Solo administradores." }, { status: 403 });
  }

  const periodo = escapeAirtableValue(PERIODO_ACTUAL);

  // 1. Obtener todos los registros de Dias_Sirianos del periodo actual
  const formula = encodeURIComponent(`{${FIELDS.DIAS_SIRIANOS.PERIODO}}='${periodo}'`);
  const sort = encodeURIComponent(FIELDS.DIAS_SIRIANOS.SALDO_USADO);

  const urlDiasSirianos = `https://api.airtable.com/v0/${BASE_NOVEDADES}/${encodeURIComponent(TABLES.DIAS_SIRIANOS)}?filterByFormula=${formula}&sort[0][field]=${sort}&sort[0][direction]=desc`;

  const resDiasSirianos = await fetch(urlDiasSirianos, {
    headers: { Authorization: `Bearer ${KEY_NOVEDADES}` },
    cache: "no-store",
  });

  if (!resDiasSirianos.ok) {
    const error = await resDiasSirianos.text();
    console.error("[dias-sirianos/admin GET Dias_Sirianos]", error);
    return NextResponse.json({ error: "Error al consultar Dias_Sirianos" }, { status: 500 });
  }

  const dataDiasSirianos = await resDiasSirianos.json();
  const recordsDiasSirianos = dataDiasSirianos.records ?? [];

  // 2. Obtener nombres de colaboradores desde Personal
  const idsCore = recordsDiasSirianos
    .map((r: { fields: Record<string, unknown> }) => r.fields[FIELDS.DIAS_SIRIANOS.ID_COLABORADOR])
    .filter(Boolean)
    .map((id: unknown) => `'${escapeAirtableValue(String(id))}'`)
    .join(",");

  if (!idsCore) {
    return NextResponse.json([]);
  }

  const formulaPersonal = encodeURIComponent(
    `OR(${recordsDiasSirianos.map((r: { fields: Record<string, unknown> }) => {
      const idCore = r.fields[FIELDS.DIAS_SIRIANOS.ID_COLABORADOR];
      return `{${FIELDS.PERSONAL.ID_EMPLEADO}}='${escapeAirtableValue(String(idCore))}'`;
    }).join(",")})`
  );

  const urlPersonal = `https://api.airtable.com/v0/${BASE_NOMINA}/${encodeURIComponent(TABLES.PERSONAL)}?filterByFormula=${formulaPersonal}`;

  const resPersonal = await fetch(urlPersonal, {
    headers: { Authorization: `Bearer ${KEY_NOMINA}` },
    cache: "no-store",
  });

  if (!resPersonal.ok) {
    const error = await resPersonal.text();
    console.error("[dias-sirianos/admin GET Personal]", error);
    return NextResponse.json({ error: "Error al consultar Personal" }, { status: 500 });
  }

  const dataPersonal = await resPersonal.json();
  const recordsPersonal = dataPersonal.records ?? [];

  // 3. Crear mapa de idCore -> nombre
  const mapaNombres = new Map<string, string>();
  for (const r of recordsPersonal) {
    const idCore = r.fields[FIELDS.PERSONAL.ID_EMPLEADO];
    const nombre = r.fields[FIELDS.PERSONAL.NOMBRE];
    if (idCore && nombre) {
      mapaNombres.set(String(idCore), String(nombre));
    }
  }

  // 4. Combinar datos
  const resultado = recordsDiasSirianos.map((r: { fields: Record<string, unknown> }) => {
    const idCore = String(r.fields[FIELDS.DIAS_SIRIANOS.ID_COLABORADOR] ?? "");
    const nombre = mapaNombres.get(idCore) ?? "Desconocido";

    return {
      id_colaborador: idCore,
      nombre,
      saldo_disponible: r.fields[FIELDS.DIAS_SIRIANOS.SALDO_DISPONIBLE] ?? 0,
      saldo_usado: r.fields[FIELDS.DIAS_SIRIANOS.SALDO_USADO] ?? 0,
      periodo: r.fields[FIELDS.DIAS_SIRIANOS.PERIODO] ?? PERIODO_ACTUAL,
      fecha_ultimo_uso: r.fields[FIELDS.DIAS_SIRIANOS.FECHA_ULTIMO_USO] ?? null,
      estado: r.fields[FIELDS.DIAS_SIRIANOS.ESTADO] ?? "Activo",
    };
  });

  return NextResponse.json(resultado);
}
