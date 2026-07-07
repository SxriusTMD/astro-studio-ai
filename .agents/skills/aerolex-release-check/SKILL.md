---
name: aerolex-release-check
description: Valida cambios de AeroLex antes de commit, push o despliegue durante la migracion del producto educativo heredado a una capa creator-cloud para Axiora/SX3D. Usar al terminar features o retiradas, preparar releases, revisar regresiones, validar landing/jobs/assets/auth o comprobar que un cambio no revive direccion PDF/estudio ni hace claims falsos.
---

# AeroLex Release Check

## Objetivo

Detectar regresiones, deriva de producto y claims no respaldados sin iniciar servicios externos innecesariamente ni modificar datos reales.

## Chequeo rapido

Desde la raiz del repositorio ejecutar:

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/aerolex-release-check/scripts/project-check.ps1
```

El script valida archivos requeridos, sintaxis JS, whitespace, URLs localhost prohibidas en `src/`, `.env`, patrones de secretos y rutas Express duplicadas. Los duplicados son warnings por compatibilidad heredada; usar `-Strict` para tratarlos como fallos.

## Flujo de release

1. Revisar `git status --short` y separar cambios ajenos.
2. Ejecutar `project-check.ps1`.
3. Leer [references/manual-matrix.md](references/manual-matrix.md) y seleccionar escenarios segun el riesgo.
4. Invocar `$aerolex-vision-keeper` para UI, copy o capacidades nuevas.
5. Para frontend, usar navegador integrado en escritorio y movil.
6. Para backend, probar status y payload con y sin sesion; no usar produccion sin autorizacion.
7. Ejecutar `git diff --check` y revisar el diff completo.
8. Reportar checks ejecutados, omitidos y riesgo residual.

## Criterios de bloqueo

Bloquear release si ocurre cualquiera:

- Error de sintaxis o carga de modulo.
- Secreto o `.env` versionado.
- Ruta privada sin autenticacion u ownership.
- Login, carga PDF, tabs o chat principal inutilizable.
- Overflow horizontal o contenido critico oculto a 390 px.
- Peticion que queda pendiente ante error de PostgreSQL, Supabase o NVIDIA.
- Cambio de contrato frontend/backend sin migrar consumidores.
- Feature creator-cloud sin owner, estado de job o manejo de fallos.
- Copy que presenta un mockup o prototipo como capacidad operativa.
- Expansion net-new de PDF, estudio, examenes o productividad IA generica.

## Precauciones

- `npm start` tiene efectos de correo en el arranque actual. Preferir chequeos estaticos; iniciar el servidor solo cuando el smoke test lo justifique.
- No marcar como aprobado un flujo Google OAuth o Cloud Pro sin una sesion y configuracion validas.
- No ocultar warnings nuevos como si fueran baseline.
