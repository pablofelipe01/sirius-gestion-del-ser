/**
 * El control de acceso a documentos es la única barrera entre el expediente de un
 * trabajador y el resto de la empresa. Estos tests fijan las reglas para que un
 * refactor no las relaje sin que nadie lo note.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Las env vars se leen al importar el módulo, así que se definen antes.
process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA = "appTest";
process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA = "patTest";
process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE = "appCore";
process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE = "patCore";

const validarPermisoAutorizacion = vi.hoisted(() => vi.fn());

vi.mock("@/lib/permisos", () => ({ validarPermisoAutorizacion }));

const {
  autorizarAccesoSolicitud,
  esTipoDocumento,
  esClaseRecurso,
  recursoCoincide,
  resolverRecurso,
} = await import("@/lib/acceso-documentos");

const DUEÑO = "SIRIUS-PER-0002";
const RECORD_ID = "recyB8dqJxvrKNxW2";

function sesion(over: Partial<Record<string, string>> = {}) {
  return {
    sub: "recPersonalDelUser",
    idCore: "SIRIUS-PER-0099",
    cedula: "1006774686",
    nombre: "Ajeno",
    rol: "Estándar",
    iat: 0,
    exp: 0,
    ...over,
  } as never;
}

/** Respuesta de Airtable para el record de la solicitud. */
function mockSolicitud(fields: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ id: RECORD_ID, fields }),
  });
}

