# Current Critical Bug — AeroLex AI

Problema:
El bloque desplegable/sidebar desplaza el contenido principal de la aplicación.

Efectos:
- mueve el chat
- desplaza flashcards
- rompe el layout principal
- genera mala UX móvil y desktop

Comportamiento esperado:
El sidebar/dropdown debe superponerse al contenido principal sin alterar el layout base.

Restricciones:
- no romper diseño espacial
- no reescribir arquitectura
- mantener animaciones actuales
- preservar flexbox principal

Prioridad:
CRÍTICA