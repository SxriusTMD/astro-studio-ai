# Checklist de seguridad backend

## Autenticacion y autorizacion

- Ruta privada protegida con `ensureAuthenticated`.
- Identidad tomada de `req.user`, no de `req.body`.
- Consulta filtrada por owner en SELECT, UPDATE y DELETE.
- Recurso de otro usuario responde 404 o 403 sin revelar existencia.

## Entrada y salida

- Validar campos requeridos y tipos.
- Limitar texto PDF, prompts, nombres y arrays antes de enviarlos a IA o DB.
- No devolver stack traces, tokens ni detalles de proveedor.
- Mantener JSON estable para `src/api.js`.

## SQL y Supabase

- Usar placeholders PostgreSQL para todo dato externo.
- No interpolar nombres de columna salvo allowlist cerrada.
- En Supabase, aplicar `.eq()` por email autenticado en cada recurso de usuario.
- Preservar plan y contadores durante sync/upsert.

## IA y cuotas

- Consultar limite server-side antes de NVIDIA.
- Responder 403 con codigo estable al exceder limite.
- Incrementar solo tras exito del proveedor.
- Evitar doble incremento entre endpoint de IA y `/api/user/increment`.
- Definir timeout/reintentos y devolver error final sin dejar conexion abierta.

Estas reglas aplican al legado mientras exista; no reutilizar contadores de chat como billing de jobs.

## Assets y jobs creator-cloud

- Upload/download mediante URLs firmadas de corta duracion.
- Owner derivado de sesion o API key verificada.
- `job_id` opaco, idempotency key y transiciones de estado validas.
- Tokens de worker separados de API keys de usuario.
- Limites de tamano, tipo, duracion, reintentos, coste y retencion.
- Output enlazado al job y al input fuente.
- Errores sanitizados; logs internos sin URLs firmadas ni tokens.

## Sesion, cookies y CORS

- Produccion: cookie `secure`, `httpOnly` y `sameSite` compatible con el origen real.
- `trust proxy` habilitado para Railway antes de depender de cookies seguras.
- CORS permite solo origenes conocidos y credenciales.
- Callback OAuth coincide exactamente con `CLIENT_URL` configurado.

## Secretos y logs

- `.env` no esta versionado.
- Ninguna credencial esta hardcodeada.
- Logs no contienen password, reset token, OAuth token, cookie ni API key.
- Mensajes de configuracion solo indican presencia/ausencia.

## Efectos de arranque

El servidor verifica SMTP y actualmente intenta enviar un correo de salud al iniciar. No ejecutar `npm start` durante validaciones silenciosas sin considerar ese efecto externo.
