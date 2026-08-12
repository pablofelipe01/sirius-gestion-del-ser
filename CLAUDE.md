# CLAUDE.md — Sirius Gestión del Ser

> Archivo leído automáticamente por Claude Code CLI en cada sesión. Documenta el proyecto para todos los agentes de desarrollo.

## Stack Tecnológico

- **Framework**: Next.js 16.1.6 con App Router (monorepo — sin separación backend/frontend)
- **React**: 19.2.3 / **TypeScript**: 5.x strict
- **Estilos**: Tailwind CSS 4, superficie nocturna con vidrio (ver *Sistema visual*)
- **Bases de datos**: Airtable — 2 bases activas (ver sección Airtable)
- **AI**: Anthropic Claude API (`claude-sonnet-4-5` agentes, `claude-opus-4-5` transcripción)
- **Auth**: JWT HMAC-SHA256 Web Crypto API (sin libs externas) + bcryptjs 12 rounds
- **Testing**: Vitest + jsdom / **CI/CD**: GitHub Actions

## Estado del Proyecto

| Módulo | Rutas | Estado |
|--------|-------|--------|
| Landing | `/` | ✅ |
| Login | `/login` + `/api/auth/login` + `/api/auth/logout` | ✅ |
| Auth libs | `src/lib/auth.ts` + `src/lib/security.ts` | ✅ |
| Route guard | `src/proxy.ts` | ✅ |
| Dashboard home | `/dashboard` | ✅ |
| Solicitudes | `/dashboard/solicitudes/**` + `/api/solicitudes/**` + `/api/me` | ✅ |
| Autorizaciones | `DashboardAutorizaciones` + `/api/solicitudes/pendientes` + `/api/solicitudes/autorizar` | ✅ |
| Histórico | `/dashboard/historico` + `/api/solicitudes/historico` | ✅ |
| Documentos de autorización | `/api/documentos/{permiso\|vacaciones}/{recordId}[/{clase}]` (streaming desde S3) | ✅ |

### 🔒 Acceso a documentos — regla no negociable

Un documento de permiso lleva el motivo (a menudo médico), la cédula y la firma
manuscrita del trabajador. **Tener sesión no es autorización.** Todo acceso pasa
por `autorizarAccesoSolicitud()` en `src/lib/acceso-documentos.ts`, que concede
solo a: el dueño (`ID Personal Core` === `payload.idCore`), quien autorizó
(`Autorizado_Por_ID` === `payload.sub`) y quien tiene potestad de autorizar según
`validarPermisoAutorizacion()`. Al denegar responde **404, no 403**: un 403
confirmaría que el registro existe.

Dos reglas que se derivan de ahí:

1. **El cliente nunca nombra un archivo de S3.** Se pide
   `(tipo, recordId, clase)` y el servidor resuelve la key. Un endpoint que reciba
   una S3 key del navegador no puede comprobar de quién es el archivo — por eso se
   eliminó `/api/firmas/{key}`.
2. **No se entregan URLs firmadas al navegador.** El archivo se transmite por el
   route (`servirDocumentoSolicitud()`): una URL firmada sale del perímetro y
   funciona sin sesión mientras viva. `getSignedUrlForFirma()` queda para uso
   interno del servidor.

Las keys que salen de campos de Airtable se verifican con `recursoCoincide()`
antes de servirse: esos campos son texto editable, y sin la comprobación bastaría
cambiar `Firma_S3_Key` a mano para que un acceso legítimo sirviera el archivo de
otra persona.

### ⚠️ Qué se autoriza y qué no

**Solo permisos y vacaciones pasan por el flujo de autorización.** Las novedades de
nómina son un **registro informativo** que el colaborador reporta: no se aprueban
ni se rechazan, no llevan firma del trabajador y no generan documento oficial. Su
`Estado del Registro` lo gestiona RRHH directamente en Airtable.

Por eso las novedades **no** aparecen en `/api/solicitudes/pendientes`, ni en
`DashboardAutorizaciones`, ni en `ModalAutorizarSolicitud`; `/api/solicitudes/autorizar`
devuelve 400 si se le pasa `tabla: "novedades"`. Sí aparecen en el **histórico**,
que es una vista de consulta.
| Asistencia | `/dashboard/asistencia` + `/api/asistencia` | ✅ |
| Contratos | `/dashboard/contratos` | ❌ Pendiente |
| Documentos | `/dashboard/documentos` | ❌ Pendiente |
| Horarios | `/dashboard/horarios` | ❌ Pendiente |
| Asistente IA | `/dashboard/asistente` | ❌ Pendiente |

## Módulo de Asistencia

`/dashboard/asistencia` tiene **un solo botón**. El colaborador no elige si marca
entrada o salida: `siguienteTipo()` lo deduce de su última marcación del día
(entrada → sigue salida; cualquier otro caso → entrada). Quitar esa decisión es lo
que hace el módulo usable sin explicación previa, y de paso impide registrar dos
entradas seguidas por equivocación.

