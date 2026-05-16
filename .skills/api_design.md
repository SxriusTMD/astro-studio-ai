# Skill: API Design Principles
- Usa siempre métodos HTTP correctos (GET para leer, POST para crear).
- Responde siempre con la estructura: `{ success: boolean, data: any, error: string }`.
- Incluye bloques `try/catch` en todos los controladores. 