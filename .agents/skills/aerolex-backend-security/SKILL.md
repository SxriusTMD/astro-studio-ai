---
name: aerolex-backend-security
description: Implementa, depura y revisa seguridad backend durante la migracion de AeroLex desde el servidor educativo Express heredado hacia una capa cloud para Axiora/SX3D. Usar para auth, sesiones, API keys, CORS, billing, ownership, uploads firmados, jobs, workers, PostgreSQL, Supabase, secretos o retirada segura de endpoints PDF/estudio. Usar aerolex-technical-product-architect para decidir arquitectura antes de construir infraestructura nueva.
---

# AeroLex Backend Security

## Objetivo

Cambiar el backend conservando autenticacion y ownership mientras se reduce el legado educativo y se introducen contratos seguros de assets y jobs.

## Preparar el cambio

1. Invocar `$aerolex-vision-keeper` y `$aerolex-technical-product-architect` para infraestructura net-new.
2. Leer endpoint, helpers, consumidor y [references/backend-map.md](references/backend-map.md).
3. Leer [references/security-checklist.md](references/security-checklist.md).
4. Clasificar el cambio como estabilizacion, retirada legacy o creator-cloud.
5. Buscar rutas duplicadas o equivalentes antes de agregar otra.
6. Definir auth, body, status, owner, store, idempotencia y efectos secundarios.

## Implementar endpoints

- Aplicar `ensureAuthenticated` a datos y operaciones de usuario.
- Derivar identidad y plan desde `req.user` y la base de datos; nunca confiar en email, plan o owner enviados por el cliente.
- Validar tipos, campos requeridos, tamanos y valores permitidos antes de I/O externo.
- Usar SQL parametrizado y filtrar cada lectura/escritura por el usuario autenticado.
- Responder una sola vez y terminar inmediatamente despues de errores o limites.
- Mantener status coherentes: 400 entrada, 401 sin sesion, 403 sin permiso/limite, 404 recurso ajeno o inexistente, 503 dependencia no configurada.
- No cambiar contratos de `src/api.js` sin actualizar y verificar todos sus consumidores.

## Auth y sesion

- Mantener Passport y `express-session` como autoridad de sesion web.
- Mantener callback OAuth derivado de `CLIENT_URL` y `/auth/google/callback`.
- No registrar tokens, secretos, cookies ni bodies con credenciales.
- Conservar `httpOnly`; revisar `secure`, `sameSite`, `trust proxy` y CORS como una unidad.
- No usar el secreto de desarrollo como fallback en produccion.

## Legado y migracion

- PostgreSQL y Supabase actuales contienen datos educativos legacy; no tratarlos como esquema objetivo para jobs 3D.
- No agregar nuevas capacidades academicas ni acoplar jobs nuevos a `chat_sessions`.
- Tratar `pro` y `premium` como planes pagos mientras existan ambos valores.
- Preservar auth y datos existentes hasta definir migracion y retencion.
- Para jobs nuevos, derivar owner server-side, usar idempotencia y separar credenciales de usuario/worker.
- Si falla la autoridad de limites, fallar de forma explicita; no conceder uso ilimitado por accidente.
- Evitar upserts que reinicien `plan` o contadores existentes.

## Verificar

1. Ejecutar `node --check server.js` y `node --check src/supabaseClient.js`.
2. Probar sin sesion, owner correcto, owner ajeno y permisos de plan.
3. Probar dependencia ausente o fallida sin dejar la peticion pendiente.
4. Confirmar ownership intentando acceder a un id de otro usuario.
5. Revisar que logs y respuestas no expongan secretos ni SQL interno.
6. Ejecutar `$aerolex-release-check` antes de cerrar cambios amplios.

## Limites

- No leer ni editar `.env` salvo solicitud explicita.
- No iniciar el servidor solo para un chequeo de sintaxis: el arranque actual tiene efectos de correo.
- No crear una tercera fuente de verdad para identidad, billing, assets o jobs.
- No eliminar rutas paralelas heredadas sin rastrear consumidores y migrar datos.
