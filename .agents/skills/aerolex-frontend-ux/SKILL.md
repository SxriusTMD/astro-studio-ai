---
name: aerolex-frontend-ux
description: Implementa, depura y revisa el frontend de AeroLex durante la migracion desde la aplicacion educativa heredada hacia una interfaz cloud para flujos creativos 3D conectada con Axiora/SX3D. Usar para cambios en index.html y src/*.js, responsive, estado, accesibilidad, landing, dashboard de assets/jobs, progreso, outputs o retirada segura de UI PDF/estudio. No usar para decidir posicionamiento; invocar aerolex-vision-keeper y aerolex-landing-conversion-auditor cuando corresponda.
---

# AeroLex Frontend UX

## Objetivo

Modificar la interfaz sin romper el estado compartido ni los listeners mientras se reemplaza el producto educativo por flujos de assets y jobs creativos. Mantener Vanilla JavaScript con modulos ES hasta que una decision arquitectonica explicita autorice otra cosa.

## Preparar el cambio

1. Invocar `$aerolex-vision-keeper` para cualquier UI net-new o eliminacion de producto.
2. Leer `index.html`, el modulo propietario y [references/architecture.md](references/architecture.md).
3. Clasificar el cambio como estabilizacion legacy, retirada legacy o experiencia creator-cloud nueva.
4. Buscar el `id`, clase, listener y todas las escrituras al estado afectado.
5. Identificar estados: sin sesion, autenticada, vacio, upload, queued, processing, completed, failed y cancelled.
6. Mantener el cambio dentro del propietario actual salvo que exista un plan de migracion probado.

## Implementar

- Mantener `src/main.js` como orquestador de inicializacion.
- Mantener las llamadas HTTP en `src/api.js`; usar rutas relativas y `credentials: 'include'`.
- Registrar cada listener persistente una sola vez. Preferir delegacion para nodos dinamicos.
- Sincronizar DOM, estado `window.*`, sesion remota y `localStorage` cuando el flujo legacy aun use esas capas.
- Renderizar datos de usuario o Supabase con `textContent` y nodos DOM. Para contenido enriquecido de IA, reutilizar los sanitizadores de `src/chat.js`.
- No expandir chat PDF, flashcards, resumenes, examenes o planes de estudio.
- Preservar un flujo legacy solo hasta que la tarea incluya su retirada y migracion.
- Para flujos nuevos, representar asset de entrada, job, progreso, output y reimportacion/descarga.
- Mantener sidebar y paneles moviles como overlays; no deben cambiar el ancho del contenido principal.
- Preferir UI tecnica legible; evitar glassmorphism dominante, neon excesivo y decoracion SaaS generica.
- Evitar nuevas dependencias y scripts CDN salvo requisito explicito.
- No abrir `index.html` con `file://`; la aplicacion depende de Express y sesiones.

## Verificar

Leer [references/qa-checklist.md](references/qa-checklist.md) y ejecutar la matriz correspondiente. Para cambios visuales importantes, usar el navegador integrado en escritorio y 390 px.

Como minimo:

1. Ejecutar chequeo de sintaxis en cada modulo JS tocado.
2. Probar estados vacio, procesando, completado y error del flujo tocado.
3. Confirmar que navegacion, panels y scroll conservan estado.
4. Confirmar que sidebar, dropdowns y modales no empujan ni tapan contenido critico.
5. Revisar consola y red despues de cada flujo.
6. Confirmar que nombres de asset, logs y controles caben a 390 px.

## Limites

- No introducir React, Vue u otro framework.
- No duplicar estado que ya vive en `window.*` o `PersistenceManager`.
- No insertar respuestas de IA o datos remotos con `innerHTML` sin pasar por el renderer seguro existente.
- No alterar OAuth, billing, permisos o contratos API desde una correccion puramente visual.
