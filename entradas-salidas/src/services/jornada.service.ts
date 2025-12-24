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
  getDoc,
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

  // 2) Dominical / festivo del día de inicio
  const esDF = await esDominicalOFestivo(fecha);

  // --- NUEVA LÓGICA PARA EL DÍA SIGUIENTE ---
  const fechaObj = new Date(fecha + "T00:00:00");
  fechaObj.setDate(fechaObj.getDate() + 1);
  const fechaSiguiente = fechaObj.toISOString().split("T")[0];
  const siguienteDiaFestivo = await esDominicalOFestivo(fechaSiguiente);

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

  // Calculate accumulated weekly hours if weekly calculation is active
  let horasAcumuladasSemana: number | undefined;
  if (empleado.calculoSemanalActivo && turnoId !== "D") {
    horasAcumuladasSemana = await calcularHorasAcumuladasSemana(
      empleado.id,
      fecha
    );
  }

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
      cruzaMedianoche: cruzo,
      siguienteDiaFestivo: siguienteDiaFestivo, // Ahora sí tiene valor
      calculoSemanalActivo: empleado.calculoSemanalActivo ?? false,
      horasAcumuladasSemana,
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
    cruzoMedianoche: turnoId === "D"
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
    recargosAplicados: turnoId === "D" ? {} : (recargosCfg as unknown as Record<string, number>),

    // HORAS
    horasNormales: turnoId === "D" ? 0 : isNaN(horasTrabajadas) ? 0 : horasTrabajadas,
    recargoNocturnoOrdinario: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Recargo Nocturno Ordinario"])
        ? 0
        : calc.horas?.["Recargo Nocturno Ordinario"] ?? 0,
    recargoFestivoDiurno: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Recargo Festivo Diurno"])
        ? 0
        : calc.horas?.["Recargo Festivo Diurno"] ?? 0,
    recargoFestivoNocturno: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Recargo Festivo Nocturno"])
        ? 0
        : calc.horas?.["Recargo Festivo Nocturno"] ?? 0,
    extrasDiurnas: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Extras Diurnas"])
        ? 0
        : calc.horas?.["Extras Diurnas"] ?? 0,
    extrasNocturnas: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Extras Nocturnas"])
        ? 0
        : calc.horas?.["Extras Nocturnas"] ?? 0,
    extrasDiurnasDominical: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Extras Diurnas Dominical"])
        ? 0
        : calc.horas?.["Extras Diurnas Dominical"] ?? 0,
    extrasNocturnasDominical: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Extras Nocturnas Dominical"])
        ? 0
        : calc.horas?.["Extras Nocturnas Dominical"] ?? 0,
    horasExtras: turnoId === "D"
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
    totalHoras: turnoId === "D"
      ? 0
      : isNaN(calc.horas?.["Total Horas"])
        ? 0
        : calc.horas?.["Total Horas"] ?? 0,

    // VALORES
    valorHorasNormales: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Hora laboral ordinaria"])
        ? 0
        : calc.valores?.["Valor Hora laboral ordinaria"] ?? 0,
    valorRecargoNocturnoOrdinario: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Recargo Nocturno Ordinario"])
        ? 0
        : calc.valores?.["Valor Recargo Nocturno Ordinario"] ?? 0,
    valorRecargoFestivoDiurno: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Recargo Festivo Diurno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Diurno"] ?? 0,
    valorRecargoFestivoNocturno: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Recargo Festivo Nocturno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Nocturno"] ?? 0,
    valorExtrasDiurnas: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Extras Diurnas"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas"] ?? 0,
    valorExtrasNocturnas: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Extras Nocturnas"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas"] ?? 0,
    valorExtrasDiurnasDominical: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Extras Diurnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas Dominical"] ?? 0,
    valorExtrasNocturnasDominical: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Extras Nocturnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas Dominical"] ?? 0,
    valorTotalDia: turnoId === "D"
      ? 0
      : isNaN(calc.valores?.["Valor Total Día"])
        ? 0
        : calc.valores?.["Valor Total Día"] ?? 0,

    creadoEn: serverTimestamp(),
    estado: "calculado",
    tarifaHoraAplicado: 0
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

