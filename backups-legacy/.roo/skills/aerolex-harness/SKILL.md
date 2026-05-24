---
name: aerolex-harness
description: Normas obligatorias de arquitectura, seguridad y desarrollo para AeroLex AI en Antigravity IDE.
---

# AeroLex AI - Core Harness & Engineering Rules

Este harness consolida las reglas críticas de desarrollo, seguridad y diseño para el proyecto AeroLex AI. Debe ser leído y respetado por el modelo en cada interacción.

## 1. Stack Tecnológico y Arquitectura
- **Frontend:** 100% Vanilla JavaScript (ES6+), HTML5, CSS3.
  - *PROHIBIDO:* React, Vue, Tailwind CDN (en producción), o cualquier framework pesado de JS.
  - *Diseño UI/UX:* Estilo Glassmorphism moderno (`backdrop-blur-xl`, `bg-slate-900/40`, bordes sutiles y acentos de luces neón).
- **Backend:** Node.js + Express.
  - Endpoints limpios y modulares. Validación de datos estricta en el body.
  - Códigos HTTP semánticos (400 para mal formato, 500/503 para caídas de servicios externos).
- **Base de Datos:** PostgreSQL gestionado en Railway + Cliente de Supabase.
  - La URL de inicialización debe ser la raíz pura sin barras diagonales ni subrutas al final (`https://xyz.supabase.co`).

## 2. Reglas de Oro de Seguridad (CRÍTICO)
- **Protección Anti-XSS:** Queda estrictamente **PROHIBIDO** el uso de `innerHTML`, `outerHTML` o `document.write` con datos dinámicos o del usuario.
  - *Métodos Permitidos:* `textContent`, `document.createElement`, `replaceChildren()`, `classList` y manipulación nativa segura.
- **Protección de API Keys & Secretos:** Nunca escribas credenciales "hardcodeadas" en los archivos de código fuente. Usa siempre `process.env` y variables de entorno del archivo `.env`. Asegúrate de que el archivo `.env` esté en `.gitignore`.

## 3. Estabilidad Móvil y Responsive
- **Enfoque Mobile-First:** Estabilidad total en viewports de 390px (iPhone 12/13/14).
- **Evitar Desplazamientos:**
  - Los sidebars deben ser un overlay absoluto (`position: absolute` o `fixed`) y nunca mover o empujar el contenido principal.
  - Evitar a toda costa el scroll u overflow horizontal en móviles.
  - Minimizar reflows, conflictos de `z-index` y layout shifts (CLS).

## 4. Branding y Enrutamiento Estricto
- **Identidad Visual:** El logo principal es `AeroLexAI_Ship_Trans.png`. No cambies su extensión ni uses SVGs en su lugar. Mantén la temática espacial/cósmica.
- **Protocolo de Dominio:** Todo el tráfico debe forzarse a `https://aerolexai.com` (Naked Domain). Prohibido redireccionar a `www.aerolexai.com` para evitar errores SSL.
- **Enrutamiento:**
  - Secciones principales: `/student.html` para estudiar, `/quiz.html` para preguntas y exámenes.
  - Evita crear rutas nuevas a menos que sea estrictamente necesario.
- **Rutas Relativas:** Ningún archivo en `src/` debe contener la cadena `http://localhost:3000` en producción. Usa siempre rutas relativas (`/api/...`).

