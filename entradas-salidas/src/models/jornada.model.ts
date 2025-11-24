import type { Empleado } from "@/models/usuarios.model";

export type Empresa = Empleado["empresa"];

/** Documento guardado en Firestore (usuarios/{uid}/jornadas/{jid}) */
// dentro de src/services/nomina/jornada.service.ts (reemplaza/añade campos faltantes)
export interface JornadaDoc {
  id?: string;
  userId: string;
  empresa: Empleado["empresa"];

  fecha: string; // "YYYY-MM-DD"
  turnoId: string; // "M8" | "T8" | ...
  finalizadoEn?: any;
  horaEntrada: string; // "HH:mm"
  horaSalida: string; // "HH:mm"
  cruzoMedianoche: boolean;
  esDominicalFestivo: boolean;

  ubicacion?: string | null; // ✅ aquí se guarda "lat,lng"

  // Horas reales (opcionales, para jornadas automáticas)
  horaInicioReal?: any;
  horaFinReal?: any;
  ubicacionInicio?: { lat: number; lng: number };
  ubicacionFin?: { lat: number; lng: number };
  historial?: Array<{
    fecha: string;
    accion: string;
    hora: string;
    ubicacion: { lat: number; lng: number };
    duracion?: number;
  }>;
  activo?: boolean;

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
  recargoNocturnoOrdinario: number;
  recargoFestivoDiurno: number;
  recargoFestivoNocturno: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasDominical: number;
  extrasNocturnasDominical: number;
  horasExtras: number;
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
  estado: "calculado" | "cerrado" | "pendiente";
}

export interface NominaRow {
  userId: string;
  nombre: string;
  hNormales: number;
  hExtras: number;
  recargosH: number;
  total$: number;

  salarioBaseMensual?: number;
  valorHora?: number;
  hExtrasDiurnas: number;
  hExtrasNocturnas: number;
  hDominicales: number;
  bonificaciones?: number;
  deducciones?: number;
  neto?: number;

  // Detailed breakdowns
  recargoNocturnoOrdinario: number;
  recargoFestivoDiurno: number;
  recargoFestivoNocturno: number;
  extrasDiurnas: number;
  extrasNocturnas: number;
  extrasDiurnasDominical: number;
  extrasNocturnasDominical: number;
  totalHoras: number;
}

// utils/time.ts (o al inicio del archivo)
export const toHHMM = (d?: Date | null) => {
  if (!d) return null;
  return d.toLocaleTimeString("es-CO", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
};
