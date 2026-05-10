# Database Memory — AeroLex AI

Base de datos:
PostgreSQL

Tabla usuarios:
Responsable de:
- Google OAuth
- google_id
- correo
- estado premium/free

Tabla documentos:
Responsable de:
- librería de PDFs
- persistencia de documentos
- metadatos

Tabla sesiones_chat:
Responsable de:
- historial
- flashcards
- resultados de exámenes

Optimizaciones necesarias:
- índices por usuario_id
- relaciones cascade delete
- separación futura de flashcards/exámenes

Prioridad:
Mantener consultas rápidas para dispositivos móviles.