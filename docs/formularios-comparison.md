# Comparación de Formularios de Solicitudes

## Estado Actual de los Formularios

### ✅ Formulario de Permiso
**Ruta**: `/dashboard/solicitudes/permiso`  
**Color tema**: Azul `#1a51a8`

| Funcionalidad | Estado | Descripción |
|---------------|--------|-------------|
| Campos auto-llenados | ✅ | Nombre, cédula, cargo, ID empleado |
| Tipo de permiso | ✅ | 8 opciones (incluye "Día siriano") |
| Selector de modalidad | ✅ | Por días / Por horas (máx. 4) |
| Calendario visual | ✅ | Selección múltiple de fechas |
| Días sirianos | ✅ | Validación de saldo disponible |
| Políticas visuales | ✅ | Banner informativo para días sirianos |
| Campo motivo | ✅ | Textarea obligatorio |
| **Nota de voz** | ✅ | Web Speech API español-CO |
| **Firma digital** | ✅ | Canvas obligatorio + upload S3 |
| Validación firma | ✅ | Botón enviar deshabilitado sin firma |
| Pantalla éxito | ✅ | Nueva solicitud + Ver solicitudes |

### ✅ Formulario de Vacaciones
**Ruta**: `/dashboard/solicitudes/vacaciones`  
**Color tema**: Verde `#6bb543`

| Funcionalidad | Estado | Descripción |
|---------------|--------|-------------|
| Campos auto-llenados | ✅ | Nombre, cédula, cargo, ID empleado |
| Fecha inicio | ✅ | Date picker obligatorio |
| Fecha fin | ✅ | Date picker obligatorio con min=inicio |
| Cálculo automático días | ✅ | Badge verde con días calendario |
| Fecha de reintegro | ✅ | Date picker opcional |
| Campo motivo | ✅ | Textarea opcional |
| **Nota de voz** | ✅ | Web Speech API español-CO |
| **Firma digital** | ✅ | Canvas obligatorio + upload S3 |
| Validación firma | ✅ | Botón enviar deshabilitado sin firma |
| Pantalla éxito | ✅ | Nueva solicitud + Ver solicitudes |

### ✅ Formulario de Novedades
**Ruta**: `/dashboard/solicitudes/novedades`  
**Color tema**: Naranja `#e07b39`

| Funcionalidad | Estado | Descripción |
|---------------|--------|-------------|
| Campos auto-llenados | ✅ | Auto desde `/api/me` |
| Tipo de novedad | ✅ | 7 opciones |
| Descripción | ✅ | Textarea obligatorio |
| Número horas extras | ✅ | Solo si tipo = "Horas Extra" |
| **Nota de voz** | ✅ | Web Speech API español-CO |
| **Firma digital** | ➖ | No aplica (reporte informativo) |
| Validación firma | ➖ | No aplica |
| Pantalla éxito | ✅ | "Reportar otra" + "Ver solicitudes" |

---

## Características Comunes (Patrón Establecido)

### 🔐 Autenticación y Datos del Usuario

Todos los formularios cargan datos del usuario desde `/api/me`:

```typescript
useEffect(() => {
  fetch(`${apiBasePath}/api/me`)
    .then((r) => r.json())
    .then(setMe);
}, [apiBasePath]);
```

**Campos readonly mostrados:**
- Nombre completo
- Cédula
- Cargo (desde Airtable: `Roles y Permisos.Rol`)
- ID empleado (`SIRIUS-PER-XXXX`)

### 🎤 Nota de Voz

**Componente**: `VoiceNoteButton`

**Integración estándar:**
```tsx
<VoiceNoteButton
  onTranscript={(transcript) => {
    setCampoTexto((prev) => (prev ? `${prev} ${transcript}` : transcript));
  }}
  disabled={loading}
/>
```

**Ubicación**: Encima del campo de texto largo (motivo, descripción, comentario)

### ✍️ Firma Digital

**Componente**: `FirmaCanvas`

**Integración estándar:**
```tsx
{!firmaConfirmada ? (
  <FirmaCanvas
    onFirmaCapturada={(blob) => {
      setFirmaBlob(blob);
      setFirmaConfirmada(true);
    }}
    onLimpiar={() => {
      setFirmaBlob(null);
      setFirmaConfirmada(false);
    }}
  />
) : (
  <div>Firma capturada correctamente + Volver a firmar</div>
)}
```

**Ubicación**: Sección final antes del botón de envío

### 📤 Upload a S3

**Backend estándar:**
```typescript
if (body.firmaBase64) {
  const uploadResult = await uploadFirmaTrabajador({
    base64: body.firmaBase64,
    cedula: payload.cedula,
    idCore: payload.idCore,
    tipo: "permiso" | "vacaciones" | "novedades",
    metadata: { /* campos relevantes del formulario */ },
  });

  fields[FIELDS.XXX.FIRMA_S3_KEY] = uploadResult.s3Key;
  fields[FIELDS.XXX.FECHA_FIRMA_TRAB] = uploadResult.uploadedAt;
}
```

