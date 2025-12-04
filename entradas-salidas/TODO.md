# TODO: Agregar Sistema de Filtrado en Resumen de Horas

## Estado Actual

- El componente `mallaadmin.tsx` muestra un resumen de horas por empleado para el mes seleccionado.
- La sección "Resumen de Horas" lista todos los empleados con sus horas totales y un total general.

## Plan de Implementación

1. **Agregar Estados para Filtros**

   - Estado para término de búsqueda (nombre/documento)
   - Estado para rango de horas mínimo
   - Estado para rango de horas máximo
   - Estado para mostrar solo empleados con horas asignadas

2. **Crear UI de Filtros**

   - Agregar una sección de filtros arriba del resumen
   - Campos de entrada para búsqueda, min/max horas
   - Checkbox para "Mostrar solo con horas"

3. **Implementar Lógica de Filtrado**

   - Crear función para filtrar la lista de horasPorEmpleado
   - Aplicar filtros: búsqueda, rango de horas, solo con horas
   - Calcular total basado en lista filtrada

4. **Actualizar Display**
   - Mostrar lista filtrada en lugar de la completa
   - Actualizar total general con el filtrado
   - Agregar indicador de cantidad de empleados mostrados

## Archivos a Modificar

- `entradas-salidas/src/components/dashboard/Malla/mallaadmin.tsx`

## Próximos Pasos

- Implementar estados de filtros
- Crear UI de filtros
- Implementar lógica de filtrado
- Actualizar cálculos y display
