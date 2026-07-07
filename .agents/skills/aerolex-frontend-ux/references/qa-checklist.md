# Checklist frontend

## Viewports

- Escritorio: 1440 x 900.
- Movil principal: 390 x 844.
- Confirmar ausencia de overflow horizontal en ambos.

## Estabilizacion legacy

1. Sin sesion: login visible, app no interactuable por debajo.
2. Con sesion y sin PDF: drop zone completa, tabs estables, sidebar utilizable.
3. Procesando PDF: progreso visible y controles sin doble envio.
4. Con PDF: preview acotado, tabs visibles y panel activo ocupando el espacio restante.
5. Varias tabs PDF: seleccion y cierre no pierden el documento activo.
6. Chat: Enter y boton envian una sola vez; error 401/403/500 no congela controles.
7. Flashcards, resumen, examen y plan: loading, exito, error y restauracion.
8. Sidebar, historial, biblioteca, cuenta y modales: overlay, Escape/cierre disponible y z-index coherente.
9. Free/Pro: limites y shortcuts Cloud aparecen solo donde corresponde.

No usar esta lista para justificar nuevas funciones academicas. Solo previene regresiones durante la migracion.

## Experiencia creator-cloud

1. Landing explica audiencia, input y output en el primer viewport.
2. Upload grande usa flujo previsto y no bloquea la UI.
3. Job muestra `queued`, `processing`, `completed`, `failed` y `cancelled` cuando apliquen.
4. Refresh restaura el job sin crear duplicados.
5. Output pertenece al usuario y enlaza al input original.
6. Acciones de descarga/reimportacion solo aparecen con output valido.
7. Mockups y prototipos no se presentan como procesamiento real.
8. Nombres de assets, errores y logs largos no rompen layout.

## Seguridad de render

- Usar `textContent` para nombre, email, titulo, archivo y datos remotos simples.
- Usar `appendSafeHTML`, `formatMessageHTML` o renderers existentes para respuesta enriquecida.
- No interpolar datos remotos directamente en atributos o `innerHTML`.

## Regresion visual

- Header totalmente visible.
- Drop zone no cortada.
- Sidebar movil no desplaza el main.
- Panels activos conservan layout y scroll.
- Inputs y botones no cambian dimensiones al cargar contenido.
- Textos largos hacen wrap o ellipsis sin tapar controles.
