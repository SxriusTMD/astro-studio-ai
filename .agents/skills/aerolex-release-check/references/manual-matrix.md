# Matriz manual de release

## Elegir alcance

- Estabilizacion legacy: ejecutar solo regresiones necesarias mientras ese flujo siga publicado.
- Retirada legacy: validar ausencia, migracion de datos, enlaces, rollback y consumidores.
- Creator-cloud: validar landing, assets, jobs, progreso, outputs y conexion Axiora/SX3D.

## Auth

- Sin sesion: login visible y APIs privadas devuelven 401.
- Google OAuth: inicio, callback, `/api/me` y logout.
- Correo: registro, verificacion, login y errores de credenciales.
- Cookie: persiste tras reload y se elimina al cerrar sesion.

## PDF y estudio

- Cargar por selector y drag and drop.
- Rechazar archivo invalido sin perder estado.
- Preview, paginas y tabs correctas con texto largo.
- Chat responde y recupera controles tras 403/500.
- Flashcards, resumen, examen multiple choice y plan muestran loading, resultado y restauracion.
- Exportaciones solo se habilitan cuando existe contenido.

Esta seccion es exclusivamente de regresion temporal. No representa el producto objetivo.

## Creator-cloud

- Propuesta, audiencia, input y output claros.
- Upload grande no atraviesa el proceso web principal cuando el flujo ya es real.
- Job no se duplica tras doble click, retry o refresh.
- Estados y transiciones coinciden con el contrato.
- Cancelacion y fallo recuperan controles.
- Output pertenece al owner y enlaza a su input/job.
- URL firmada expira y no aparece en logs.
- Mock, prototipo y produccion estan etiquetados honestamente.
- Integracion con Axiora/SX3D se demuestra o se marca como futura.

## Persistencia

- Crear, recargar, cambiar y borrar sesion propia.
- Restaurar documento activo y tab activa sin race condition.
- Biblioteca PostgreSQL respeta owner.
- Cloud Pro guarda y restaura solo documentos del email autenticado.
- Usuario free no ve ni puede usar persistencia Pro.

## Responsive y accesibilidad

- 1440 x 900 y 390 x 844 sin overflow horizontal.
- Header, drop zone, tabs, chat input y footer visibles.
- Sidebar y overlays no desplazan el contenido principal.
- Focus visible, controles con nombre accesible y targets tactiles suficientes.
- Texto largo no tapa iconos ni botones.

## Backend

- 400 para payload invalido.
- 401 sin sesion.
- 403 para limite o plan insuficiente.
- 404 para recurso inexistente/ajeno.
- 503 para dependencia requerida no configurada.
- PostgreSQL, Supabase o NVIDIA fallidos no dejan requests pendientes.

## Consola y red

- No hay errores JS nuevos.
- No hay requests duplicados al hacer un solo click.
- No se envian credenciales en query strings ni logs.
- Respuestas grandes no exponen texto o documentos de otro usuario.