beforeEach(() => {
  validarPermisoAutorizacion.mockReset();
  validarPermisoAutorizacion.mockResolvedValue({ puede: false, razon: "sin ámbito" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("esTipoDocumento", () => {
  it("solo acepta los tipos que emiten documento oficial", () => {
    expect(esTipoDocumento("permiso")).toBe(true);
    expect(esTipoDocumento("vacaciones")).toBe(true);
    // Las novedades son informativas: no generan documento ni se autorizan.
    expect(esTipoDocumento("novedades")).toBe(false);
    expect(esTipoDocumento("Personal")).toBe(false);
  });
});

describe("autorizarAccesoSolicitud", () => {
  it("deja pasar al dueño de la solicitud", async () => {
    vi.stubGlobal("fetch", mockSolicitud({ "ID Personal Core": DUEÑO }));

    const r = await autorizarAccesoSolicitud(sesion({ idCore: DUEÑO }), "permiso", RECORD_ID);

    expect(r).toMatchObject({ permitido: true, motivo: "dueño" });
  });

  it("deja pasar a quien firmó la autorización", async () => {
    vi.stubGlobal(
      "fetch",
      mockSolicitud({ "ID Personal Core": DUEÑO, Autorizado_Por_ID: "recJefe" }),
    );

    const r = await autorizarAccesoSolicitud(sesion({ sub: "recJefe" }), "permiso", RECORD_ID);

    expect(r).toMatchObject({ permitido: true, motivo: "autorizador" });
  });

  it("deja pasar a quien tiene potestad de autorizar a ese empleado", async () => {
    vi.stubGlobal("fetch", mockSolicitud({ "ID Personal Core": DUEÑO }));
    validarPermisoAutorizacion.mockResolvedValue({ puede: true });

    const r = await autorizarAccesoSolicitud(sesion(), "permiso", RECORD_ID);

    expect(r).toMatchObject({ permitido: true, motivo: "jefatura" });
    expect(validarPermisoAutorizacion).toHaveBeenCalledWith({
      autorizadorId: "recPersonalDelUser",
      tipoSolicitud: "Permiso",
      solicitudIdCore: DUEÑO,
    });
  });

  it("bloquea a un colaborador ajeno sin potestad — el IDOR que se corrigió", async () => {
    vi.stubGlobal("fetch", mockSolicitud({ "ID Personal Core": DUEÑO }));

    const r = await autorizarAccesoSolicitud(sesion(), "permiso", RECORD_ID);

    // 404 y no 403: un 403 confirmaría que la solicitud existe.
    expect(r).toEqual({ permitido: false, status: 404 });
  });

  it("no confunde el idCore del solicitante con el recordId del autorizador", async () => {
    // Autorizado_Por_ID guarda payload.sub, no payload.idCore. Comparar contra el
    // campo equivocado dejaría entrar a cualquiera cuyo idCore coincida por azar.
    vi.stubGlobal(
      "fetch",
      mockSolicitud({ "ID Personal Core": DUEÑO, Autorizado_Por_ID: "SIRIUS-PER-0099" }),
    );

    const r = await autorizarAccesoSolicitud(sesion(), "permiso", RECORD_ID);

    expect(r).toEqual({ permitido: false, status: 404 });
  });

  it("rechaza un tipo de solicitud desconocido sin consultar Airtable", async () => {
    const fetchMock = mockSolicitud({});
    vi.stubGlobal("fetch", fetchMock);

    const r = await autorizarAccesoSolicitud(sesion(), "personal", RECORD_ID);

    expect(r).toEqual({ permitido: false, status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza un recordId mal formado sin consultar Airtable", async () => {
    const fetchMock = mockSolicitud({});
    vi.stubGlobal("fetch", fetchMock);

    for (const malo of ["", "rec123", "../../Personal/recAbc", "recyB8dqJxvrKNxW2extra"]) {
      expect(await autorizarAccesoSolicitud(sesion(), "permiso", malo)).toEqual({
        permitido: false,
        status: 404,
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("responde 404 si el registro no existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));

    const r = await autorizarAccesoSolicitud(sesion(), "permiso", RECORD_ID);

    expect(r).toEqual({ permitido: false, status: 404 });
  });

  it("bloquea cuando la solicitud no tiene dueño registrado", async () => {
    // Un registro sin ID Personal Core no puede validarse por ámbito: no se
    // asume acceso, se niega.
    vi.stubGlobal("fetch", mockSolicitud({ Nombre: "Huérfano" }));

    const r = await autorizarAccesoSolicitud(sesion(), "permiso", RECORD_ID);

    expect(r).toEqual({ permitido: false, status: 404 });
    expect(validarPermisoAutorizacion).not.toHaveBeenCalled();
  });
});

describe("esClaseRecurso", () => {
  it("solo acepta las clases de archivo conocidas", () => {
    expect(esClaseRecurso("documento")).toBe(true);
    expect(esClaseRecurso("firma-trabajador")).toBe(true);
    expect(esClaseRecurso("firma-autorizador")).toBe(true);
    expect(esClaseRecurso("../../etc/passwd")).toBe(false);
    expect(esClaseRecurso("password")).toBe(false);
  });
});

describe("recursoCoincide", () => {
  const FIRMA_DUEÑO = `firmas/permisos/${DUEÑO}/1785877968404_1006774686.png`;
  const PDF = "autorizaciones/permiso/2026/08/SIRIUS-PER-0002_recyB8dqJxvrKNxW2_1785877971866.pdf";

  it("acepta la firma del trabajador bajo su propio idCore", () => {
    expect(recursoCoincide("firma-trabajador", FIRMA_DUEÑO, DUEÑO)).toBe(true);
  });

  it("rechaza la firma de OTRO empleado aunque el formato sea válido", () => {
    // Este es el ataque que cubre: editar Firma_S3_Key a mano en Airtable para
    // que un endpoint autorizado sirva la firma de un tercero.
    const ajena = "firmas/permisos/SIRIUS-PER-0004/1785877968404_1123561461.png";
    expect(recursoCoincide("firma-trabajador", ajena, DUEÑO)).toBe(false);
  });

  it("no acepta un PDF donde se espera una firma, ni al revés", () => {
    expect(recursoCoincide("firma-trabajador", PDF, DUEÑO)).toBe(false);
    expect(recursoCoincide("documento", FIRMA_DUEÑO, DUEÑO)).toBe(false);
  });

  it("acepta ambos orígenes de documento: día siriano y flujo de autorización", () => {
    expect(recursoCoincide("documento", PDF, DUEÑO)).toBe(true);
    expect(
      recursoCoincide(
        "documento",
        "permisos/dias-sirianos/2026/08/SIRIUS-PER-0002_1006774686_2026-08-04_1785877971866.pdf",
        DUEÑO,
      ),
    ).toBe(true);
  });

  it("sigue aceptando el prefijo dias-pacto anterior al renombre", () => {
    expect(
      recursoCoincide(
        "documento",
        "permisos/dias-pacto/2026/08/SIRIUS-PER-0002_1006774686_2026-08-04_1785877971866.pdf",
        DUEÑO,
      ),
    ).toBe(true);
  });

  it("acepta la firma del autorizador solo bajo el prefijo de autorizaciones", () => {
    expect(
      recursoCoincide("firma-autorizador", `firmas/autorizaciones/SIRIUS-PER-0007/1_2.png`, DUEÑO),
    ).toBe(true);
    // La firma del autorizador no está bajo el idCore del dueño.
    expect(recursoCoincide("firma-autorizador", FIRMA_DUEÑO, DUEÑO)).toBe(false);
  });
});

describe("resolverRecurso", () => {
  const FIRMA = `firmas/permisos/${DUEÑO}/1785877968404_1006774686.png`;

  it("devuelve la key y un nombre de descarga limpio", () => {
    const r = resolverRecurso("permiso", "firma-trabajador", {
      "ID Personal Core": DUEÑO,
      Firma_S3_Key: FIRMA,
    });

    expect(r).toEqual({ ok: true, s3Key: FIRMA, nombre: "firma-trabajador.png" });
  });

  it("responde 404 cuando el campo está vacío", () => {
    const r = resolverRecurso("permiso", "documento", { "ID Personal Core": DUEÑO });
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it("responde 404 si la key del campo no corresponde al dueño", () => {
    const r = resolverRecurso("permiso", "firma-trabajador", {
      "ID Personal Core": DUEÑO,
      Firma_S3_Key: "firmas/permisos/SIRIUS-PER-0004/1_2.png",
    });

    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
