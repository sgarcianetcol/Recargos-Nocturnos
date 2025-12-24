m # TODO: Weekly Overtime Calculation Implementation

## Current Status

- [x] Analyzed existing code and understood requirements
- [x] Confirmed plan with user

## Pending Tasks

### 1. Model Updates

- [ ] Add `calculoSemanalActivo?: boolean;` to Empleado interface in usuarios.model.ts
- [ ] Modify TurnoInput interface to include `horasAcumuladasSemana: number;`

### 2. Calculation Service Updates

- [ ] Update `calcularDiaBasico` function to accept new parameter and implement chronological logic
- [ ] Implement minute-by-minute processing when weekly calculation is active
- [ ] Process shift chronologically, checking accumulated hours against 44-hour threshold (2640 minutes)

### 3. Admin Configuration Updates

- [ ] Add toggle in configuracionAdmin.tsx for weekly calculation per employee
- [ ] Update user creation/editing forms to include the new field

### 4. Service Integration

- [ ] Update jornada.service.ts calls to `calcularDiaBasico` to pass accumulated weekly hours
- [ ] Implement logic to calculate accumulated weekly hours before calling calculation service

### 5. Testing and Verification

- [ ] Test with example scenarios (like Domingo 23 case)
- [ ] Verify chronological fragmentation works correctly
- [ ] Ensure backward compatibility with existing calculations

## Notes

- Threshold: 44 hours = 2640 minutes
- When weekly calculation is active, process shift minute by minute
- Fragment single shift into multiple concepts (Recargos/Extras) chronologically
- Current `recargosActivos` field already controls extras calculation correctly
