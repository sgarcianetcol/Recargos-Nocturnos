import type { Empleado } from "@/models/usuarios.model";

export type Empresa = Empleado["empresa"];

/** Documento guardado en Firestore (usuarios/{uid}/jornadas/{jid}) */
// dentro de src/services/nomina/jornada.service.ts (reemplaza/añade campos faltantes)
export interface JornadaDoc {
  id?: string;
  userId: string;
  empresa: string | undefined;

  fecha: string; // "YYYY-MM-DD"
  turnoId: string; // "M8" | "T8" | ...

  horaEntrada: string; // "HH:mm"
  horaSalida: string; // "HH:mm"
  cruzoMedianoche: boolean;
  esDominicalFestivo: boolean;

  // ubicación guardada como "lat,lng"
  ubicacion?: string | null;

  // parámetros aplicados
  salarioBaseAplicado: number;
  horasLaboralesMesAplicadas: number;
  tarifaHoraAplicada: number;
  rulesAplicadas: {
    nightStartsAt: string;
    nightEndsAt: string;
    baseDailyHours: number;
    roundToMinutes?: number;
  };
  recargosAplicados: Record<string, number>;

  // horas (en horas decimales)
  horasNormales: number;
  horasExtras: number; // <- agregado
  recargoNocturnoOrdinario: number;
  recargoFestivoDiurno: number;
  recargoFestivoNocturno: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasDominical: number;
  extrasNocturnasDominical: number;
  totalHoras: number;

  // valores
  valorHorasNormales: number;
  valorRecargoNocturnoOrdinario: number;
  valorRecargoFestivoDiurno: number;
  valorRecargoFestivoNocturno: number;
  valorExtrasDiurnas: number;
  valorExtrasNocturnas: number;
  valorExtrasDiurnasDominical: number;
  valorExtrasNocturnasDominical: number;
  valorTotalDia: number;

  creadoEn: any; // serverTimestamp
  finalizadoEn?: any;
  estado: "calculado" | "cerrado" | string;
}

export interface NominaRow {
  userId: string;
  nombre: string;
  hNormales: number;
  hExtras: number;
  recargosH: number;
  total$: number;
}