| Pieza | Archivo |
|-------|---------|
| Lógica pura (fechas Bogotá, emparejar entrada/salida, totales) | `src/lib/asistencia.ts` + tests |
| Endpoint `GET`/`POST` | `src/app/api/asistencia/route.ts` |
| UI | `src/components/MarcacionAsistencia.tsx` |
| Tabla Airtable | `Asistencia Personal` (`tblHxTE3XOlfAo0KA`), base Novedades Nómina |

- `GET /api/asistencia?mes=YYYY-MM` → estado de hoy + días del mes con horas.
- `POST /api/asistencia` → registra la marcación que toca. Ignora una segunda
  pulsación dentro de **60 segundos** (409): un doble clic no debe abrir y cerrar
  la jornada en el mismo minuto.
- Las horas se calculan emparejando entradas con salidas. Una entrada repetida no
  reinicia el conteo y una salida suelta se ignora: **nadie pierde horas por haber
  pulsado dos veces**.

⚠️ **El campo primario de la tabla se llama `﻿Empleado_RecordID`**, con un BOM
(U+FEFF) que dejó la importación por CSV. Sin ese carácter Airtable responde
`UNKNOWN_FIELD_NAME`. Por eso está escrito escapado en `FIELDS.ASISTENCIA` — es
invisible en el editor y cualquiera lo borraría sin notarlo. Guarda el record ID de
Personal por compatibilidad, pero la FK con la que se filtra es **`ID Personal Core`**
(campo agregado el 2026-08-06; el registro histórico de abril quedó rellenado).

Usa hora de Colombia siempre (`fechaBogota()` / `horaBogota()`): `Fecha_Hora`
guarda el instante en ISO UTC y `Fecha` / `Hora` el día y la hora locales.

### Carga de la lista de asistencia (biométrico → n8n)

`POST /api/asistencia/lista` recibe el Excel del biométrico y lo reenvía al flujo
de n8n de `N8N_WEBHOOK_ASISTENCIA`. La UI es `CargarListaAsistencia`, montada en
la **pestaña Novedades del histórico**.

**El archivo pasa por el servidor, nunca del navegador al webhook.** Si el
navegador llamara directo, la URL del flujo quedaría en el bundle del cliente y
cualquiera podría enviarle archivos sin sesión. Además, en el servidor se puede
exigir autoridad: solo quien tiene un permiso de autorización con **ámbito
"Todos"** puede subirla, porque la lista trae los datos de todos los
colaboradores. Es el mismo alcance que ya permite ver el histórico completo, y
por eso la UI se muestra solo con `alcance === "todos"`.

⚠️ Una URL `/webhook-test/` de n8n **solo responde con el flujo escuchando en el
editor, y una sola vez por cada «Execute workflow»**. El endpoint traduce ese 404
a un mensaje que lo dice; al activar el flujo hay que cambiar la variable a
`/webhook/`.

## Sistema visual — superficie nocturna

Toda la aplicación va sobre la misma fotografía nocturna
(`public/vlcsnap-2026-08-10-08h28m10s623.png`) con tarjetas de vidrio. Las
primitivas están en `src/app/globals.css` y el fondo en
`src/components/FondoNocturno.tsx`.

| Pieza | Para qué |
|-------|----------|
| `.glass` | Tarjeta translúcida (acciones, avisos, métricas) |
| `.glass-solid` | Paneles con mucho texto — más opaco para que se lea |
| `.campo-oscuro` | **Todo** input/select/textarea/checkbox |
| `.scroll-noche` | Contenedor con scroll (el `<main>` del dashboard) |
| `.anim-deriva` `.anim-aurora` `.anim-titilar` `.anim-entrada` | Movimiento |

### Piso de contraste del texto

**`text-white/60` es el mínimo para texto**, y `/45` solo para adornos sin
información (separadores, iconos decorativos). Por debajo de 60 % el blanco sobre
el fondo nocturno baja de 4.5:1 y el texto deja de leerse — es exactamente el
problema que hubo que corregir de un barrido en 22 archivos. Escala en uso:
`/100` títulos · `/85–90` cuerpo · `/70–80` secundario · `/65` terciario.

Dos apoyos del mismo piso:

- **El tinte de `.glass` es oscuro, no blanco.** Encima va texto blanco: aclarar
  la tarjeta le quita contraste justo donde se lee. El efecto de vidrio lo dan el
  `blur` y el brillo del borde, no la opacidad del relleno.
- **`.superficie-noche`** (en el `<main>` del dashboard, `/` y `/login`) da color
  de texto claro por herencia. El `body` sigue siendo claro porque los documentos
  y la impresión lo son, y sin esta clase cualquier texto al que se le olvide una
  clase de color hereda `#171717` y desaparece. `@media print` la devuelve a negro
  sobre blanco.

