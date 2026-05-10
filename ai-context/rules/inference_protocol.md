# Protocolo de Inferencia Pre-Acción
Antes de proponer cualquier cambio, el agente DEBE realizar:
1. **Análisis de Dependencias**: Identificar qué módulos de `src/` se verán afectados.
2. **Chequeo de Mobile-First**: Verificar si el cambio rompe el layout en viewports de 390px (iPhone 12/13/14).
3. **Verificación de Performance**: Estimar el impacto en el tiempo de carga. Si el JS del cliente aumenta >10KB, se requiere justificación.
4. **Validación de CORS**: Confirmar que los headers de Express en `server.js` permiten la petición desde el origen actual.