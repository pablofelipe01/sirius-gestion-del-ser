/**
 * Consolidación del reporte del biométrico: de marcaciones sueltas a jornadas
 * revisables.
 *
 * La tabla trae una fila por marcación ("Entra" a las 07:22, "Sale" a las
 * 16:18). Quien monitorea no necesita esas filas: necesita saber qué día de qué
 * persona quedó mal y por qué. Este módulo empareja las marcaciones de cada
 * colaborador y día, calcula el tiempo y clasifica la jornada.
 *
 * Módulo puro: no toca Airtable ni React, así que se puede probar sin red.
 */

/** Estados que el flujo de n8n define en el campo `evento`. */
export const EVENTOS = {
  ENTRA: "Entra",
  SALE: "Sale",
  COMPLETA: "Completa",
  SIN_SALIDA: "Sin salida",
  SIN_ENTRADA: "Sin entrada",
  INVALIDO: "Inválido",
} as const;

export type EstadoJornada =
  | typeof EVENTOS.COMPLETA
  | typeof EVENTOS.SIN_SALIDA
  | typeof EVENTOS.SIN_ENTRADA
  | typeof EVENTOS.INVALIDO;

/** Una marcación tal como viene de la tabla del biométrico. */
export interface MarcacionReporte {
  id: string;
  documento: string;
  nombre: string;
  turno: string;
  punto: string;
  /** YYYY-MM-DD, hora local del punto de marcación. */
  fecha: string;
  /** HH:mm:ss, hora local. */
  hora: string;
  evento: string;
  /** Minuto del día (09:21:52 → 561). Es el dato con el que se calcula. */
  minutos: number;
}

/** Justificación encontrada en los módulos de solicitudes. */
export interface Justificacion {
  tipo: "permiso" | "vacaciones";
  detalle: string;
  estado: string;
}

/** Una jornada de un colaborador: lo que revisa el encargado. */
export interface JornadaReporte {
  clave: string;
  documento: string;
  nombre: string;
  turno: string;
  punto: string;
  fecha: string;
  entrada: string | null;
  salida: string | null;
  /** Minutos entre entrada y salida; null si la jornada quedó incompleta. */
  minutosTrabajados: number | null;
  estado: EstadoJornada;
  /** Marcaciones que componen la jornada, en orden. */
  marcaciones: MarcacionReporte[];
  /** Permiso o vacaciones aprobados que cubren el día, si los hay. */
  justificacion?: Justificacion;
}

export interface ResumenReporte {
  marcaciones: number;
  jornadas: number;
  colaboradores: number;
  dias: number;
  completas: number;
  sinSalida: number;
  sinEntrada: number;
  invalidas: number;
  /** Incidencias que quedan tras descontar las que tienen permiso o vacaciones. */
  incidenciasSinJustificar: number;
  minutosTotales: number;
}

