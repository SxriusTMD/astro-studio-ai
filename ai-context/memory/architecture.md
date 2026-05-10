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