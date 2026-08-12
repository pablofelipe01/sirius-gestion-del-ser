#!/usr/bin/env tsx
/**
 * Script para poblar tabla Dias_Sirianos con registros iniciales
 * de todos los colaboradores activos en Personal.
 *
 * Uso:
 *   npx tsx scripts/poblar-dias-sirianos.ts
 *
 * Requisitos:
 *   - Variables de entorno configuradas en .env.local
 *   - tsx instalado: npm install -D tsx
 */

const BASE_NOMINA = process.env.AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE!;
const KEY_NOMINA = process.env.AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE!;
const BASE_NOVEDADES = process.env.AIRTABLE_BASE_ID_NOVEDADES_NOMINA!;
const KEY_NOVEDADES = process.env.AIRTABLE_API_KEY_NOVEDADES_NOMINA!;

const TABLE_PERSONAL = "Personal";
const TABLE_DIAS_SIRIANOS = "Dias_Sirianos";
const PERIODO_ACTUAL = "2026-S2";

type PersonalRecord = {
  id: string;
  fields: {
    "ID Empleado": string; // SIRIUS-PER-XXXX
    "Nombre completo": string;
    "Estado de actividad": string;
  };
};

type DiasSirianosFields = {
  id_colaborador_core: string;
  saldo_disponible: number;
  saldo_usado: number;
  periodo: string;
  estado: "Activo" | "Agotado";
};

async function fetchColaboradoresActivos(): Promise<PersonalRecord[]> {
  console.log("📥 Obteniendo colaboradores activos de tabla Personal...");

  const formula = encodeURIComponent(`{Estado de actividad}='Activo'`);
  const url = `https://api.airtable.com/v0/${BASE_NOMINA}/${encodeURIComponent(TABLE_PERSONAL)}?filterByFormula=${formula}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY_NOMINA}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error fetching Personal: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const records = data.records as PersonalRecord[];

  console.log(`✅ Encontrados ${records.length} colaboradores activos`);
  return records;
}

async function verificarRegistrosExistentes(): Promise<Set<string>> {
  console.log("\n🔍 Verificando registros existentes en Dias_Sirianos...");

  const url = `https://api.airtable.com/v0/${BASE_NOVEDADES}/${encodeURIComponent(TABLE_DIAS_SIRIANOS)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${KEY_NOVEDADES}` },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Error fetching Dias_Sirianos: ${res.status} - ${error}`);
  }

  const data = await res.json();
  const existentes = new Set<string>();

  for (const record of data.records) {
    const idCore = record.fields.id_colaborador_core;
    if (idCore) existentes.add(idCore as string);
  }

  console.log(`   Registros existentes: ${existentes.size}`);
  return existentes;
}

async function crearRegistrosBatch(registros: DiasSirianosFields[]): Promise<void> {
  if (registros.length === 0) return;

  console.log(`\n📤 Creando ${registros.length} registros en Dias_Sirianos...`);

  const url = `https://api.airtable.com/v0/${BASE_NOVEDADES}/${encodeURIComponent(TABLE_DIAS_SIRIANOS)}`;

  // Airtable permite máximo 10 records por batch
  const BATCH_SIZE = 10;
  let creados = 0;

  for (let i = 0; i < registros.length; i += BATCH_SIZE) {
    const batch = registros.slice(i, i + BATCH_SIZE);

    const payload = {
      records: batch.map((fields) => ({ fields })),
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY_NOVEDADES}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error(`❌ Error en batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error}`);
      continue;
    }

    creados += batch.length;
    console.log(`   ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} completado (${creados}/${registros.length})`);

    // Rate limit: 5 requests per second
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log(`\n✅ Total creados: ${creados} registros`);
}

async function main() {
  console.log("🚀 Iniciando poblado de tabla Dias_Sirianos\n");
  console.log(`   Base Nómina: ${BASE_NOMINA}`);
  console.log(`   Base Novedades: ${BASE_NOVEDADES}`);
  console.log(`   Periodo: ${PERIODO_ACTUAL}\n`);

  try {
    // 1. Obtener colaboradores activos
    const colaboradores = await fetchColaboradoresActivos();

    if (colaboradores.length === 0) {
      console.log("⚠️  No se encontraron colaboradores activos. Abortando.");
      return;
    }

    // 2. Verificar registros existentes
    const existentes = await verificarRegistrosExistentes();

    // 3. Filtrar colaboradores que no tienen registro
    const nuevos: DiasSirianosFields[] = [];
    const omitidos: string[] = [];

    for (const collab of colaboradores) {
      const idCore = collab.fields["ID Empleado"];
      const nombre = collab.fields["Nombre completo"];

      if (!idCore) {
        console.warn(`⚠️  Colaborador sin ID Empleado: ${nombre} (${collab.id})`);
        continue;
      }

      if (existentes.has(idCore)) {
        omitidos.push(`${nombre} (${idCore})`);
        continue;
      }

      nuevos.push({
        id_colaborador_core: idCore,
        saldo_disponible: 2,
        saldo_usado: 0,
        periodo: PERIODO_ACTUAL,
        estado: "Activo",
      });
    }

    console.log(`\n📊 Resumen:`);
    console.log(`   Total colaboradores activos: ${colaboradores.length}`);
    console.log(`   Ya tienen registro: ${omitidos.length}`);
    console.log(`   Nuevos a crear: ${nuevos.length}`);

    if (omitidos.length > 0) {
      console.log(`\n⏭️  Omitidos (ya existen):`);
      omitidos.slice(0, 5).forEach((o) => console.log(`   - ${o}`));
      if (omitidos.length > 5) {
        console.log(`   ... y ${omitidos.length - 5} más`);
      }
    }

    // 4. Crear registros nuevos
    if (nuevos.length > 0) {
      await crearRegistrosBatch(nuevos);
    } else {
      console.log("\n✅ No hay registros nuevos por crear.");
    }

    console.log("\n🎉 Proceso completado exitosamente");

  } catch (error) {
    console.error("\n❌ Error fatal:", error);
    process.exit(1);
  }
}

main();