// Agregar horas extra manuales
export async function agregarHorasExtraManuales(
  userId: string,
  jornadaId: string,
  nuevaHoraSalida: string,
  notaJefeExtra: string
) {
  const ref = doc(db, "usuarios", userId, "jornadas", jornadaId);
  const jornadaSnap = await getDoc(ref);

  if (!jornadaSnap.exists()) {
    throw new Error("Jornada no encontrada");
  }

  const jornadaData = jornadaSnap.data() as JornadaDoc;

  // Obtener empleado
  const empleadoRef = doc(db, "usuarios", userId);
  const empleadoSnap = await getDoc(empleadoRef);

  if (!empleadoSnap.exists()) {
    throw new Error("Empleado no encontrado");
  }

  const empleado = empleadoSnap.data() as Empleado;

  // Config & turno
  const [turno, nominaCfgRaw, recargosCfgRaw, rulesRaw] = await Promise.all([
    TurnosService.obtener(jornadaData.turnoId || "D"),
    ConfigNominaService.getNomina(),
    ConfigNominaService.getRecargos(),
    ConfigNominaService.getRules(),
  ]);

  if (!turno && jornadaData.turnoId !== "D")
    throw new Error("Turno no encontrado");

  const nominaCfg: NominaConfig = nominaCfgRaw ?? DEFAULT_NOMINA;
  const recargosCfg: RecargosConfig = recargosCfgRaw ?? DEFAULT_RECARGOS;
  const rules: JornadaRules = rulesRaw ?? DEFAULT_RULES;

  // Determinar si es festivo
  const esDF = jornadaData.esDominicalFestivo;

  // Día siguiente festivo
  const fechaObj = new Date(jornadaData.fecha + "T00:00:00");
  fechaObj.setDate(fechaObj.getDate() + 1);
  const fechaSiguiente = fechaObj.toISOString().split("T")[0];
  const siguienteDiaFestivo = await esDominicalOFestivo(fechaSiguiente);

  // Calculate accumulated weekly hours if weekly calculation is active
  let horasAcumuladasSemana: number | undefined;
  if (empleado.calculoSemanalActivo && jornadaData.turnoId !== "D") {
    horasAcumuladasSemana = await calcularHorasAcumuladasSemana(
      empleado.id,
      jornadaData.fecha
    );
  }

  // Recalcular con nueva hora de salida
  const calc = calcularDiaBasico(
    empleado.salarioBaseMensual ?? 0,
    nominaCfg,
    recargosCfg,
    rules,
    {
      fecha: jornadaData.fecha,
      horaEntrada: jornadaData.horaEntrada,
      horaSalida: nuevaHoraSalida,
      esDominicalFestivo: esDF,
      recargosActivos: empleado.recargosActivos ?? true,
      cruzaMedianoche: jornadaData.cruzoMedianoche,
      siguienteDiaFestivo: siguienteDiaFestivo,
      calculoSemanalActivo: empleado.calculoSemanalActivo ?? false,
      horasAcumuladasSemana,
    }
  );

  // Calcular horas trabajadas con nueva salida
  const parseTime = (time: string): number => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const entradaMin = parseTime(jornadaData.horaEntrada);
  let salidaMin = parseTime(nuevaHoraSalida);
  if (salidaMin <= entradaMin) salidaMin += 24 * 60;
  const horasTrabajadas = (salidaMin - entradaMin) / 60;

  // Actualizar jornada con nuevos cálculos
  await updateDoc(ref, {
    horaSalida: nuevaHoraSalida,
    notaJefeExtra,
    horasNormales:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(horasTrabajadas)
        ? 0
        : horasTrabajadas,
    recargoNocturnoOrdinario:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Nocturno Ordinario"])
        ? 0
        : calc.horas?.["Recargo Nocturno Ordinario"] ?? 0,
    recargoFestivoDiurno:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Festivo Diurno"])
        ? 0
        : calc.horas?.["Recargo Festivo Diurno"] ?? 0,
    recargoFestivoNocturno:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Recargo Festivo Nocturno"])
        ? 0
        : calc.horas?.["Recargo Festivo Nocturno"] ?? 0,
    extrasDiurnas:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Diurnas"])
        ? 0
        : calc.horas?.["Extras Diurnas"] ?? 0,
    extrasNocturnas:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Nocturnas"])
        ? 0
        : calc.horas?.["Extras Nocturnas"] ?? 0,
    extrasDiurnasDominical:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Diurnas Dominical"])
        ? 0
        : calc.horas?.["Extras Diurnas Dominical"] ?? 0,
    extrasNocturnasDominical:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Extras Nocturnas Dominical"])
        ? 0
        : calc.horas?.["Extras Nocturnas Dominical"] ?? 0,
    horasExtras:
      jornadaData.turnoId === "D"
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
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.horas?.["Total Horas"])
        ? 0
        : calc.horas?.["Total Horas"] ?? 0,
    valorRecargoNocturnoOrdinario:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Nocturno Ordinario"])
        ? 0
        : calc.valores?.["Valor Recargo Nocturno Ordinario"] ?? 0,
    valorRecargoFestivoDiurno:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Festivo Diurno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Diurno"] ?? 0,
    valorRecargoFestivoNocturno:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Recargo Festivo Nocturno"])
        ? 0
        : calc.valores?.["Valor Recargo Festivo Nocturno"] ?? 0,
    valorExtrasDiurnas:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Diurnas"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas"] ?? 0,
    valorExtrasNocturnas:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Nocturnas"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas"] ?? 0,
    valorExtrasDiurnasDominical:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Diurnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Diurnas Dominical"] ?? 0,
    valorExtrasNocturnasDominical:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Extras Nocturnas Dominical"])
        ? 0
        : calc.valores?.["Valor Extras Nocturnas Dominical"] ?? 0,
    valorTotalDia:
      jornadaData.turnoId === "D"
        ? 0
        : isNaN(calc.valores?.["Valor Total Día"])
        ? 0
        : calc.valores?.["Valor Total Día"] ?? 0,
  });
}

