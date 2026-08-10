import { describe, expect, it } from "vitest";
import {
  EVENTOS,
  consolidarDia,
  consolidarJornadas,
  cruzarConSolicitudes,
  formatearMinutos,
  horaCorta,
  minutosDeHora,
  resumirReporte,
  type MarcacionReporte,
} from "./reporte-asistencia";

function marca(
  hora: string,
  evento: string,
  fecha = "2026-07-30",
  documento = "1077859500",
): MarcacionReporte {
  return {
    id: `rec_${documento}_${fecha}_${hora}`,
    documento,
    nombre: "MARIA ALEJANDRA POLANIA PERDOMO",
    turno: "TURNO ADMINISTRATIVO",
    punto: "CONTROL 1",
    fecha,
    hora,
    evento,
    minutos: minutosDeHora(hora),
  };
}

describe("minutosDeHora", () => {
  it("convierte la hora del biométrico al minuto del día", () => {
    // 09:21:52 → 561, igual que el campo calculado de Airtable.
    expect(minutosDeHora("09:21:52")).toBe(561);
    expect(minutosDeHora("17:07:33")).toBe(1027);
    expect(minutosDeHora("00:00:00")).toBe(0);
  });
});

describe("consolidarDia", () => {
  it("empareja entrada y salida y calcula el tiempo", () => {
    const dia = consolidarDia([marca("07:08:40", EVENTOS.ENTRA), marca("16:18:44", EVENTOS.SALE)]);
    expect(dia.estado).toBe(EVENTOS.COMPLETA);
    expect(dia.entrada).toBe("07:08:40");
    expect(dia.salida).toBe("16:18:44");
    expect(dia.minutosTrabajados).toBe(550); // 9 h 10 min
  });

  it("suma varios tramos del mismo día", () => {
    const dia = consolidarDia([
      marca("07:00:00", EVENTOS.ENTRA),
      marca("12:00:00", EVENTOS.SALE),
      marca("13:00:00", EVENTOS.ENTRA),
      marca("17:00:00", EVENTOS.SALE),
    ]);
    expect(dia.minutosTrabajados).toBe(540);
    expect(dia.entrada).toBe("07:00:00");
    expect(dia.salida).toBe("17:00:00");
  });

  it("no reporta tiempo cuando falta la salida", () => {
    const dia = consolidarDia([marca("07:22:43", EVENTOS.ENTRA)]);
    expect(dia.estado).toBe(EVENTOS.SIN_SALIDA);
    // null y no 0: un "0 h" se leería como que no trabajó.
    expect(dia.minutosTrabajados).toBeNull();
    expect(dia.salida).toBeNull();
  });

  it("detecta una salida sin su entrada", () => {
    const dia = consolidarDia([marca("17:06:15", EVENTOS.SALE)]);
    expect(dia.estado).toBe(EVENTOS.SIN_ENTRADA);
    expect(dia.minutosTrabajados).toBeNull();
  });

  it("una entrada repetida no reinicia el conteo", () => {
    const dia = consolidarDia([
      marca("07:00:00", EVENTOS.ENTRA),
      marca("07:05:00", EVENTOS.ENTRA),
      marca("17:00:00", EVENTOS.SALE),
    ]);
    expect(dia.minutosTrabajados).toBe(600); // cuenta desde las 07:00
  });

  it("respeta el estado que ya venía consolidado desde n8n", () => {
    const dia = consolidarDia([
      marca("07:00:00", EVENTOS.ENTRA),
      marca("17:00:00", EVENTOS.SALE),
      marca("17:00:00", EVENTOS.INVALIDO),
    ]);
    expect(dia.estado).toBe(EVENTOS.INVALIDO);
  });

  it("ordena por hora aunque las marcaciones lleguen desordenadas", () => {
    const dia = consolidarDia([marca("16:18:44", EVENTOS.SALE), marca("07:08:40", EVENTOS.ENTRA)]);
    expect(dia.entrada).toBe("07:08:40");
    expect(dia.minutosTrabajados).toBe(550);
  });
});