Cuatro reglas más que se rompen sin darse cuenta:

1. **`.glass` vive en `globals.css`, no repartido en clases de Tailwind.** Al
   imprimir hay que devolver todas las tarjetas a blanco sobre negro de un solo
   golpe: un PDF de permiso con fondo translúcido sale ilegible. El `@media print`
   ya lo hace para `.glass`, `.glass-solid` y `.campo-oscuro`.
2. **`.campo-oscuro` no es decoración.** Pone `color-scheme: dark`, y sin eso el
   calendario de `type="date"` —que lo pinta el sistema— sale claro con el texto
   blanco del campo encima: blanco sobre blanco.

   Con el `<select>` `color-scheme` **no alcanza**: el popup toma el
   `background-color` del control, y un fondo declarado por el autor gana sobre el
   lienzo oscuro del sistema, así que el relleno translúcido de los demás campos
   lo devolvía a casi blanco. Por eso el `select` es el único campo con relleno
   **opaco** (`select.campo-oscuro` en `globals.css`, elemento + clase para
   ganarle a la utilidad de Tailwind del call site) y las `option` llevan fondo y
   color explícitos. **No le pongas `bg-white/[…]` a un `<select>`.**
3. **`.anim-entrada` y `hover:-translate-*` no pueden ir en el mismo elemento.**
   La animación usa `forwards`, deja fijado `transform: none` y se come el hover.
   Van en envoltorio (entrada) + hijo (hover).
4. **El canvas de `FirmaCanvas` se queda blanco.** Se rellena de blanco y el trazo
   es negro; ese PNG es el que va a S3 y al PDF. Oscurecerlo dejaría la firma
   invisible en el documento oficial.

### Tarjetas 3D — `TarjetaTilt`

`packages/solicitudes/src/components/TarjetaTilt.tsx` inclina la tarjeta siguiendo
el mouse. **Solo en tarjetas clicables**: los 6 módulos de `/dashboard` y las 3
acciones de `/dashboard/solicitudes`. En formularios, tablas y modales estorba —
mover el lienzo bajo un campo que se está llenando o una fila que se está leyendo
cuesta precisión. Los módulos marcados `ready: false` tampoco se inclinan: el
efecto invita a hacer clic y ahí no hay nada que abrir.

Se limita a ±5° (el snippet original llegaba a ~13°, que en un panel de trabajo
marea), solo con puntero fino —en táctil el `mousemove` sintético del tap dejaría
la tarjeta torcida— y nunca con `prefers-reduced-motion`.

⚠️ **`translateZ` dentro de una tarjeta de vidrio es CSS muerto.** `backdrop-filter`
y `overflow: hidden` son propiedades de agrupación y fuerzan `transform-style: flat`.
La inclinación de la tarjeta se ve; el relieve de su contenido, no.

El fondo va `absolute` dentro del `<main>`, nunca `fixed`: el sidebar es su
hermano en el layout y un fondo fijo al viewport se le monta encima. Su
envoltorio `relative min-h-full` es el que le da altura — un `absolute inset-0`
colgado directo del contenedor con scroll se queda del tamaño de la ventana y se
va al desplazar. `<FondoNocturno completo />` es para pantallas de una sola vista
con contenido centrado (`/` y `/login`).

## Estructura del Monorepo

```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts          # POST — autentica cédula+password, emite JWT
│   │   │   └── logout/route.ts         # POST — borra cookie sirius-auth
│   │   ├── me/route.ts                 # GET  — perfil autenticado (+ cargo de Airtable)
│   │   └── solicitudes/
│   │       ├── permiso/route.ts        # GET lista | POST → Solicitud_Permiso
│   │       ├── vacaciones/route.ts     # GET lista | POST → Solicitud_Vacaciones
│   │       └── novedades/route.ts      # GET lista | POST → Reportes Novedades Nomina
│   ├── dashboard/
│   │   ├── layout.tsx                  # Sidebar (NavLinks) + avatar + logout — server
│   │   ├── page.tsx                    # Home: saludo, banner, tarjetas módulos
│   │   └── solicitudes/
│   │       ├── page.tsx                # Overview: 3 acciones + historial — server
│   │       ├── permiso/page.tsx        # Formulario permiso — client
│   │       ├── vacaciones/page.tsx     # Formulario vacaciones — client
│   │       └── novedades/page.tsx      # Formulario novedad nómina — client
│   ├── login/page.tsx                  # Login glass card — client
│   ├── page.tsx                        # Landing (DSCF8676 + botón Acceder) — server
│   ├── layout.tsx                      # Root layout — Geist + favicon Logo-Sirius.png
│   └── globals.css                     # Tailwind 4
├── components/
│   ├── NavLinks.tsx                    # Nav sidebar — client, usePathname() para activo
│   └── LogoutButton.tsx               # Logout — client, POST /api/auth/logout
├── lib/
│   ├── airtable-schema.ts              # FUENTE ÚNICA: TABLES, FIELDS, FK_ID_CORE, estados
│   ├── constants.ts                    # Enums de negocio: TIPOS_PERMISO, TIPOS_NOVEDAD
│   ├── auth.ts                         # signJWT(), verifyJWT(), hashPassword(), verifyPassword()
│   └── security.ts                     # escapeAirtableValue()
└── proxy.ts                            # Auth guard Next.js 16: protege /dashboard/**
```

