# Mapa backend

## Estado de migracion

`server.js` es el backend educativo heredado. Sus tablas y rutas deben mantenerse seguras mientras se retiran, pero no definen la arquitectura creator-cloud. Toda infraestructura nueva requiere un contrato aprobado por `$aerolex-technical-product-architect`.

## Runtime

- `server.js`: Express, CORS, sesiones, Passport, correo, PostgreSQL, NVIDIA y rutas.
- `src/supabaseClient.js`: cliente Supabase opcional desde variables de entorno.
- `src/api.js`: contratos consumidos por el frontend.

## Identidad

La sesion serializa un usuario con `id`, `displayName`, `email` y `photo`. `id` es el identificador Google o el identificador asignado al login por correo. Para ownership PostgreSQL, las rutas usan `req.user.id`; para Supabase, usan `req.user.email`.

## PostgreSQL

- `usuarios`: identidad local, auth por correo, plan y contadores historicos.
- `documentos`: biblioteca local enlazada por `usuario_id`.
- `chat_sessions`: mensajes, PDFs, flashcards, resumen, examen y plan por `google_id`.
- `sesiones_chat`: tabla heredada; no asumir que reemplaza `chat_sessions`.

## Supabase

- `users`: `email`, `name`, `plan`, `chat_count` y actividad.
- `documents`: `user_email`, `file_name`, `extracted_text`, `summary`, `created_at`.

Supabase es la autoridad legacy para limite de chat y documentos Cloud Pro. PostgreSQL sigue requerido por sesiones y biblioteca actuales.

## Limites objetivo

- Control plane: identidad, API keys, billing, jobs y metadatos.
- Object storage: inputs/outputs grandes mediante URLs firmadas.
- Worker plane: procesamiento aislado.
- Canal de progreso: tecnologia elegida segun fase y evidencia.

No almacenar assets grandes en tablas ni enviarlos por el proceso web principal.

## Familias API

- Auth: `/auth/*`, `/api/auth/*`, `/api/me`.
- Cuenta y limites: `/api/user/*`.
- Actividad/leaderboard: `/api/supabase/*`.
- IA: `/api/chat`, `/api/flashcards`, `/api/resumen`, `/api/exam`, `/api/examen`, `/api/plan`.
- Cloud Pro: `/api/documents`.
- Biblioteca PostgreSQL: `/api/documentos*`.
- Sesiones: `/api/sessions*`.

## Compatibilidad heredada

- Existen `/api/exam` y `/api/examen` con payloads distintos.
- Existen `/api/documents` y `/api/documentos*` con stores distintos.
- Actualmente hay mas de una declaracion de `POST /api/user/increment`; tratarla como riesgo conocido y no copiar el patron.

Antes de consolidar una ruta, buscar consumidores en `src/api.js`, migrar datos si aplica y mantener una ventana de compatibilidad.

## Variables de entorno

El runtime usa `DATABASE_URL`, `SESSION_SECRET`, `CLIENT_URL`, `NODE_ENV`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `NVIDIA_API_KEY`, `EMAIL_USER`, `EMAIL_PASS` y `BREVO_API_KEY`.

No registrar valores. Validar presencia con booleanos o mensajes genericos.
