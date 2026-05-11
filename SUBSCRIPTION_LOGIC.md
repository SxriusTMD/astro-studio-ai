# Arquitectura de Suscripciones (Subscription Logic)

Este documento detalla el esquema mental técnico del flujo que rige la intercepción de límites de uso y la presentación del modal de Upgrade (Suscripción a planes premium).

## 1. Intercepción Inicial de Métricas (Hydration)

Durante el inicio de la aplicación, el frontend se comunica con el backend para recuperar el estado de uso del usuario actual.

1. **Petición**: El frontend ejecuta `fetchUserLimits()` contra el endpoint `GET /api/user/limits`.
2. **Respuesta (Payload)**:
   ```json
   {
     "google_id": "...",
     "plan": "free",
     "chat_used": 10,
     "exam_used": 3,
     "chat_limit": 10,
     "exam_limit": 3,
     "pdf_limit": 3
   }
   ```
3. **Persistencia de Estado**: El payload devuelto se asigna al objeto global `window.userLimits` para poder evaluar las restricciones localmente en cada interacción sin latencia de red adicional.

## 2. Intercepción Síncrona de Acciones Críticas

En cada acción sujeta a monetización (por ejemplo, el envío de un chat o la generación de un examen), el handler del evento del DOM validará los límites síncronamente antes de realizar cualquier llamada a la API de generación (como `POST /api/chat`).

**Flujo de Validación (Ejemplo en `handleChat`):**
1. El usuario interactúa con la UI (Submit en chat, Clic en "Iniciar Examen").
2. Se evalúa la regla de bloqueo estricto:
   ```javascript
   // Ejemplo: Bloqueo de chat
   if (window.userLimits && window.userLimits.plan !== 'premium') {
     if (window.userLimits.chat_used >= window.userLimits.chat_limit) {
       // Detener la acción
       showUpgradeModal('chat');
       return; 
     }
   }
   ```
3. Si el chequeo pasa, la acción continúa, y a la vuelta (cuando el backend actualice el límite con la nueva acción generada), `window.userLimits.chat_used` se incrementa para reflejar el estado más reciente.

## 3. Disparo del Modal de Upgrade (Manipulación del DOM)

Si la lógica de bloqueo anterior se activa, la ejecución se deriva a la función global `showUpgradeModal(feature)`.

**Lógica de DOM para el Modal:**
1. Seleccionar el elemento raíz del modal en el HTML: 
   ```javascript
   const upgradeModal = document.getElementById('upgradeModal');
   ```
2. **Inyección Dinámica de Contexto**: Dependiendo del parámetro `feature` (`'chat'`, `'exam'`, `'pdf'`), se actualiza el texto interno del modal para informar qué límite exacto se sobrepasó.
3. **Visibilidad**:
   ```javascript
   // Remover la clase que oculta el modal
   upgradeModal.classList.remove('hidden');
   ```
4. **Acción de Cierre**: El botón de "Cancelar" o el overlay (fondo oscuro) cuenta con un event listener que ejecuta `upgradeModal.classList.add('hidden')`.
5. **Acción Principal**: El botón de "Actualizar Plan" (Upgrade) ejecutará la redirección hacia la pasarela de pagos (ej. Stripe Checkout) o abrirá un iframe de pagos directamente.