## Bases de Datos Airtable

### Base 1 — Nómina Core (`appQYSeZ5F8D3acu5`)
Identidad, roles y nómina de empleados.

**Tabla: Personal** (`tblJNdYasZrhBniJj`)

| Campo | Tipo | Uso |
|-------|------|-----|
| `ID Empleado` | formula | Genera `SIRIUS-PER-XXXX` → `payload.idCore` |
| `Numero Documento` | singleLineText | Clave de login |
| `Nombre completo` | singleLineText | En JWT y UI |
| `Password` | singleLineText | Hash bcrypt `$2b$12$...` (60 chars) |
| `Estado de actividad` | singleSelect | `"Activo"` para ingresar; `"De baja"` bloquea |
| `Rol` | multipleRecordLinks | → Roles y Permisos |

**Tabla: Roles y Permisos** (`tblKcfXywV83X5ACp`)

| Campo | Tipo | Uso |
|-------|------|-----|
| `Rol` | singleLineText | Nombre del cargo (ej: `"CTO (CHIEF TECHNOLOGY OFFICER)"`) |
| `Nivel_Acceso` | singleSelect | Rol del sistema para RBAC |

**Jerarquía RBAC:** `Super Admin > Admin Depto > Avanzado > Estándar > Lectura`

---

### Base 2 — Novedades Nómina (`appnRVYZMd4EAQoRF`)
Solicitudes de empleados. Reemplaza el sistema de HTML estáticos en S3.

**Tabla: Solicitud_Permiso**

| Campo | Tipo | Origen |
|-------|------|--------|
| `Nombre` | multilineText | Auto — `payload.nombre` |
| `Cedula` | singleLineText | Auto — `payload.cedula` |
| `Cargo` | singleLineText | Auto — `/api/me` → `Roles y Permisos.Rol` |
| `ID Personal Core` | singleLineText | Auto — `payload.idCore` (FK de filtrado) |
| `Fecha de solicitud` | date | Auto — fecha del día |
| `Tipo_Permiso` | singleLineText | Usuario — enum de 8 opciones |
| `Fecha de permiso` | date | Usuario |
| `Fecha fin de permiso` | date | Usuario (opcional) |
| `Horas Permiso` | singleLineText | Usuario (guardado como string) |
| `Motivo_Permiso` | multilineText | Usuario |
| `Remunerado` | checkbox | Usuario |
| `Compensado` | checkbox | Gestión del Ser al autorizar |
| `Fecha de compensatorio` | date | Auto — primer día del plan de reposición |
| `Plan_Compensacion` | singleLineText | Gestión del Ser al autorizar, o el colaborador si quedó vacío |
| `Dias_Compensacion_Detalle` | multilineText | Auto — JSON `[{fecha,horas,descripcion}]` del plan |
| `Estado_Permiso` | singleSelect | Auto — `"Pendiente"` al crear |

**Tabla: Solicitud_Vacaciones**

| Campo | Tipo | Origen |
|-------|------|--------|
| `Nombre` | singleLineText | Auto — `payload.nombre` |
| `Cedula` | singleLineText | Auto — `payload.cedula` |
| `Cargo` | singleLineText | Auto — `/api/me` |
| `ID Personal Core` | singleLineText | Auto — `payload.idCore` |
| `Fecha de Presentacion` | date | Auto — fecha del día |
| `Fecha Inicio` | date | Usuario |
| `Fecha Fin` | date | Usuario |
| `Fecha Reintegro` | date | Usuario (opcional) |
| `Dias Vacaciones` | number | Auto — calculado en frontend (días calendario) |
| `Motivo` | multilineText | Usuario (opcional) |
| `Estado Solicitud` | singleSelect | Sin valor inicial — RRHH lo gestiona |

**Tabla: Reportes Novedades Nomina**

| Campo | Tipo | Origen |
|-------|------|--------|
| `ID Personal Core` | singleLineText | Auto — `payload.idCore` |
| `Tipo de Novedad` | singleLineText | Usuario — enum de 7 opciones |
| `Descripción de la Novedad` | multilineText | Usuario |
| `Número Horas Extras` | number | Usuario (visible solo si tipo = "Horas Extra") |
| `Estado del Registro` | singleSelect | Auto — `"Pendiente"` al crear |

**Enums controlados** — definidos en `src/lib/constants.ts`, importados por formularios y routes:

```typescript
import { TIPOS_PERMISO, TIPOS_NOVEDAD, TIPO_HORAS_EXTRA } from "@/lib/constants";
```

## Módulo de Solicitudes

### Flujo de una solicitud

```
[Formulario "use client"]
    │
    ├─ useEffect → GET /api/me
    │       └─ auto-llena readonly: Nombre, Cédula, Cargo, ID empleado
    │
    └─ submit → POST /api/solicitudes/{permiso|vacaciones|novedades}
                    ├─ verifica JWT (cookie sirius-auth)
                    ├─ extrae nombre, cedula, idCore del payload
                    ├─ escapeAirtableValue(idCore) antes de filtros
                    ├─ agrega fecha del día y Estado="Pendiente"
                    └─ POST a Airtable → { ok: true, id: "recXXX" }
```

### Página overview `/dashboard/solicitudes` — server component

1. Lee JWT desde cookie → `idCore`
2. `Promise.allSettled` con 3 fetches paralelos a Airtable filtrando por `idCore`
3. Fusiona, ordena por fecha desc, muestra los 10 más recientes
4. Badges de estado por color:

| Estado | Estilo |
|--------|--------|
| Pendiente | amarillo `bg:#fef9c3 / text:#a16207` |
| Concedido / Aprobado / Autorizado / Resuelto | verde `bg:#dcfce7 / text:#15803d` |
| Rechazado / No autorizado | rojo `bg:#fee2e2 / text:#b91c1c` |
| Revisado | azul `bg:#dbeafe / text:#1d4ed8` |

### Formularios — patrón client component

```typescript
"use client"
import { VoiceNoteButton } from "@sirius/solicitudes";
import { FirmaCanvas } from "@sirius/solicitudes";

export default function FormPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [firmaBlob, setFirmaBlob] = useState<Blob | null>(null);
  const [firmaConfirmada, setFirmaConfirmada] = useState(false);
  
  useEffect(() => { fetch("/api/me").then(r => r.json()).then(setMe) }, []);
  
  // submit deshabilitado hasta que me !== null Y firmaConfirmada === true
  // campos auto: readonlyCls (bg-gray-50, no editables)
  // campos usuario: inputCls (focus ring en color del módulo)
  // nota de voz: encima de campos de texto largo (motivo, descripción)
  // firma digital: sección final obligatoria antes del botón enviar
  // éxito: reemplaza form con confirmación + botones "Nueva solicitud" + "Ver solicitudes"
}
```

Colores por sub-módulo: Permiso `#1a51a8` · Vacaciones `#6bb543` · Novedades `#e07b39`

### Funcionalidades estándar en formularios (2026-07+)

#### 1. Nota de voz (Web Speech API)
- **Componente**: `VoiceNoteButton` de `@sirius/solicitudes`
- **Ubicación**: Encima de campos de texto largo (motivo, descripción, comentario)
- **Idioma**: Español colombiano (`es-CO`)
- **Comportamiento**: Transcripción se agrega al campo de texto, permitiendo edición manual posterior
- **Compatibilidad**: Chrome, Edge, Opera, Safari 14.1+ (no Firefox)

#### 2. Firma digital del trabajador
- **Componente**: `FirmaCanvas` de `@sirius/solicitudes`
- **Ubicación**: Sección final del formulario, antes del botón de envío
- **Obligatoriedad**: ✅ Botón "Enviar" deshabilitado sin firma confirmada
- **Almacenamiento**:
  - Frontend: captura como PNG blob
  - Backend: convierte a base64, upload a S3 vía `uploadFirmaTrabajador()`
  - Airtable: guarda referencia S3 (`Firma_S3_Key` + `Fecha_Firma_Trabajador`)
- **NO guardar**: base64 directamente en Airtable — solo la ruta S3

#### 3. Pantalla de éxito
- **Diseño**: Icono verde + título + descripción + 2 botones
- **Botones**:
  1. "Nueva solicitud" — reinicia el formulario para otra solicitud
  2. "Ver mis solicitudes" — redirige a overview de solicitudes

## Sistema de Autenticación

### Flujo de login

```
POST /api/auth/login  { cedula, password }
    ├─ escapeAirtableValue(cedula) → busca en Personal WHERE {Numero Documento}='{cedula}'
    ├─ 401 genérico si no existe (no revela si el usuario existe)
    ├─ 403 si Estado de actividad ≠ "Activo"
    ├─ 403 si Password vacío
    ├─ bcrypt.compare(password, storedHash) → 401 si falla
    ├─ Fetch Roles y Permisos/{rolId} → Nivel_Acceso (fallback "Estándar")
    ├─ signJWT({ sub, idCore, cedula, nombre, rol }, JWT_SECRET, 86400s)
    └─ Set-Cookie: sirius-auth (httpOnly, SameSite=strict, 24h, secure en prod)
```

### JWT payload

