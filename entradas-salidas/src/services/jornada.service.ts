// src/services/nomina/jornada.service.ts
import { db } from "@/lib/firebase";
import {
  DEFAULT_NOMINA,
  DEFAULT_RECARGOS,
  DEFAULT_RULES,
} from "@/models/defaults";
import {
  NominaConfig,
  RecargosConfig,
  JornadaRules,
} from "@/models/config.model";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  updateDoc,
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

  fecha: string; // "YYYY-MM-DD"
  turnoId: string; // "M8" | "T8" | ...
  finalizadoEn?: any;
  horaEntrada: string; // "HH:mm"
  horaSalida: string; // "HH:mm"
  cruzoMedianoche: boolean;
  esDominicalFestivo: boolean;

  ubicacion?: string | null; // ✅ aquí se guarda "lat,lng"

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

export async function crearJornadaCalculada(opts: {
  empleado: Empleado;
  fecha: string; // "YYYY-MM-DD"
  turnoId: string; // "M8" | "T8" | ...
}): Promise<string> {
  const { empleado, fecha, turnoId } = opts;

  // 1) Config & turno
  const [turno, nominaCfgRaw, recargosCfgRaw, rulesRaw] = await Promise.all([
    TurnosService.obtener(turnoId),
    ConfigNominaService.getNomina(),
    ConfigNominaService.getRecargos(),
    ConfigNominaService.getRules(),
  ]);

  if (!turno) throw new Error("Turno no encontrado");

  const nominaCfg: NominaConfig = nominaCfgRaw ?? DEFAULT_NOMINA;
  const recargosCfg: RecargosConfig = recargosCfgRaw ?? DEFAULT_RECARGOS;
  const rules: JornadaRules = rulesRaw ?? DEFAULT_RULES;

  // 2) Dominical / festivo
  const esDF = await esDominicalOFestivo(fecha); // boolean real

  // 3) Cálculo de jornada
  const calc = calcularDiaBasico(
    empleado.salarioBaseMensual ?? 0,
    nominaCfg,
    recargosCfg,
    rules,
    {
      fecha,
      horaEntrada: turno.horaEntrada ?? "08:00",
      horaSalida: turno.horaSalida ?? "17:00",
      esDominicalFestivo: esDF,
    }
  );

  // 4) Documento final para Firestore
  const docData: Omit<JornadaDoc, "id"> = {
    userId: empleado.id,
    empresa: empleado.empresa,

    fecha,
    turnoId,
    horaEntrada: turno.horaEntrada ?? "08:00",
    horaSalida: turno.horaSalida ?? "17:00",
    cruzoMedianoche: turno.horaSalida <= turno.horaEntrada,
    esDominicalFestivo: esDF,

    salarioBaseAplicado: empleado.salarioBaseMensual ?? 0,
    horasLaboralesMesAplicadas: nominaCfg.horasLaboralesMes ?? 0,
    tarifaHoraAplicada: calc.tarifaHoraAplicada ?? 0,
    rulesAplicadas: rules,
    recargosAplicados: recargosCfg as unknown as Record<string, number>,

    // HORAS
    horasNormales: calc.horas?.["Hora laboral ordinaria"] ?? 0,
    recargoNocturnoOrdinario: calc.horas?.["Recargo Nocturno Ordinario"] ?? 0,
    recargoFestivoDiurno: calc.horas?.["Recargo Festivo Diurno"] ?? 0,
    recargoFestivoNocturno: calc.horas?.["Recargo Festivo Nocturno"] ?? 0,
    extrasDiurnas: calc.horas?.["Extras Diurnas"] ?? 0,
    extrasNocturnas: calc.horas?.["Extras Nocturnas"] ?? 0,
    extrasDiurnasDominical: calc.horas?.["Extras Diurnas Dominical"] ?? 0,
    extrasNocturnasDominical: calc.horas?.["Extras Nocturnas Dominical"] ?? 0,
    horasExtras:
      (calc.horas?.["Extras Diurnas"] ?? 0) +
      (calc.horas?.["Extras Nocturnas"] ?? 0) +
      (calc.horas?.["Extras Diurnas Dominical"] ?? 0) +
      (calc.horas?.["Extras Nocturnas Dominical"] ?? 0),
    totalHoras: calc.horas?.["Total Horas"] ?? 0,

    // VALORES
    valorHorasNormales: calc.valores?.["Valor Hora laboral ordinaria"] ?? 0,
    valorRecargoNocturnoOrdinario:
      calc.valores?.["Valor Recargo Nocturno Ordinario"] ?? 0,
    valorRecargoFestivoDiurno:
      calc.valores?.["Valor Recargo Festivo Diurno"] ?? 0,
    valorRecargoFestivoNocturno:
      calc.valores?.["Valor Recargo Festivo Nocturno"] ?? 0,
    valorExtrasDiurnas: calc.valores?.["Valor Extras Diurnas"] ?? 0,
    valorExtrasNocturnas: calc.valores?.["Valor Extras Nocturnas"] ?? 0,
    valorExtrasDiurnasDominical:
      calc.valores?.["Valor Extras Diurnas Dominical"] ?? 0,
    valorExtrasNocturnasDominical:
      calc.valores?.["Valor Extras Nocturnas Dominical"] ?? 0,
    valorTotalDia: calc.valores?.["Valor Total Día"] ?? 0,

    creadoEn: serverTimestamp(),
    estado: "calculado",
  };

  // 5) Guardar en Firestore
  const ref = await addDoc(
    collection(db, "usuarios", empleado.id, "jornadas"),
    docData
  );
  return ref.id;
}

// Actualizar jornada existente
export async function actualizarJornada(
  userId: string,
  jornadaId: string,
  data: Partial<JornadaDoc>
) {
  const ref = doc(db, "usuarios", userId, "jornadas", jornadaId);
  await updateDoc(ref, data);
}

// Listar jornadas por usuario y rango
export async function listarJornadasPorUsuarioRango(opts: {
  userId: string;
  desdeISO: string;
  hastaISO: string;
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

// Listar jornadas globales por empresa + rango
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

// Eliminar jornada
export async function eliminarJornada(userId: string, jornadaId: string) {
  await deleteDoc(doc(db, "usuarios", userId, "jornadas", jornadaId));
}