// Helper function to calculate accumulated weekly hours for a given date
async function calcularHorasAcumuladasSemana(
  empleadoId: string,
  fecha: string // "YYYY-MM-DD"
): Promise<number> {
  // Get the date object
  const fechaObj = new Date(fecha + "T00:00:00");

  // Find the start of the week (Monday)
  const diaSemana = fechaObj.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const lunes = new Date(fechaObj);
  lunes.setDate(fechaObj.getDate() - (diaSemana === 0 ? 6 : diaSemana - 1)); // Adjust to Monday
  const lunesISO = lunes.toISOString().split("T")[0];

  // Find the end of the week (Sunday)
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);

  // Query all jornadas for the week up to but not including the current date
  const jornadasSemanales = await listarJornadasPorUsuarioRango({
    userId: empleadoId,
    desdeISO: lunesISO,
    hastaISO: fecha,
  });

  // Calculate accumulated minutes from previous days in the week
  let minutosAcumulados = 0;

  for (const jornada of jornadasSemanales) {
    // Only count jornadas before the current date
    if (jornada.fecha < fecha && jornada.totalHoras > 0) {
      minutosAcumulados += jornada.totalHoras * 60; // Convert hours to minutes
    }
  }

  return minutosAcumulados;
}

// Calcular extras semanales
export async function calcularExtrasSemanales(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _empleado: Empleado,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _year: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _monthIndex: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _cells: { day: number; turno: string | null; turnoId: string }[]
) {
  const extrasMap: Record<string, number> = {};

  // TODO: Implementar lógica para calcular horas extras semanales
  // Esta función debería analizar el horario semanal del empleado y determinar
  // qué días tienen horas extras basándose en las reglas de la empresa
  // Por ahora, retorna un mapa vacío

  return extrasMap;
}
