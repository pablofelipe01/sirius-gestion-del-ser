/**
 * Reporte del biométrico para quien monitorea la asistencia.
 *
 * Devuelve las jornadas ya consolidadas —una por colaborador y día— con sus
 * marcaciones dentro, y marca las incidencias que tienen un permiso o unas
 * vacaciones aprobadas. Sin ese cruce, el encargado persigue a gente que sí
 * avisó: el biométrico no sabe nada de las solicitudes.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";
import { obtenerPermisosEmpleado } from "@/lib/permisos";
import { escapeAirtableValue } from "@/lib/security";
import { fetchTodos, type RegistroAirtable } from "@/lib/airtable-fetch";
import { ESTADOS_APROBADOS, FIELDS, TABLES } from "@/lib/airtable-schema";
import { fechaBogota } from "@/lib/fecha-bogota";
import {
  consolidarJornadas,
  cruzarConSolicitudes,
  minutosDeHora,
  resumirReporte,
  type CoberturaSolicitud,
  type MarcacionReporte,
} from "@/lib/reporte-asistencia";

const BASE = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;
const R = FIELDS.REPORTE_ASISTENCIA;

/** Ventana por defecto si no se pide un rango: el último mes. */
const DIAS_POR_DEFECTO = 30;

const texto = (valor: unknown): string =>
  valor === null || valor === undefined ? "" : String(valor).trim();

/** Fecha ISO válida, o null. */
function fechaValida(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

function restarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d - dias));
  return fecha.toISOString().slice(0, 10);
}

function aMarcacion(registro: RegistroAirtable): MarcacionReporte | null {
  const f = registro.fields;
  const fecha = texto(f[R.FECHA]).slice(0, 10);
  const documento = texto(f[R.DOCUMENTO]);
  if (!fecha || !documento) return null;

  const hora = texto(f[R.HORA]);
  const minutosCampo = Number(f[R.MINUTOS]);

  return {
    id: registro.id,
    documento,
    nombre: texto(f[R.NOMBRE]) || "Sin nombre",
    turno: texto(f[R.TURNO]),
    punto: texto(f[R.PUNTO]),
    fecha,
    hora,
    evento: texto(f[R.EVENTO]),
    // El campo calculado de Airtable es la fuente; si viniera vacío se deriva de
    // la hora para no perder la marcación.
    minutos: Number.isFinite(minutosCampo) && minutosCampo > 0 ? minutosCampo : minutosDeHora(hora),
  };
}

/** Permisos y vacaciones aprobados que se solapan con el rango consultado. */
async function coberturas(desde: string, hasta: string): Promise<CoberturaSolicitud[]> {
  const estados = ESTADOS_APROBADOS.map(
    (e) => `{${FIELDS.PERMISO.ESTADO}}='${escapeAirtableValue(e)}'`,
  ).join(",");

  const [permisos, vacaciones] = await Promise.all([
    fetchTodos(BASE, KEY, TABLES.PERMISO, {
      filterByFormula: `AND(OR(${estados}), IS_BEFORE({${FIELDS.PERMISO.FECHA_INICIO}}, '${hasta}T23:59:59'))`,
      "fields[]": [
        FIELDS.PERMISO.CEDULA,
        FIELDS.PERMISO.FECHA_INICIO,
        FIELDS.PERMISO.FECHA_FIN,
        FIELDS.PERMISO.TIPO,
        FIELDS.PERMISO.ESTADO,
      ],
    }),
    fetchTodos(BASE, KEY, TABLES.VACACIONES, {
      filterByFormula: `IS_BEFORE({${FIELDS.VACACIONES.FECHA_INICIO}}, '${hasta}T23:59:59')`,
      "fields[]": [
        FIELDS.VACACIONES.CEDULA,
        FIELDS.VACACIONES.FECHA_INICIO,
        FIELDS.VACACIONES.FECHA_FIN,
        FIELDS.VACACIONES.ESTADO,
      ],
    }),
  ]);

  const lista: CoberturaSolicitud[] = [];

  for (const registro of permisos) {
    const f = registro.fields;
    const inicio = texto(f[FIELDS.PERMISO.FECHA_INICIO]).slice(0, 10);
    if (!inicio) continue;
    const fin = texto(f[FIELDS.PERMISO.FECHA_FIN]).slice(0, 10) || inicio;
    if (fin < desde) continue;

    lista.push({
      cedula: texto(f[FIELDS.PERMISO.CEDULA]),
      desde: inicio,
      hasta: fin,
      justificacion: {
        tipo: "permiso",
        detalle: texto(f[FIELDS.PERMISO.TIPO]) || "Permiso",
        estado: texto(f[FIELDS.PERMISO.ESTADO]),
      },
    });
  }

  for (const registro of vacaciones) {
    const f = registro.fields;
    const estado = texto(f[FIELDS.VACACIONES.ESTADO]);
    // El estado de vacaciones no siempre se llena; solo cuentan las aprobadas.
    if (!(ESTADOS_APROBADOS as readonly string[]).includes(estado)) continue;

    const inicio = texto(f[FIELDS.VACACIONES.FECHA_INICIO]).slice(0, 10);
    if (!inicio) continue;
    const fin = texto(f[FIELDS.VACACIONES.FECHA_FIN]).slice(0, 10) || inicio;
    if (fin < desde) continue;

    lista.push({
      cedula: texto(f[FIELDS.VACACIONES.CEDULA]),
      desde: inicio,
      hasta: fin,
      justificacion: { tipo: "vacaciones", detalle: "Vacaciones", estado },
    });
  }

  return lista;
}

export async function GET(req: NextRequest) {
  const token = (await cookies()).get("sirius-auth")?.value;
  const payload = token ? await verifyJWT(token, process.env.JWT_SECRET ?? "") : null;
  if (!payload) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Mismo criterio que la carga de la lista: el reporte es de toda la empresa.
  const permisos = await obtenerPermisosEmpleado(payload.sub);
  if (!permisos.some((p) => p.ambito === "Todos")) {
    return NextResponse.json(
      { error: "No tienes permisos para ver el reporte de asistencia" },
      { status: 403 },
    );
  }

  const params = req.nextUrl.searchParams;
  const hoy = fechaBogota();
  const hasta = fechaValida(params.get("hasta")) ?? hoy;
  const desde = fechaValida(params.get("desde")) ?? restarDias(hasta, DIAS_POR_DEFECTO);

  try {
    const registros = await fetchTodos(BASE, KEY, TABLES.REPORTE_ASISTENCIA, {
      filterByFormula: `AND(IS_AFTER({${R.FECHA}}, '${desde}T00:00:00'), IS_BEFORE({${R.FECHA}}, '${hasta}T23:59:59'))`,
    });

    const marcaciones = registros
      .map(aMarcacion)
      .filter((m): m is MarcacionReporte => m !== null)
      // El filtro de Airtable trabaja con instantes; se recorta por fecha exacta
      // para que los extremos del rango entren completos y sin sorpresas.
      .filter((m) => m.fecha >= desde && m.fecha <= hasta);

    const jornadas = cruzarConSolicitudes(
      consolidarJornadas(marcaciones),
      await coberturas(desde, hasta),
    );

    return NextResponse.json({
      rango: { desde, hasta },
      resumen: resumirReporte(jornadas),
      jornadas,
    });
  } catch (error) {
    console.error("[asistencia/reporte]", error);
    return NextResponse.json(
      { error: "No se pudo cargar el reporte de asistencia" },
      { status: 500 },
    );
  }
}
