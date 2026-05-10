# Hard Rules — AeroLex AI

- Nunca reescribir toda la aplicación.
- Nunca romper Google OAuth.
- Nunca eliminar funcionalidades existentes.
- Nunca introducir React, Tailwind o frameworks innecesarios.
- Mantener compatibilidad con Railway.
- Mantener compatibilidad móvil.
- Mantener la temática espacial/cósmica.
- Preservar el branding AeroLex AI.
- Evitar dependencias pesadas.
- Priorizar performance en dispositivos móviles.
- Explicar siempre la causa raíz antes del fix.
- Priorizar fixes pequeños y seguros.
- Evitar código placeholder o pseudocódigo.
- Generar únicamente código listo para producción.
- No modificar endpoints existentes sin justificación.
- No alterar la estructura modular actual.

Preferencia de Dominio Naked: Prohibido generar enlaces o redirecciones hacia www.aerolexai.com. Todo el tráfico debe forzarse a https://aerolexai.com para evitar el error NET::ERR_CERT_COMMON_NAME_INVALID.

Protocolo de Rutas Relativas: Ningún archivo en src/ puede contener la cadena http://localhost:3000 en código de producción. Solo se permiten rutas relativas (/api/...).

Integridad de OAuth: Cualquier modificación en auth.js debe verificar que no se altere el redirect_uri configurado en Google Cloud Console (/auth/google/callback).