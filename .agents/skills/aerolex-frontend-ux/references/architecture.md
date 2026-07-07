# Arquitectura frontend

## Estado de migracion

El frontend actual sigue siendo una aplicacion educativa centrada en PDF. Es codigo legacy operativo, no la direccion futura. No agregar capacidades academicas nuevas. Retirar modulos solo mediante tareas con alcance, migracion y validacion explicitos.

## Propietarios

- `index.html`: markup, CSS global, pantallas de autenticacion, paneles, modales y dependencias CDN.
- `src/main.js`: estado global inicial, orden de inicializacion y listeners de alto nivel.
- `src/api.js`: cliente HTTP, errores por status y contratos JSON.
- `src/auth.js`: sesion visible, datos de usuario, limites y menu de cuenta.
- `src/chat.js`: flujos educativos legacy, mensajes seguros y sesiones.
- `src/ui-components.js`: PDF.js y UI legacy, ademas de sidebar, exportaciones y modales.
- `src/persistence.js`: workspace, scroll, engagement y claves de persistencia por usuario.

## Estado compartido

`src/main.js` inicializa:

- `window.pdfDocs`
- `window.activeDocId`
- `window.userLimits`
- `window.flashcardsData`
- `window.planData`
- `window.summaryData`
- `window.currentSessionId`

No reutilizar estas variables para jobs creativos con significados incompatibles. Definir contratos de migracion antes de introducir estado creator-cloud.

## Flujos delicados

### PDF

`initDragDrop()` conecta `fileInput`, botones y drop zone. `handleFile()` valida limites, extrae paginas con PDF.js, agrega el documento, actualiza preview/tabs y guarda sesion. Conservar el mismo handler para input y drop.

### Tabs

`initTabs()` controla tabs de herramientas. `renderTabs()` controla documentos PDF. Son sistemas distintos; no mezclar sus clases `active` ni sus listeners.

### Autenticacion

El `body` usa clases como `auth-checking`, `authenticated` y `unauthenticated`. La app no debe parpadear antes de que `initAuth()` determine la sesion.

### Persistencia

`PersistenceManager` agrega namespace por usuario. Evitar claves globales nuevas cuando el dato pertenece a una cuenta. No restaurar estado anonimo encima de una sesion autenticada.

## Direccion visual objetivo

- Fondo base: negro/gris profundo.
- Superficies tecnicas, paneles densos y bordes discretos.
- Acento vigente: `--accent-gold` (`#c5a880`). Variables antiguas cyan/violet apuntan al mismo lenguaje dorado por compatibilidad.
- Tipografia principal: Inter; encabezados editoriales pueden usar Playfair Display.
- Radios compactos, contraste legible y animaciones moderadas.
- Mostrar assets, colas, estados, logs y before/after reales.
- Evitar glassmorphism dominante y neon decorativo.

## Dependencias del navegador

`index.html` carga PDF.js, jsPDF, Marked, Cropper.js y Tailwind CDN. No asumir bundler ni compilacion. Si se cambia una dependencia, verificar carga, CSP/CORS y comportamiento offline/degradado.
