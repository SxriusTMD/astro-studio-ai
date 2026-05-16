# AeroLex AI - Core Harness Rules

1. SEGURIDAD FRONTEND: Nunca uses `innerHTML` para inyectar contenido dinámico de PDFs o de la base de datos. Usa siempre `textContent` para prevenir XSS.
2. DISEÑO VISUAL: Mantenemos el estilo "Glassmorphism". Usa siempre clases como `backdrop-blur-xl bg-opacity-20`.
3. ASSETS: El logo principal se llama `AeroLexAI_Ship_Trans.png`. No intentes cambiarlo a SVG ni modificar su extensión.
4. ENRUTAMIENTO: Para ir a "Estudiar" usamos `/student.html`. Para "Preguntas", `/quiz.html`. Evita crear rutas nuevas a menos que sea estrictamente necesario.