```typescript
type JWTPayload = {
  sub: string;     // Airtable record ID — SOLO para fetch tabla Personal
  idCore: string;  // "SIRIUS-PER-XXXX" — FK canónica en TODAS las demás tablas
  cedula: string;  // Número de documento
  nombre: string;  // Nombre completo
  rol: string;     // "Super Admin" | "Admin Depto" | "Avanzado" | "Estándar"
  iat: number;
  exp: number;     // iat + 86400
};
```

### ⚠️ Regla crítica de identificadores

```
payload.sub     → recXXX          → SOLO fetch tabla Personal (Nómina Core)
payload.idCore  → SIRIUS-PER-XXXX → FK en TODAS las tablas de Novedades y Gestión del Ser
payload.cedula  → número          → validaciones secundarias únicamente
```

**NUNCA usar `payload.sub` como FK fuera de la tabla Personal.**

### Lectura del JWT en route handlers

```typescript
import { cookies } from "next/headers";
import { verifyJWT } from "@/lib/auth";

const token = (await cookies()).get("sirius-auth")?.value;
const payload = token ? await verifyJWT(token, process.env.JWT_SECRET!) : null;
if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
// payload.idCore → FK Airtable
// payload.rol    → RBAC
// payload.nombre → UI
```

### Route guard — proxy.ts

`src/proxy.ts` intercepta `/dashboard/**`. Exporta `proxy` (Next.js 16, no `middleware`).
JWT inválido/ausente → redirect `/login` + borra cookie.

## Patrones Clave

### escapeAirtableValue() — obligatorio antes de interpolar en fórmulas

```typescript
const safe = escapeAirtableValue(valor); // elimina chars de control, escapa \\ y '
const formula = `{Campo}='${safe}'`;
```

### uploadFirmaTrabajador() — Upload de firmas digitales a S3

```typescript
import { uploadFirmaTrabajador } from "@/lib/s3";

// En el handler POST de solicitudes
if (body.firmaBase64) {
  const uploadResult = await uploadFirmaTrabajador({
    base64: body.firmaBase64,
    cedula: payload.cedula,
    idCore: payload.idCore,
    tipo: "permiso" | "vacaciones" | "novedades",  // tipo de solicitud
    metadata: {
      // campos relevantes del formulario para trazabilidad
      tipoPermiso: body.tipo,
      fechaSolicitud: today,
      // ...otros campos contextuales
    },
  });

  // Guardar SOLO la referencia S3 en Airtable (NO el base64)
  fields[FIELDS.XXX.FIRMA_S3_KEY] = uploadResult.s3Key;
  fields[FIELDS.XXX.FECHA_FIRMA_TRAB] = uploadResult.uploadedAt;
}
```

**Estructura S3**:

```
firmas/{permisos|vacaciones|contratos|autorizaciones}/{idCore}/{timestamp}_{cedula}.png
permisos/dias-sirianos/{año}/{mes}/{idCore}_{cedula}_{fecha}_{timestamp}.pdf
autorizaciones/{permiso|vacaciones|novedades}/{año}/{mes}/{idCore}_{recordId}_{timestamp}.pdf
```

Todo S3 key nuevo debe añadirse a `validateS3Key()` en `src/lib/s3/upload.ts`, o
`/api/documentos` lo rechazará.

⚠️ **`permisos/dias-pacto/` sigue siendo un prefijo válido de lectura.** Es el
nombre que tenía la carpeta antes de que los «días de pacto» pasaran a llamarse
**días sirianos**, y esas keys están guardadas en `PDF_Autorizacion_S3_Key` de
permisos ya emitidos: quitarlo de `validateS3Key()` y de `recursoCoincide()`
dejaría inaccesibles PDFs firmados que sí existen en el bucket. Solo se escribe
bajo `dias-sirianos/`.

### Planes de compensación de un permiso

Cuando Gestión del Ser marca un permiso como **Compensatorio**, tiene que elegir
con cuál de los tres planes lo repone el trabajador. `src/lib/compensacion.ts` es
la fuente única: define `PLANES_COMPENSACION` y traduce cada plan a la lista de
días `[{fecha, horas, descripcion}]` que ya consumían el PDF y el histórico.

| Plan | `id` | Cómo se agenda |
|------|------|----------------|
| Sábado de 7:00 a. m. a 12:00 m. | `sabado` | Jornadas de 5 h en los sábados elegidos |
| Una hora diaria hasta completar | `hora-diaria` | 1 h por día hábil (lun–vie) desde la fecha de inicio |
| Cumplir con un reto | `reto` | Una entrada: el reto pactado y su fecha límite |

Quien decide si un permiso se repone es **Gestión del Ser al autorizar**, nunca el
trabajador al radicar. El formulario de permiso no pregunta nada de esto.

1. **Al autorizar** (`ModalAutorizarSolicitud`), marcar *Compensatorio* abre el
   selector de plan. Elegirlo es **opcional**: el plan genera la tabla de días,
   que queda editable para ajustes.
