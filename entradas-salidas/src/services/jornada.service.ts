// src/services/nomina/jornada.service.ts
import { db } from "@/lib/firebase";
import {
    addDoc,
    collection,
    collectionGroup,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    where,
} from "firebase/firestore";

import type { Empleado } from "@/models/usuarios.model";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { esDominicalOFestivo } from "@/services/festivos.service";

export interface JornadaDoc {
    id?: string;
    userId: string;
    empresa: Empleado["empresa"];

    fecha: string;         // "YYYY-MM-DD"
    turnoId: string;       // "M8" | "T8" | ...

    horaEntrada: string;   // "HH:mm"
    horaSalida: string;    // "HH:mm"
    cruzoMedianoche: boolean;
    esDominicalFestivo: boolean;

    // parámetros aplicados
    salarioBaseAplicado: number;
    horasLaboralesMesAplicadas: number;
    tarifaHoraAplicada: number;
    rulesAplicadas: { nightStartsAt: string; nightEndsAt: string; baseDailyHours: number; roundToMinutes?: number };
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

    creadoEn: any;  // serverTimestamp
    estado: "calculado" | "cerrado";
}

/**
 * Crea una jornada calculada y la guarda en:
 *   usuarios/{empleado.id}/jornadas/{jid}
 */
export async function crearJornadaCalculada(opts: {
    empleado: Empleado;
    fecha: string;    // "YYYY-MM-DD"
    turnoId: string;  // "M8" | "T8" | ...
}): Promise<string> {
    const { empleado, fecha, turnoId } = opts;

    // 1) Config & turno
    const [turno, nominaCfg, recargosCfg, rules] = await Promise.all([
        TurnosService.obtener(turnoId),
        ConfigNominaService.getNomina(),
        ConfigNominaService.getRecargos(),
        ConfigNominaService.getRules(),
    ]);
    if (!turno) throw new Error("Turno no encontrado");

    // 2) Dominical / festivo (Opción 1: sin DB)
    const esDF = esDominicalOFestivo(fecha);

    // 3) Cálculo
    const calc = calcularDiaBasico(
        empleado.salarioBaseMensual,
        nominaCfg,
        recargosCfg,
        rules,
        { fecha, horaEntrada: turno.horaEntrada, horaSalida: turno.horaSalida, esDominicalFestivo: esDF }
    );

   // 4) Documento final (trazable)
const docData: Omit<JornadaDoc, "id"> = {
  userId: empleado.id,
  empresa: empleado.empresa,

  fecha,
  turnoId,
  horaEntrada: turno.horaEntrada,
  horaSalida: turno.horaSalida,
  cruzoMedianoche: turno.horaSalida <= turno.horaEntrada,
  esDominicalFestivo: esDF,

  salarioBaseAplicado: empleado.salarioBaseMensual ?? 0,
  horasLaboralesMesAplicadas: nominaCfg.horasLaboralesMes ?? 0,
  tarifaHoraAplicada: calc.tarifaHoraAplicada ?? 0,
  rulesAplicadas: rules,
  recargosAplicados: recargosCfg as unknown as Record<string, number>,

  // horas (con valores seguros)
  horasNormales: calc.horas?.horasNormales ?? 0,
  recargoNocturnoOrdinario: calc.horas?.recargoNocturnoOrdinario ?? 0,
  recargoFestivoDiurno: calc.horas?.recargoFestivoDiurno ?? 0,
  recargoFestivoNocturno: calc.horas?.recargoFestivoNocturno ?? 0,
  extrasDiurnas: calc.horas?.extrasDiurnas ?? 0,
  extrasNocturnas: calc.horas?.extrasNocturnas ?? 0,
  extrasDiurnasDominical: calc.horas?.extrasDiurnasDominical ?? 0,
  extrasNocturnasDominical: calc.horas?.extrasNocturnasDominical ?? 0,
  totalHoras: calc.horas?.totalHoras ?? 0,

  // valores (con valores seguros)
  valorHorasNormales: calc.valores?.valorHorasNormales ?? 0,
  valorRecargoNocturnoOrdinario: calc.valores?.valorRecargoNocturnoOrdinario ?? 0,
  valorRecargoFestivoDiurno: calc.valores?.valorRecargoFestivoDiurno ?? 0,
  valorRecargoFestivoNocturno: calc.valores?.valorRecargoFestivoNocturno ?? 0,
  valorExtrasDiurnas: calc.valores?.valorExtrasDiurnas ?? 0,
  valorExtrasNocturnas: calc.valores?.valorExtrasNocturnas ?? 0,
  valorExtrasDiurnasDominical: calc.valores?.valorExtrasDiurnasDominical ?? 0,
  valorExtrasNocturnasDominical: calc.valores?.valorExtrasNocturnasDominical ?? 0,
  valorTotalDia: calc.valores?.valorTotalDia ?? 0,

  creadoEn: serverTimestamp(),
  estado: "calculado",
};


    // 5) Guardar en subcolección del usuario
    const ref = await addDoc(
        collection(db, "usuarios", empleado.id, "jornadas"),
        docData
    );
    return ref.id;
}

/** Jornadas de un usuario por rango de fechas (subcolección del usuario) */
export async function listarJornadasPorUsuarioRango(opts: {
    userId: string;
    desdeISO: string;  // "YYYY-MM-DD"
    hastaISO: string;  // "YYYY-MM-DD"
}): Promise<JornadaDoc[]> {
    const { userId, desdeISO, hastaISO } = opts;

    const q = query(
        collection(db, "usuarios", userId, "jornadas"),
        where("fecha", ">=", desdeISO),
        where("fecha", "<=", hastaISO),
        orderBy("fecha", "asc")
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as JornadaDoc) }));
}

/** Jornadas globales por empresa+rango (usa collectionGroup) */
export async function listarJornadasPorEmpresaRango(opts: {
    empresa: Empleado["empresa"];
    desdeISO: string;
    hastaISO: string;
}): Promise<JornadaDoc[]> {
    const { empresa, desdeISO, hastaISO } = opts;

    const q = query(
        collectionGroup(db, "jornadas"),
        where("empresa", "==", empresa),
        where("fecha", ">=", desdeISO),
        where("fecha", "<=", hastaISO),
        orderBy("fecha", "asc")
    );

    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as JornadaDoc) }));
}

/** Eliminar una jornada específica del usuario */
export async function eliminarJornada(userId: string, jornadaId: string) {
    await deleteDoc(doc(db, "usuarios", userId, "jornadas", jornadaId));
}