### ✅ Pantalla de Éxito

**Diseño estándar:**
- Icono verde de confirmación
- Título: "Solicitud enviada"
- Descripción contextual
- **Dos botones:**
  1. "Nueva solicitud" (gris, borde)
  2. "Ver mis solicitudes" (color tema del módulo)

---

## Estado de Airtable

### Tabla: Solicitud_Permiso

| Campo | Tipo | Estado |
|-------|------|--------|
| `Firma_S3_Key` | singleLineText | ✅ Existe |
| `Fecha_Firma_Trabajador` | date | ✅ Existe |

### Tabla: Solicitud_Vacaciones

| Campo | Tipo | Estado |
|-------|------|--------|
| `Firma_S3_Key` | singleLineText | ⚠️ **Agregar** |
| `Fecha_Firma_Trabajador` | date | ⚠️ **Agregar** |

### Tabla: Reportes Novedades Nomina

| Campo | Tipo | Estado |
|-------|------|--------|
| `Firma_S3_Key` | singleLineText | ➖ No aplica |
| `Fecha_Firma_Trabajador` | date | ➖ No aplica |

**Nota**: Los reportes de novedades son informativos y no requieren firma digital.

---

## Tareas Pendientes

### ⚠️ Alta Prioridad

- [ ] **Airtable**: Agregar campos `Firma_S3_Key` y `Fecha_Firma_Trabajador` en tabla `Solicitud_Vacaciones`
- [ ] **Testing**: Verificar upload S3 de firmas en vacaciones
- [ ] **Testing**: Verificar nota de voz en formulario de novedades

### 💡 Mejoras Futuras

- [ ] Mostrar preview de la firma antes de confirmar
- [ ] Endpoint `/api/firmas/:id` para visualizar firmas guardadas
- [ ] Mostrar firma en el overview de solicitudes
- [ ] Permitir descargar firma como PNG
- [ ] Integración con Claude API para mejorar transcripción de notas de voz
- [ ] Agregar calendario visual en formulario de vacaciones (similar a permisos)

---

## Matriz de Funcionalidades

|  | Permiso | Vacaciones | Novedades |
|--|---------|------------|-----------|
| **Auto-llenado** | ✅ | ✅ | ✅ |
| **Nota de voz** | ✅ | ✅ | ✅ |
| **Firma digital** | ✅ | ✅ | ➖ No aplica |
| **Upload S3** | ✅ | ✅ | ➖ No aplica |
| **Validación firma** | ✅ | ✅ | ➖ No aplica |
| **Pantalla éxito completa** | ✅ | ✅ | ✅ |
| **Calendario visual** | ✅ | ❌ | N/A |
| **Cálculo automático** | ✅ (días sirianos) | ✅ (días calendario) | N/A |
| **Campos Airtable** | ✅ | ⚠️ Pendiente | ➖ No aplica |

---

## Guía de Implementación para Nuevo Formulario

Al crear un nuevo formulario de solicitud, seguir este checklist:

### 1. Frontend

- [ ] Importar `VoiceNoteButton` y `FirmaCanvas`
- [ ] Agregar estados `firmaBlob` y `firmaConfirmada`
- [ ] Cargar datos de usuario con `useEffect(() => fetch("/api/me"))`
- [ ] Mostrar campos readonly: nombre, cédula, cargo, ID
- [ ] Integrar `VoiceNoteButton` encima del campo de texto largo
- [ ] Agregar sección "Firma del trabajador" con `FirmaCanvas`
- [ ] Validar firma antes de envío: `disabled={!firmaConfirmada}`
- [ ] Convertir `firmaBlob` a base64 en `handleSubmit`
- [ ] Pantalla de éxito con dos botones

### 2. Backend

- [ ] Importar `uploadFirmaTrabajador` de `@/lib/s3`
- [ ] Procesar `body.firmaBase64` si existe
- [ ] Llamar `uploadFirmaTrabajador` con `tipo` y `metadata`
- [ ] Guardar `uploadResult.s3Key` y `uploadResult.uploadedAt` en Airtable
- [ ] Manejo de errores en catch

### 3. Schema

- [ ] Agregar `FIRMA_S3_KEY` en `FIELDS.NUEVA_TABLA`
- [ ] Agregar `FECHA_FIRMA_TRAB` en `FIELDS.NUEVA_TABLA`

### 4. Airtable

- [ ] Crear campo `Firma_S3_Key` tipo Single line text
- [ ] Crear campo `Fecha_Firma_Trabajador` tipo Date (con hora)

### 5. Documentación

- [ ] Crear archivo en `docs/` explicando las funcionalidades
- [ ] Actualizar memoria de proyecto
- [ ] Agregar a `MEMORY.md`

---

**Última actualización**: 2026-07-07  
**Mantenido por**: Claude Code (Sonnet 4.5)
