import type { Empleado } from "@/models/usuarios.model";

export type Empresa = Empleado["empresa"];

/** Documento guardado en Firestore (usuarios/{uid}/jornadas/{jid}) */
export interface JornadaDoc {
    id?: string;
    userId: string;
    empresa: Empresa;
    fecha: string; // "YYYY-MM-DD"

    // horas (decimales)
    horasNormales: number;
    recargoNocturnoOrdinario: number;
    recargoFestivoDiurno: number;
    recargoFestivoNocturno: number;
    extrasDiurnas: number;
    extrasNocturnas: number;
    extrasDiurnasDominical: number;
    extrasNocturnasDominical: number;

    // valores
    valorTotalDia: number;

    // campos adicionales para detalle
    turnoId?: string;
    estado?: string;
    horaEntrada?: string;
    horaSalida?: string;
    esDominicalFestivo?: boolean;
    cruzoMedianoche?: boolean;

    // cualquier otro campo que quieras mostrar
    [key: string]: any;
}


export interface NominaRow {
    userId: string;
    nombre: string;
    hNormales: number;
    hExtras: number;
    recargosH: number;
    total$: number;
}