# TODO - Implementar Alerta de Permisos para Jornada

## Tareas Completadas

- [x] Agregar estado `tipoAccionPermiso` para rastrear la acción intentada
- [x] Modificar función `verificarPermisos` para mostrar diálogo cuando permisos están denegados
- [x] Remover función `solicitarPermisoAutomatico` innecesaria
- [x] Agregar diálogo de permisos en la sección de render con mensaje claro

## Descripción de Cambios

- Se agregó un diálogo modal que aparece cuando el empleado intenta iniciar o finalizar jornada y tiene la cámara o ubicación desactivada.
- El diálogo informa al empleado que debe activar el permiso correspondiente en la configuración del navegador para proceder.
- El diálogo se muestra con un título "Permiso Requerido" y una descripción específica según el permiso faltante (cámara o ubicación) y la acción (iniciar o finalizar jornada).
- El botón de acción es "Entendido" para cerrar el diálogo.

## Archivos Modificados

- `entradas-salidas/src/components/dashboard/empleado/iniciojornada.tsx`

## Pruebas Pendientes

- Verificar que el diálogo aparezca correctamente cuando se intenta iniciar jornada sin permisos de cámara o ubicación.
- Verificar que el diálogo aparezca correctamente cuando se intenta finalizar jornada sin permisos de cámara o ubicación.
- Confirmar que el diálogo no impide otras funcionalidades de la aplicación.