/** "9 h 10 min" — como se muestra en la tabla. */
export function formatearMinutos(minutos: number | null): string {
  if (minutos === null || minutos <= 0) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

/** "07:22:43" → "07:22". La UI no necesita los segundos. */
export function horaCorta(hora: string | null): string {
  if (!hora) return "—";
  return hora.slice(0, 5);
}

/** Minuto del día a partir de "HH:mm:ss", por si el campo calculado viene vacío. */
export function minutosDeHora(hora: string): number {
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

const esEntrada = (evento: string) => evento === EVENTOS.ENTRA;
const esSalida = (evento: string) => evento === EVENTOS.SALE;

/**
 * Empareja las marcaciones de un día y decide cómo quedó la jornada.
 *
 * Si el flujo de n8n ya escribió un estado consolidado (`Completa`,
 * `Sin salida`…) en alguna fila del día, ese estado manda: es la conclusión de
 * quien procesó el archivo original, que vio datos que aquí ya no están.
 */
export function consolidarDia(marcaciones: MarcacionReporte[]): {
  entrada: string | null;
  salida: string | null;
  minutosTrabajados: number | null;
  estado: EstadoJornada;
} {
  const orden = [...marcaciones].sort((a, b) => a.minutos - b.minutos);

  const declarado = orden.find(
    (m) => !esEntrada(m.evento) && !esSalida(m.evento),
  )?.evento as EstadoJornada | undefined;

  let minutos = 0;
  let entradaPendiente: MarcacionReporte | null = null;
  let primeraEntrada: MarcacionReporte | null = null;
  let ultimaSalida: MarcacionReporte | null = null;

  for (const marcacion of orden) {
    if (esEntrada(marcacion.evento)) {
      if (!primeraEntrada) primeraEntrada = marcacion;
      // Una entrada repetida no reinicia el conteo: vale la primera.
      if (!entradaPendiente) entradaPendiente = marcacion;
      continue;
    }
    if (!esSalida(marcacion.evento)) continue;

    ultimaSalida = marcacion;
    if (!entradaPendiente) continue;
    const tramo = marcacion.minutos - entradaPendiente.minutos;
    if (tramo > 0) minutos += tramo;
    entradaPendiente = null;
  }

  const hayEntrada = primeraEntrada !== null;
  const haySalida = ultimaSalida !== null;

  const derivado: EstadoJornada = !hayEntrada && !haySalida
    ? EVENTOS.INVALIDO
    : !haySalida
      ? EVENTOS.SIN_SALIDA
      : !hayEntrada
        ? EVENTOS.SIN_ENTRADA
        : EVENTOS.COMPLETA;

  return {
    entrada: primeraEntrada?.hora ?? null,
    salida: ultimaSalida?.hora ?? null,
    // Sin las dos puntas no hay tiempo que reportar: un "0 h" se leería como
    // que la persona no trabajó, cuando lo que pasó fue que faltó una marca.
    minutosTrabajados: hayEntrada && haySalida ? minutos : null,
    estado: declarado ?? derivado,
  };
}

/** Agrupa las marcaciones en jornadas de colaborador y día. */
export function consolidarJornadas(marcaciones: MarcacionReporte[]): JornadaReporte[] {
  const grupos = new Map<string, MarcacionReporte[]>();

  for (const marcacion of marcaciones) {
    const clave = `${marcacion.documento}|${marcacion.fecha}`;
    const grupo = grupos.get(clave);
    if (grupo) grupo.push(marcacion);
    else grupos.set(clave, [marcacion]);
  }

  const jornadas: JornadaReporte[] = [];

  for (const [clave, grupo] of grupos) {
    const orden = [...grupo].sort((a, b) => a.minutos - b.minutos);
    const referencia = orden[0];
    const { entrada, salida, minutosTrabajados, estado } = consolidarDia(orden);

    jornadas.push({
      clave,
      documento: referencia.documento,
      nombre: referencia.nombre,
      // El turno y el punto se toman de la primera marcación del día: son los
      // que estaban vigentes al empezar la jornada.
      turno: referencia.turno,
      punto: referencia.punto,
      fecha: referencia.fecha,
      entrada,
      salida,
      minutosTrabajados,
      estado,
      marcaciones: orden,
    });
  }

  // Más reciente primero, y dentro del mismo día por nombre.
  return jornadas.sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre),
  );
}

/** Una jornada es incidencia cuando no quedó completa. */
export function esIncidencia(jornada: JornadaReporte): boolean {
  return jornada.estado !== EVENTOS.COMPLETA;
}

export function resumirReporte(jornadas: JornadaReporte[]): ResumenReporte {
  const resumen: ResumenReporte = {
    marcaciones: 0,
    jornadas: jornadas.length,
    colaboradores: new Set(jornadas.map((j) => j.documento)).size,
    dias: new Set(jornadas.map((j) => j.fecha)).size,
    completas: 0,
    sinSalida: 0,
    sinEntrada: 0,
    invalidas: 0,
    incidenciasSinJustificar: 0,
    minutosTotales: 0,
  };

  for (const jornada of jornadas) {
    resumen.marcaciones += jornada.marcaciones.length;
    resumen.minutosTotales += jornada.minutosTrabajados ?? 0;

    switch (jornada.estado) {
      case EVENTOS.COMPLETA:
        resumen.completas++;
        break;
      case EVENTOS.SIN_SALIDA:
        resumen.sinSalida++;
        break;
      case EVENTOS.SIN_ENTRADA:
        resumen.sinEntrada++;
        break;
      default:
        resumen.invalidas++;
    }

    if (esIncidencia(jornada) && !jornada.justificacion) {
      resumen.incidenciasSinJustificar++;
    }
  }

  return resumen;
}

/** Rango de un permiso o unas vacaciones, para cruzar contra las jornadas. */
export interface CoberturaSolicitud {
  cedula: string;
  desde: string;
  hasta: string;
  justificacion: Justificacion;
}

/**
 * Marca las jornadas cubiertas por un permiso o unas vacaciones aprobadas.
 *
 * Sin esto, quien monitorea persigue a gente que sí avisó: el biométrico no sabe
 * nada de los permisos, así que un día sin marcación se ve igual que una falta.
 */
export function cruzarConSolicitudes(
  jornadas: JornadaReporte[],
  coberturas: CoberturaSolicitud[],
): JornadaReporte[] {
  if (coberturas.length === 0) return jornadas;

  const porCedula = new Map<string, CoberturaSolicitud[]>();
  for (const cobertura of coberturas) {
    const clave = cobertura.cedula.trim();
    if (!clave) continue;
    const lista = porCedula.get(clave);
    if (lista) lista.push(cobertura);
    else porCedula.set(clave, [cobertura]);
  }

  return jornadas.map((jornada) => {
    if (!esIncidencia(jornada)) return jornada;

    const cobertura = porCedula
      .get(jornada.documento.trim())
      ?.find((c) => c.desde <= jornada.fecha && jornada.fecha <= c.hasta);

    return cobertura ? { ...jornada, justificacion: cobertura.justificacion } : jornada;
  });
}