2. **Si lo deja sin elegir**, el permiso queda con `Compensado = true` y
   `Plan_Compensacion` vacío. Esa combinación es la señal de "falta definir cómo
   repone" y el PDF lo dice explícitamente.
3. **El colaborador lo elige** desde `/dashboard/solicitudes`: `AvisoCompensacion`
   muestra un banner ámbar con esos permisos y `POST /api/solicitudes/permiso/compensacion`
   guarda el plan.

Las horas a reponer se derivan del permiso: las horas pedidas si fue por horas, o
`HORAS_JORNADA` (8 h) por cada día si fue por días. **El endpoint las recalcula del
registro**, nunca las toma del cliente — si no, bastaría enviar media hora para
saldar un día entero. Igual recalcula los días a partir del plan.

Dos reglas del endpoint del colaborador, ambas por la misma razón de siempre — que
tener sesión no es autorización:

- Solo el dueño (`ID Personal Core` === `payload.idCore`) y solo si el permiso está
  marcado como compensatorio. Al denegar responde **404, no 403**.
- El plan se define **una sola vez**: si ya tiene valor responde **409**. Cambiarlo
  sería rehacer un compromiso que ya quedó firmado en el documento de autorización.

#### Reemisión del documento al definir el plan

Cuando Gestión del Ser concede un permiso compensatorio sin elegir plan, el PDF
sale diciendo *"por definir"*. Si el colaborador lo elige después, el registro
cambia pero **el documento firmado se quedaría con el texto viejo** — y entonces
el único papel firmado por ambas partes certificaría un compromiso que ya no es
el real. Por eso `/api/solicitudes/permiso/compensacion` reemite el documento con
`reemitirDocumentoPermiso()` (`src/lib/documento-autorizacion.ts`).

- **Nada se borra.** La key de S3 lleva marca de tiempo, así que la versión
  anterior sigue existiendo, y el adjunto `PDF_Firmado` acumula ambas.
- El PDF reemitido **dice por qué existe**: bajo el plan aparece "Plan de
  reposición elegido por el colaborador el {fecha}, después de la autorización".
- **No bloquea.** Si falla la reemisión, el plan igual queda guardado y la
  respuesta incluye `aviso`. ⚠️ No hay reintento: como el plan se define una sola
  vez, un segundo intento choca con el 409.
- `detallesSolicitud()` vive en el mismo módulo porque la usan los dos caminos que
  emiten el PDF. Si divergieran, el mismo permiso saldría con distinto detalle en
  cada versión del documento.

### Documento oficial de autorización

Al aprobar o rechazar, `/api/solicitudes/autorizar`:

1. Sube la firma del autorizador a S3 (`firmas/autorizaciones/...`)
2. Genera el PDF con `generarPdfAutorizacion()` — sello de la decisión, detalle,
   días de compensación y las dos firmas (trabajador + autorizador)
3. Archiva el PDF en S3 (`autorizaciones/...`) y calcula su SHA-256
4. Guarda en Airtable `PDF_Autorizacion_URL` (enlace `/api/documentos/{tipo}/{recordId}`),
   `PDF_Autorizacion_S3_Key`, `Hash_Documento` y los datos del firmante aprobador
5. Adjunta el PDF y la firma a los campos Attachment vía `subirAdjuntoAirtable()`

**Nunca guardar una URL firmada de S3 en Airtable**: expiran en 5 minutos. El enlace
almacenado apunta a `/api/documentos/...`, que exige sesión y genera una URL nueva
en cada visita.

Si la generación del PDF falla, la decisión **igual se registra** y la respuesta
incluye `aviso`: perder la autorización obligaría a repetir el trámite.

🚫 **Campos heredados de solo lectura** — `Archivo_Generado` / `Nombre_Archivo`
(Solicitud_Permiso) y `Archivo` / `Nombre Archivo` (Solicitud_Vacaciones) guardan
los documentos HTML que generaba el sistema anterior en S3. **Nunca escribir en
ellos**: sobreescribirlos borra ese historial. El documento nuevo va siempre en
`PDF_Autorizacion_URL` / `PDF_Autorizacion_S3_Key`.

### Pestaña de documentos del histórico

`src/lib/documentos-solicitud.ts` unifica en una sola forma todos los archivos de
una solicitud, repartidos entre dos generaciones del sistema:

| Clase | Origen |
|-------|--------|
| `autorizacion` | `PDF_Autorizacion_URL`, `PDF_Firmado` |
| `firma` | `Firma_S3_Key`, `Firma_Autorizador_S3_Key`, `Firma_Trabajador*`, `Firma_Gestion_Ser`, `Firma_Aprobador` |
| `adjunto` | `Documentación Adicional` (novedades) |
| `heredado` | `Archivo_Generado` / `Archivo` + `Documento` |

