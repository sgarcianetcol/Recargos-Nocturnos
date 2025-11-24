// src/models/nomina/config.model.ts
export interface NominaConfig {
  horasLaboralesMes: number; // p.ej. 240 o 192 (elige una)
}

export interface RecargosConfig {
  recargo_nocturno_ordinario: number; // 0.35
  recargo_festivo_diurno: number; // 0.80
  recargo_festivo_nocturno: number; // 1.15
  extra_diurna: number; // 1.25
  extra_nocturna: number; // 1.75
  extra_diurna_dominical: number; // 2.05
  extra_nocturna_dominical: number; // 2.55
  fixedRecargoValue?: number; // Optional fixed value for recargo nocturno
}

export interface TurnoBase {
  id: string; // ej. "M8", "T8", "N8", "D12", "N12"
  nombre: string; // opcional: "Mañana 8h", "Tarde 8h"
  horaEntrada: string; // formato "HH:mm"
  horaSalida: string; // formato "HH:mm"
  duracionHoras: number; // se calcula automáticamente (puede cruzar medianoche)
  descripcion?: string; // texto adicional si quieres
  ubicacion?: string;
}

export interface JornadaRules {
  nightStartsAt: string; // "21:00"
  nightEndsAt: string; // "06:00"
  baseDailyHours: number; // 8
  roundToMinutes?: number;
}
