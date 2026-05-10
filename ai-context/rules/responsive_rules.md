# Responsive Rules — AeroLex AI

La aplicación actualmente tiene un enfoque desktop-first, pero debe evolucionar progresivamente hacia estabilidad móvil.

Reglas obligatorias:
- Evitar overflow horizontal.
- Evitar layouts que expandan el viewport.
- Los sidebars nunca deben mover el contenido principal.
- Los dropdowns deben usar posición absoluta/fixed cuando sea necesario.
- Los botones deben ser touch-friendly.
- Mantener scroll estable en móviles.
- Evitar conflictos de z-index.
- Mantener el chat como componente principal visual.
- Los módulos secundarios nunca deben desplazar el contenido crítico.
- Priorizar flexbox estable sobre animaciones complejas.
- Mantener compatibilidad con Chrome móvil y Safari iOS.
- Minimizar reflows y layout shifts.