Los archivos de S3 se sirven vía `/api/documentos/{tipo}/{recordId}/{clase}` — nunca
por su S3 key. ⚠️ Las URLs de campos Attachment las genera Airtable y **expiran en
2 horas**: la lista se reconstruye en cada carga del histórico, pero una pestaña
abierta mucho tiempo puede quedar con enlaces vencidos.

⚠️ **Tipos de fecha en Airtable** — `Fecha_Firma_Autorizador` y `Fecha_Autorizacion`
son `date` (sin hora): rechazan un ISO con hora. `Fecha_Firma_Trabajador` y
`Fecha_Firma_Aprobador` son `dateTime` y sí lo aceptan. Usar `fechaHoyBogota()`,
nunca `new Date().toISOString().split("T")[0]` (después de las 19:00 locales UTC
da el día siguiente).

### signJWT() / verifyJWT() — Web Crypto API, edge-compatible

```typescript
const token = await signJWT({ sub, idCore, cedula, nombre, rol }, JWT_SECRET);
const payload = await verifyJWT(token, JWT_SECRET); // null si inválido/expirado
```

### NavLinks — estado activo del sidebar

Client component con `usePathname()`. Activo si `pathname === href` (exacto para Inicio)
o `pathname.startsWith(href + "/")` para el resto. El layout del dashboard es server component.

### /api/me — perfil del usuario autenticado

```
GET /api/me → { nombre, cedula, idCore, rol, cargo }
cargo: Personal.Rol[0] → Roles y Permisos.Rol (nombre completo del cargo)
Si falla el fetch de cargo → retorna "" — no es bloqueante
Consumido por todos los formularios al montar (auto-llenado de campos readonly)
```

## Variables de Entorno

```bash
# Nómina Core (identidad y roles)
AIRTABLE_BASE_ID_SIRIUS_NOMINA_CORE=appQYSeZ5F8D3acu5
AIRTABLE_API_KEY_SIRIUS_NOMINA_CORE=pat...

# Novedades Nómina (solicitudes)
AIRTABLE_BASE_ID_NOVEDADES_NOMINA=appnRVYZMd4EAQoRF
AIRTABLE_API_KEY_NOVEDADES_NOMINA=pat...

# Auth
JWT_SECRET=<cadena aleatoria — generar con: openssl rand -base64 48>

# Nombres de tablas Airtable — sobreescriben los fallbacks de src/lib/airtable-schema.ts
# Útil si se renombra una tabla sin tocar código fuente
AIRTABLE_TABLE_PERSONAL=Personal
AIRTABLE_TABLE_ROLES=Roles y Permisos
AIRTABLE_TABLE_SOLICITUD_PERMISO=Solicitud_Permiso
AIRTABLE_TABLE_SOLICITUD_VACACIONES=Solicitud_Vacaciones
AIRTABLE_TABLE_NOVEDADES_NOMINA=Reportes Novedades Nomina
AIRTABLE_TABLE_ASISTENCIA=Asistencia Personal

# S3 (firmas digitales)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_FIRMAS=sirius-firmas-empleados

# Pendientes
ANTHROPIC_API_KEY=
```

## Comandos

```bash
npm run dev --webpack    # Desarrollo (no turbopack)
npm run build            # Build — correr siempre después de cambios
npm run lint             # ESLint
npx vitest run           # Tests
npx tsc --noEmit         # Type-check (ignorar errores de .next/types — caché antiguo)
```

## Reglas para Agentes de Desarrollo

1. **`npm run build` después de cada cambio** — sin excepciones
2. **No separar el monorepo** — todo bajo `src/` con App Router
3. **`escapeAirtableValue()`** siempre antes de interpolar en fórmulas Airtable
4. **`payload.idCore` como FK** — nunca `payload.sub` fuera de tabla Personal
5. **Formularios de solicitudes** — SIEMPRE incluir:
   - Nota de voz (`VoiceNoteButton`) en campos de texto largo
   - Firma digital (`FirmaCanvas`) obligatoria antes de enviar
   - Upload de firma a S3 (NO guardar base64 en Airtable)
   - Pantalla de éxito con botones "Nueva solicitud" + "Ver solicitudes"
   - Campos Airtable: `Firma_S3_Key` (text) + `Fecha_Firma_Trabajador` (date)
5. **Campos auto-llenados** — nombre, cédula, cargo, idCore nunca se piden al usuario con sesión activa
6. **Español colombiano** — UI, mensajes de error y comentarios
7. **Minimal changes** — no refactorizar lo que funciona sin pedido explícito
8. **proxy.ts** — Next.js 16: `export async function proxy()` en `src/proxy.ts`
9. **Sin hardcoding de Airtable** — nombres de tabla en `src/lib/airtable-schema.ts` (TABLES), campos en FIELDS, enums en `src/lib/constants.ts`. Nunca strings literales de tabla/campo en routes o componentes.