describe("consolidarJornadas", () => {
  it("agrupa por colaborador y día, del más reciente al más antiguo", () => {
    const jornadas = consolidarJornadas([
      marca("07:08:40", EVENTOS.ENTRA, "2026-07-30"),
      marca("16:18:44", EVENTOS.SALE, "2026-07-30"),
      marca("07:22:43", EVENTOS.ENTRA, "2026-07-31"),
      marca("09:21:52", EVENTOS.ENTRA, "2026-07-30", "1122626068"),
      marca("17:07:33", EVENTOS.SALE, "2026-07-30", "1122626068"),
    ]);

    expect(jornadas).toHaveLength(3);
    expect(jornadas[0].fecha).toBe("2026-07-31");
    expect(jornadas[0].estado).toBe(EVENTOS.SIN_SALIDA);
    expect(jornadas.filter((j) => j.fecha === "2026-07-30")).toHaveLength(2);
  });

  it("no mezcla a dos personas del mismo día", () => {
    const jornadas = consolidarJornadas([
      marca("07:00:00", EVENTOS.ENTRA, "2026-07-30", "111"),
      marca("17:00:00", EVENTOS.SALE, "2026-07-30", "222"),
    ]);
    expect(jornadas).toHaveLength(2);
    expect(jornadas.map((j) => j.estado).sort()).toEqual([EVENTOS.SIN_ENTRADA, EVENTOS.SIN_SALIDA]);
  });
});

describe("cruzarConSolicitudes", () => {
  const jornadas = consolidarJornadas([marca("07:22:43", EVENTOS.ENTRA, "2026-07-31")]);
  const cobertura = {
    cedula: "1077859500",
    desde: "2026-07-30",
    hasta: "2026-08-01",
    justificacion: { tipo: "permiso" as const, detalle: "Médico / Cita médica", estado: "Concedido" },
  };

  it("marca la incidencia cubierta por un permiso aprobado", () => {
    const cruzadas = cruzarConSolicitudes(jornadas, [cobertura]);
    expect(cruzadas[0].justificacion?.tipo).toBe("permiso");
    expect(cruzadas[0].justificacion?.detalle).toBe("Médico / Cita médica");
  });

  it("no justifica si el permiso es de otra persona o de otras fechas", () => {
    expect(
      cruzarConSolicitudes(jornadas, [{ ...cobertura, cedula: "999" }])[0].justificacion,
    ).toBeUndefined();
    expect(
      cruzarConSolicitudes(jornadas, [{ ...cobertura, desde: "2026-08-05", hasta: "2026-08-06" }])[0]
        .justificacion,
    ).toBeUndefined();
  });

  it("no toca las jornadas completas", () => {
    const completas = consolidarJornadas([
      marca("07:00:00", EVENTOS.ENTRA),
      marca("17:00:00", EVENTOS.SALE),
    ]);
    expect(cruzarConSolicitudes(completas, [cobertura])[0].justificacion).toBeUndefined();
  });
});

describe("resumirReporte", () => {
  it("cuenta jornadas, incidencias y descuenta las justificadas", () => {
    const jornadas = cruzarConSolicitudes(
      consolidarJornadas([
        marca("07:08:40", EVENTOS.ENTRA, "2026-07-30"),
        marca("16:18:44", EVENTOS.SALE, "2026-07-30"),
        marca("07:22:43", EVENTOS.ENTRA, "2026-07-31"),
        marca("17:00:00", EVENTOS.SALE, "2026-08-03", "1122626068"),
      ]),
      [
        {
          cedula: "1077859500",
          desde: "2026-07-31",
          hasta: "2026-07-31",
          justificacion: { tipo: "vacaciones", detalle: "Vacaciones", estado: "Aprobado" },
        },
      ],
    );

    const resumen = resumirReporte(jornadas);
    expect(resumen.jornadas).toBe(3);
    expect(resumen.colaboradores).toBe(2);
    expect(resumen.completas).toBe(1);
    expect(resumen.sinSalida).toBe(1);
    expect(resumen.sinEntrada).toBe(1);
    // De las dos incidencias, una tiene vacaciones aprobadas.
    expect(resumen.incidenciasSinJustificar).toBe(1);
    expect(resumen.minutosTotales).toBe(550);
  });
});

describe("formato", () => {
  it("formatea duraciones y horas", () => {
    expect(formatearMinutos(550)).toBe("9 h 10 min");
    expect(formatearMinutos(120)).toBe("2 h");
    expect(formatearMinutos(45)).toBe("45 min");
    expect(formatearMinutos(null)).toBe("—");
    expect(horaCorta("07:22:43")).toBe("07:22");
    expect(horaCorta(null)).toBe("—");
  });
});
