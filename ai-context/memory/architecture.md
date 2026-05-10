# Frontend Architecture — AeroLex AI

main.js:
- entry point principal
- inicialización global
- DOMContentLoaded
- event listeners principales

api.js:
- centraliza 17 endpoints
- comunicación frontend/backend
- requests hacia Express

auth.js:
- autenticación Google OAuth
- manejo de sesión
- almacenamiento de usuario
- upgrade modal

chat.js:
- lógica principal de interacción IA
- sesiones
- mensajes
- flashcards
- resúmenes
- exámenes

ui-components.js:
- estrellas y efectos visuales
- sidebar
- export PDF
- tabs
- drag/drop
- librería

Arquitectura actual:
Frontend modular sin frameworks.
Optimizado para rapidez y control total del DOM.

Estrategia de Hidratación: El main.js debe actuar como orquestador. Al cargar, debe consultar el localStorage para el last_active_module y disparar la función correspondiente en ui-components.js.

Control de Race Conditions: Al restaurar una sesión de chat, se debe asegurar que el PDF esté cargado en el visor local antes de intentar enviar el primer prompt de contexto.

Persistencia de Estado Local:
 localStorage.getItem('aerolex_active_doc'): Recupera el ID del último documento activo.
 localStorage.getItem('aerolex_active_tab'): Recupera la pestaña activa (Chat, Flashcards, etc.).