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

        salarioBaseAplicado: empleado.salarioBaseMensual,
        horasLaboralesMesAplicadas: nominaCfg.horasLaboralesMes,
        tarifaHoraAplicada: calc.tarifaHoraAplicada,
        rulesAplicadas: rules,
        recargosAplicados: recargosCfg as unknown as Record<string, number>,

        // horas
        horasNormales: calc.horas.horasNormales,
        recargoNocturnoOrdinario: calc.horas.recargoNocturnoOrdinario,
        recargoFestivoDiurno: calc.horas.recargoFestivoDiurno,
        recargoFestivoNocturno: calc.horas.recargoFestivoNocturno,
        extrasDiurnas: calc.horas.extrasDiurnas,
        extrasNocturnas: calc.horas.extrasNocturnas,
        extrasDiurnasDominical: calc.horas.extrasDiurnasDominical,
        extrasNocturnasDominical: calc.horas.extrasNocturnasDominical,
        totalHoras: calc.horas.totalHoras,

        // valores
        valorHorasNormales: calc.valores.valorHorasNormales,
        valorRecargoNocturnoOrdinario: calc.valores.valorRecargoNocturnoOrdinario,
        valorRecargoFestivoDiurno: calc.valores.valorRecargoFestivoDiurno,
        valorRecargoFestivoNocturno: calc.valores.valorRecargoFestivoNocturno,
        valorExtrasDiurnas: calc.valores.valorExtrasDiurnas,
        valorExtrasNocturnas: calc.valores.valorExtrasNocturnas,
        valorExtrasDiurnasDominical: calc.valores.valorExtrasDiurnasDominical,
        valorExtrasNocturnasDominical: calc.valores.valorExtrasNocturnasDominical,
        valorTotalDia: calc.valores.valorTotalDia,

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
