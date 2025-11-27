# TODO - Control de Empleados

## Completado ✅
- [x] Mostrar empleados con jornada activa como "Activa", inactivos como "Inactiva"
- [x] Ordenar empleados activos primero en la lista
- [x] Mostrar historial de jornadas con toda la información
- [x] Cambiar fotos en historial a enlaces (URLs) para ahorrar almacenamiento
- [x] Cambiar ubicaciones en historial a enlaces de Google Maps
- [x] Mantener coordenadas lat/lng visibles junto con los enlaces

## Cambios Realizados
- Modificado `ControlEmpleados.tsx` para integrar estado de jornadas activas
- Agregado ordenamiento de empleados por estado activo
- Actualizado badge de estado basado en jornadas activas
- Cambiado display de fotos y ubicaciones en historial a enlaces
- Agregado useEffect para cargar jornadas activas periódicamente
