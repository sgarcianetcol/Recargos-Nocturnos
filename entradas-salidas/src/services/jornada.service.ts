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
import { JornadaDoc } from "@/models/jornada.model";

export async function crearJornadaCalculada(opts: {
  empleado: Empleado;
  fecha: string; // "YYYY-MM-DD"
  turnoId: string; // "M8" | "T8" | ...
  jornadaReal?: { horaEntrada?: Date; horaSalida?: Date }; // <-- NUEVO: horas reales opcionales
}): Promise<string> {
  const { empleado, fecha, turnoId, jornadaReal } = opts;

  // 1) Config & turno
  const [turno, nominaCfgRaw, recargosCfgRaw, rulesRaw] = await Promise.all([
    TurnosService.obtener(turnoId),
    ConfigNominaService.getNomina(),
    ConfigNominaService.getRecargos(),
    ConfigNominaService.getRules(),
  ]);

  if (!turno && turnoId !== "D") throw new Error("Turno no encontrado");

  const nominaCfg: NominaConfig = nominaCfgRaw ?? DEFAULT_NOMINA;
  const recargosCfg: RecargosConfig = recargosCfgRaw ?? DEFAULT_RECARGOS;
  const rules: JornadaRules = rulesRaw ?? DEFAULT_RULES;

  // 2) Dominical / festivo
  const esDF = await esDominicalOFestivo(fecha);

  // 3) Cálculo de jornada
  const horaEntradaCalc = jornadaReal?.horaEntrada
    ? jornadaReal.horaEntrada.toLocaleTimeString("es-CO", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
    : turnoId === "D"
    ? "00:00"
    : turno?.horaEntrada ?? "08:00";

  const horaSalidaCalc = jornadaReal?.horaSalida
    ? jornadaReal.horaSalida.toLocaleTimeString("es-CO", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
    : turnoId === "D"
    ? "00:00"
    : turno?.horaSalida ?? "17:00";

  // Calcular si cruza medianoche basado en horas calculadas
  const cruzo = turnoId === "D" ? false : horaSalidaCalc <= horaEntradaCalc;

  // Calcular horas trabajadas
  const parseTime = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const entradaMin = parseTime(horaEntradaCalc);
  let salidaMin = parseTime(horaSalidaCalc);
  if (cruzo) salidaMin += 24 * 60;
  const horasTrabajadas = (salidaMin - entradaMin) / 60;

  const calc = calcularDiaBasico(
    empleado.salarioBaseMensual ?? 0,
    nominaCfg,
    recargosCfg,
    rules,
    {
      fecha,
      horaEntrada: horaEntradaCalc,
      horaSalida: horaSalidaCalc,
      esDominicalFestivo: esDF,
      recargosActivos: empleado.recargosActivos ?? true,
    }
  );

  // 4) Documento final para Firestore
  const docData: Omit<JornadaDoc, "id"> = {
    userId: empleado.id,
    empresa: empleado.empresa,
    fecha,
    turnoId,
    horaEntrada: turnoId === "D" ? "00:00" : turno?.horaEntrada ?? "08:00",
    horaSalida: turnoId === "D" ? "00:00" : turno?.horaSalida ?? "17:00",
    cruzoMedianoche:
      turnoId === "D"
        ? false
        : turno?.horaSalida && turno?.horaEntrada
        ? turno.horaSalida <= turno.horaEntrada
        : false,
    esDominicalFestivo: esDF,
    salarioBaseAplicado: empleado.salarioBaseMensual ?? 0,
    horasLaboralesMesAplicadas: nominaCfg.horasLaboralesMes ?? 0,
    tarifaHoraAplicada: isNaN(calc.tarifaHoraAplicada)
      ? 0
      : calc.tarifaHoraAplicada ?? 0,
    rulesAplicadas: turnoId === "D" ? DEFAULT_RULES : rules,
    recargosAplicados:
      turnoId === "D" ? {} : (recargosCfg as unknown as Record<string, number>),

    // HORAS
    horasNormales:
      turnoId === "D" ? 0 : isNaN(horasTrabajadas) ? 0 : horasTrabajadas,
    recargoNocturnoOrdinario:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Nocturno Ordinario"])
        ? 0
        : calc.horas?.["Recargo Nocturno Ordinario"] ?? 0,
    recargoFestivoDiurno:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Festivo Diurno"])
        ? 0
        : calc.horas?.["Recargo Festivo Diurno"] ?? 0,
    recargoFestivoNocturno:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Festivo Nocturno"])
        ? 0
        : calc.horas?.["Recargo Festivo Nocturno"] ?? 0,
    extrasDiurnas:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Diurnas"])
        ? 0
        : calc.horas?.["Extras Diurnas"] ?? 0,
    extrasNocturnas:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Nocturnas"])
        ? 0
        : calc.horas?.["Extras Nocturnas"] ?? 0,
    extrasDiurnasDominical:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Diurnas Dominical"])
        ? 0
        : calc.horas?.["Extras Diurnas Dominical"] ?? 0,
    extrasNocturnasDominical:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Nocturnas Dominical"])
        ? 0
        : calc.horas?.["Extras Nocturnas Dominical"] ?? 0,
    horasExtras:
      turnoId === "D"
        ? 0
        : (isNaN(calc.horas?.["Extras Diurnas"])
            ? 0
            : calc.horas?.["Extras Diurnas"] ?? 0) +
          (isNaN(calc.horas?.["Extras Nocturnas"])
            ? 0
            : calc.horas?.["Extras Nocturnas"] ?? 0) +
          (isNaN(calc.horas?.["Extras Diurnas Dominical"])
            ? 0
            : calc.horas?.["Extras Diurnas Dominical"] ?? 0) +
          (isNaN(calc.horas?.["Extras Nocturnas Dominical"])
            ? 0
            : calc.horas?.["Extras Nocturnas Dominical"] ?? 0),
    totalHoras:
      turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Total Horas"])
        ? 0
        : calc.horas?.["Total Horas"] ?? 0,

    // VALORES
    valorHorasNormales:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Hora laboral ordinaria"])
        ? 0
        : calc.valores?.["Valor Hora laboral ordinaria"] ?? 0,
    valorRecargoNocturnoOrdinario:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Nocturno Ordinario"])
        ? 0
        : calc.valores?.["Valor Recargo Nocturno Ordinario"] ?? 0,
    valorRecargoFestivoDiurno:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Festivo Diurno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Diurno"] ?? 0,
    valorRecargoFestivoNocturno:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Festivo Nocturno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Nocturno"] ?? 0,
    valorExtrasDiurnas:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Diurnas"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas"] ?? 0,
    valorExtrasNocturnas:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Nocturnas"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas"] ?? 0,
    valorExtrasDiurnasDominical:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Diurnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas Dominical"] ?? 0,
    valorExtrasNocturnasDominical:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Nocturnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas Dominical"] ?? 0,
    valorTotalDia:
      turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Total Día"])
        ? 0
        : calc.valores?.["Valor Total Día"] ?? 0,

    creadoEn: serverTimestamp(),
    estado: "calculado",
  };

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
