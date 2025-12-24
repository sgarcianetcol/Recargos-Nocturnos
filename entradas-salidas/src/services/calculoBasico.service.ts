// src/services/nomina/calculoBasico.service.ts
import {
  NominaConfig,
  RecargosConfig,
  JornadaRules,
} from "@/models/config.model";

export interface TurnoInput {
  fecha: string; // "YYYY-MM-DD"
  horaEntrada: string; // "HH:mm"
  horaSalida: string; // "HH:mm" (si <= entrada ⇒ día siguiente)
  esDominicalFestivo: boolean;
  recargosActivos?: boolean; // New parameter to control if recargos are active
  cruzaMedianoche?: boolean; // Indica si el turno cruza medianoche
  siguienteDiaFestivo?: boolean; // Indica si el día siguiente es festivo/dominical
  calculoSemanalActivo?: boolean; // New parameter to control weekly overtime calculation
  horasAcumuladasSemana?: number; // Accumulated weekly hours in minutes (44 hours = 2640 minutes)
}

export function calcularDiaBasicoSemanal(
  salarioBaseMensual: number,
  cfgNomina: NominaConfig,
  recargos: RecargosConfig,
  rules: JornadaRules,
  turno: TurnoInput
): {
  tarifaHoraAplicada: number;
  horas: Record<string, number>;
  valores: Record<string, number>;
} {
  // Weekly overtime threshold: 44 hours = 2640 minutes
  const SEMANAL_THRESHOLD_MIN = 44 * 60;

  // Helper functions
  const toDate = (d: string, hm: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const [h, min] = hm.split(":").map(Number);
    return new Date(y, m - 1, day, h, min, 0, 0);
  };

  const minDiff = (a: Date, b: Date) =>
    Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

  // Get shift start and end times
  const start = toDate(turno.fecha, turno.horaEntrada);
  let end = toDate(turno.fecha, turno.horaSalida);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60000); // Handle midnight crossover

  const totalShiftMin = minDiff(start, end);

  // Determine night time boundaries
  const [nsH, nsM] = rules.nightStartsAt.split(":").map(Number);
  const [neH, neM] = rules.nightEndsAt.split(":").map(Number);
  const nightStart = new Date(start);
  nightStart.setHours(nsH, nsM, 0, 0);
  const nightEnd = new Date(start);
  nightEnd.setHours(neH, neM, 0, 0);
  if (nightEnd <= nightStart) nightEnd.setDate(nightEnd.getDate() + 1);

  // Initialize counters for different hour types
  let recargoNocturnoOrdinario = 0;
  let recargoFestivoDiurno = 0;
  let recargoFestivoNocturno = 0;
  let extrasDiurnas = 0;
  let extrasNocturnas = 0;
  let extrasDiurnasDominical = 0;
  let extrasNocturnasDominical = 0;

  // Process shift minute by minute
  for (let currentMin = 0; currentMin < totalShiftMin; currentMin++) {
    const currentTime = new Date(start.getTime() + currentMin * 60000);
    const accumulatedWeeklyMin =
      (turno.horasAcumuladasSemana || 0) + currentMin;

    // Determine if this minute is during night time
    const isNight =
      (currentTime >= nightStart && currentTime < nightEnd) ||
      (nightStart > nightEnd &&
        (currentTime >= nightStart || currentTime < nightEnd));

    // Determine if this minute is holiday
    const isHoliday = turno.esDominicalFestivo;

    // Determine hour type based on accumulated weekly hours
    if (accumulatedWeeklyMin <= SEMANAL_THRESHOLD_MIN) {
      // Within regular weekly hours - count as recargos
      if (isHoliday) {
        if (isNight) {
          recargoFestivoNocturno++;
        } else {
          recargoFestivoDiurno++;
        }
      } else {
        if (isNight) {
          recargoNocturnoOrdinario++;
        }
        // Regular daytime hours within threshold are not counted as recargos
      }
    } else {
      // Exceeded weekly threshold - count as extras
      if (isHoliday) {
        if (isNight) {
          extrasNocturnasDominical++;
        } else {
          extrasDiurnasDominical++;
        }
      } else {
        if (isNight) {
          extrasNocturnas++;
        } else {
          extrasDiurnas++;
        }
      }
    }
  }

  // Convert minutes to hours
  const h = (m: number) => +(m / 60).toFixed(2);

  // Build hours object
  const horas = {
    "Total Horas": h(totalShiftMin),
    "Normales Diurnas Ordinarias": 0, // Not used in weekly calculation
    "Normales Diurnas": 0, // Not used in weekly calculation
    "Normales Nocturnas": 0, // Not used in weekly calculation
    "Recargo Nocturno Ordinario": h(recargoNocturnoOrdinario),
    "Recargo Festivo Diurno": h(recargoFestivoDiurno),
    "Recargo Festivo Nocturno": h(recargoFestivoNocturno),
    "Extras Diurnas": h(extrasDiurnas),
    "Extras Nocturnas": h(extrasNocturnas),
    "Extras Diurnas Ordinarias": h(extrasDiurnas), // Same as Extras Diurnas
    "Extras Nocturnas Ordinarias": h(extrasNocturnas), // Same as Extras Nocturnas
    "Extras Diurnas Dominical": h(extrasDiurnasDominical),
    "Extras Nocturnas Dominical": h(extrasNocturnasDominical),
  };

  // Calculate values
  const tarifa = salarioBaseMensual / cfgNomina.horasLaboralesMes;
  const valores = {
    "Valor Recargo Nocturno Ordinario":
      horas["Recargo Nocturno Ordinario"] *
      tarifa *
      recargos.recargo_nocturno_ordinario,
    "Valor Recargo Festivo Diurno":
      horas["Recargo Festivo Diurno"] *
      tarifa *
      recargos.recargo_festivo_diurno,
    "Valor Recargo Festivo Nocturno":
      horas["Recargo Festivo Nocturno"] *
      tarifa *
      recargos.recargo_festivo_nocturno,
    "Valor Extras Diurnas":
      horas["Extras Diurnas"] * tarifa * recargos.extra_diurna,
    "Valor Extras Nocturnas":
      horas["Extras Nocturnas"] * tarifa * recargos.extra_nocturna,
    "Valor Extras Diurnas Dominical":
      horas["Extras Diurnas Dominical"] *
      tarifa *
      recargos.extra_diurna_dominical,
    "Valor Extras Nocturnas Dominical":
      horas["Extras Nocturnas Dominical"] *
      tarifa *
      recargos.extra_nocturna_dominical,
    "Valor Total Día": 0,
  };

  valores["Valor Total Día"] =
    valores["Valor Recargo Nocturno Ordinario"] +
    valores["Valor Recargo Festivo Diurno"] +
    valores["Valor Recargo Festivo Nocturno"] +
    valores["Valor Extras Diurnas"] +
    valores["Valor Extras Nocturnas"] +
    valores["Valor Extras Diurnas Dominical"] +
    valores["Valor Extras Nocturnas Dominical"];

  // Round to 2 decimal places
  (Object.keys(valores) as (keyof typeof valores)[]).forEach((k) => {
    valores[k] = +valores[k].toFixed(2);
  });

  return {
    tarifaHoraAplicada: +tarifa.toFixed(2),
    horas,
    valores,
  };
}

export function calcularDiaBasico(
  salarioBaseMensual: number,
  cfgNomina: NominaConfig,
  recargos: RecargosConfig,
  rules: JornadaRules,
  turno: TurnoInput
): {
  tarifaHoraAplicada: number;
  horas: Record<string, number>;
  valores: Record<string, number>;
} {
  // If weekly calculation is active, use chronological processing
  if (turno.calculoSemanalActivo && turno.horasAcumuladasSemana !== undefined) {
    return calcularDiaBasicoSemanal(
      salarioBaseMensual,
      cfgNomina,
      recargos,
      rules,
      turno
    );
  }
  // helpers locales
  const toDate = (d: string, hm: string) => {
    const [y, m, day] = d.split("-").map(Number);
    const [h, min] = hm.split(":").map(Number);
    return new Date(y, m - 1, day, h, min, 0, 0);
  };

  const minDiff = (a: Date, b: Date) =>
    Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

  const overlap = (aS: Date, aE: Date, bS: Date, bE: Date) => {
    const s = aS > bS ? aS : bS;
    const e = aE < bE ? aE : bE;
    const m = minDiff(s, e);
    return m > 0 ? m : 0;
  };

  // 1) fechas reales
  const start = toDate(turno.fecha, turno.horaEntrada);
  let end = toDate(turno.fecha, turno.horaSalida);
  if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60000); // cruza medianoche

  // 2) dividir en diurna/nocturna
  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  const [nsH, nsM] = rules.nightStartsAt.split(":").map(Number);
  const [neH, neM] = rules.nightEndsAt.split(":").map(Number);
  const night1Start = new Date(start);
  night1Start.setHours(nsH, nsM, 0, 0);
  const midnight = new Date(dayStart);
  midnight.setDate(midnight.getDate() + 1);
  const night2Start = new Date(nextDay);
  night2Start.setHours(0, 0, 0, 0);
  const night2End = new Date(nextDay);
  night2End.setHours(neH, neM, 0, 0);

  const noct1 = overlap(start, end, night1Start, midnight);
  const noct2 = overlap(start, end, night2Start, night2End);

  let totalMin = minDiff(start, end);
  const nocturnaMin = Math.min(noct1 + noct2, totalMin);
  const diurnaMin = totalMin - nocturnaMin;

  // Determinar si cada día es festivo
  const esFestivoDia1 = turno.esDominicalFestivo;
  const esFestivoDia2 = turno.siguienteDiaFestivo || false;

  // Si cruza medianoche y el día siguiente es festivo, dividir las horas
  let diurnaDia1Min = diurnaMin;
  let nocturnaDia1Min = noct1;
  let diurnaDia2Min = 0;
  let nocturnaDia2Min = noct2;

  if (turno.cruzaMedianoche) {
    // Calcular minutos en cada día
    const minutosDia1 = minDiff(start, midnight);
    const minutosDia2 = minDiff(midnight, end);

    // Asignar minutos diurnos y nocturnos a cada día
    if (minutosDia1 > 0) {
      const diurnaDia1 = overlap(start, midnight, start, night1Start);
      const nocturnaDia1 = overlap(start, midnight, night1Start, midnight);
      diurnaDia1Min = diurnaDia1;
      nocturnaDia1Min = nocturnaDia1;
    }

    if (minutosDia2 > 0) {
      const diurnaDia2 = overlap(midnight, end, night2End, end);
      const nocturnaDia2 = overlap(midnight, end, midnight, night2End);
      diurnaDia2Min = diurnaDia2;
      nocturnaDia2Min = nocturnaDia2;
    }
  }

  // redondeo opcional
  if (rules.roundToMinutes && rules.roundToMinutes > 1) {
    const r = rules.roundToMinutes;
    diurnaDia1Min = Math.round(diurnaDia1Min / r) * r;
    nocturnaDia1Min = Math.round(nocturnaDia1Min / r) * r;
    diurnaDia2Min = Math.round(diurnaDia2Min / r) * r;
    nocturnaDia2Min = Math.round(nocturnaDia2Min / r) * r;
    totalMin =
      diurnaDia1Min + nocturnaDia1Min + diurnaDia2Min + nocturnaDia2Min;
  }

  // 3) normales por día (sin extras diarios - se calculan semanalmente)
  const baseMin = rules.baseDailyHours * 60;

  // Día 1
  const totalDia1Min = diurnaDia1Min + nocturnaDia1Min;
  const baseDia1Min = Math.min(totalDia1Min, baseMin);
  const normalesDiurDia1Min = Math.min(diurnaDia1Min, baseDia1Min);
  const normalesNoctDia1Min = Math.min(
    nocturnaDia1Min,
    Math.max(0, baseDia1Min - normalesDiurDia1Min)
  );

  // Día 2
  const totalDia2Min = diurnaDia2Min + nocturnaDia2Min;
  const baseDia2Min = Math.min(totalDia2Min, baseMin);
  const normalesDiurDia2Min = Math.min(diurnaDia2Min, baseDia2Min);
  const normalesNoctDia2Min = Math.min(
    nocturnaDia2Min,
    Math.max(0, baseDia2Min - normalesDiurDia2Min)
  );

  // Combinar horas normales por tipo
  const normalesDiurMin = normalesDiurDia1Min + normalesDiurDia2Min;
  const normalesNoctMin = normalesNoctDia1Min + normalesNoctDia2Min;

  // Calcular extras del día si las horas totales exceden la base diaria
  const totalMinDia1 = diurnaDia1Min + nocturnaDia1Min;
  const totalMinDia2 = diurnaDia2Min + nocturnaDia2Min;
  const totalMinDia = totalMinDia1 + totalMinDia2;

  let extrasDiurMin = 0;
  let extrasNoctMin = 0;

  if (totalMinDia > baseMin) {
    const extrasTotalMin = totalMinDia - baseMin;

    // Distribuir extras proporcionalmente entre diurnas y nocturnas
    const proporcionDiurna =
      totalMinDia > 0 ? (diurnaDia1Min + diurnaDia2Min) / totalMinDia : 0;
    const proporcionNocturna =
      totalMinDia > 0 ? (nocturnaDia1Min + nocturnaDia2Min) / totalMinDia : 0;

    extrasDiurMin = Math.round(extrasTotalMin * proporcionDiurna);
    extrasNoctMin = Math.round(extrasTotalMin * proporcionNocturna);
  }

  // Declarar extras por día como 0 ya que se calculan semanalmente
  const extrasDiurDia1Min = 0;
  const extrasNoctDia1Min = 0;
  const extrasDiurDia2Min = 0;
  const extrasNoctDia2Min = 0;

  const h = (m: number) => +(m / 60).toFixed(2);

  // --- HORAS ---
  // Calcular horas por día y categoría
  const normalesDiurOrdinario = esFestivoDia1 ? 0 : normalesDiurDia1Min;
  const normalesNoctOrdinario = esFestivoDia1 ? 0 : normalesNoctDia1Min;
  const normalesDiurFestivo = esFestivoDia1 ? normalesDiurDia1Min : 0;
  const normalesNoctFestivo = esFestivoDia1 ? normalesNoctDia1Min : 0;

  const normalesDiurOrdinarioDia2 = esFestivoDia2 ? 0 : normalesDiurDia2Min;
  const normalesNoctOrdinarioDia2 = esFestivoDia2 ? 0 : normalesNoctDia2Min;
  const normalesDiurFestivoDia2 = esFestivoDia2 ? normalesDiurDia2Min : 0;
  const normalesNoctFestivoDia2 = esFestivoDia2 ? normalesNoctDia2Min : 0;

  // Combinar horas de ambos días
  const totalNormalesDiurOrdinario =
    normalesDiurOrdinario + normalesDiurOrdinarioDia2;
  const totalNormalesNoctOrdinario =
    normalesNoctOrdinario + normalesNoctOrdinarioDia2;
  const totalNormalesDiurFestivo =
    normalesDiurFestivo + normalesDiurFestivoDia2;
  const totalNormalesNoctFestivo =
    normalesNoctFestivo + normalesNoctFestivoDia2;

  // Extras por día
  const extrasDiurOrdinario = esFestivoDia1 ? 0 : extrasDiurDia1Min;
  const extrasNoctOrdinario = esFestivoDia1 ? 0 : extrasNoctDia1Min;
  const extrasDiurFestivo = esFestivoDia1 ? extrasDiurDia1Min : 0;
  const extrasNoctFestivo = esFestivoDia1 ? extrasNoctDia1Min : 0;

  const extrasDiurOrdinarioDia2 = esFestivoDia2 ? 0 : extrasDiurDia2Min;
  const extrasNoctOrdinarioDia2 = esFestivoDia2 ? 0 : extrasNoctDia2Min;
  const extrasDiurFestivoDia2 = esFestivoDia2 ? extrasDiurDia2Min : 0;
  const extrasNoctFestivoDia2 = esFestivoDia2 ? extrasNoctDia2Min : 0;

  // Combinar extrasno
  const totalExtrasDiurOrdinario =
    extrasDiurOrdinario + extrasDiurOrdinarioDia2;
  const totalExtrasNoctOrdinario =
    extrasNoctOrdinario + extrasNoctOrdinarioDia2;
  const totalExtrasDiurFestivo = extrasDiurFestivo + extrasDiurFestivoDia2;
  const totalExtrasNoctFestivo = extrasNoctFestivo + extrasNoctFestivoDia2;

  const horas = {
    "Total Horas": h(totalMin),
    "Normales Diurnas Ordinarias": h(totalNormalesDiurOrdinario),

    // NORMALES
    "Normales Diurnas": h(normalesDiurMin),
    "Normales Nocturnas": h(normalesNoctMin),

    // FESTIVOS
    "Recargo Nocturno Ordinario": h(totalNormalesNoctOrdinario),
    "Recargo Festivo Diurno": h(totalNormalesDiurFestivo),
    "Recargo Festivo Nocturno": h(totalNormalesNoctFestivo),

    // EXTRAS
    "Extras Diurnas": turno.recargosActivos ? h(extrasDiurMin) : 0,
    "Extras Nocturnas": turno.recargosActivos ? h(extrasNoctMin) : 0,
    "Extras Diurnas Ordinarias": turno.recargosActivos
      ? h(totalExtrasDiurOrdinario)
      : 0,

    "Extras Nocturnas Ordinarias": turno.recargosActivos
      ? h(totalExtrasNoctOrdinario)
      : 0,

    "Extras Diurnas Dominical": turno.recargosActivos
      ? h(totalExtrasDiurFestivo)
      : 0,
    "Extras Nocturnas Dominical": turno.recargosActivos
      ? h(totalExtrasNoctFestivo)
      : 0,
  };

  // --- VALORES ---
  const tarifa = salarioBaseMensual / cfgNomina.horasLaboralesMes;
  const valores = {
    "Valor Recargo Nocturno Ordinario":
      horas["Recargo Nocturno Ordinario"] *
      tarifa *
      recargos.recargo_nocturno_ordinario,
    "Valor Recargo Festivo Diurno":
      horas["Recargo Festivo Diurno"] *
      tarifa *
      recargos.recargo_festivo_diurno,
    "Valor Recargo Festivo Nocturno":
      horas["Recargo Festivo Nocturno"] *
      tarifa *
      recargos.recargo_festivo_nocturno,
    // Extras se calculan semanalmente, no por día
    "Valor Extras Diurnas": 0,
    "Valor Extras Nocturnas": 0,
    "Valor Extras Diurnas Dominical": 0,
    "Valor Extras Nocturnas Dominical": 0,
    "Valor Total Día": 0,
  };

  valores["Valor Total Día"] =
    valores["Valor Recargo Nocturno Ordinario"] +
    valores["Valor Recargo Festivo Diurno"] +
    valores["Valor Recargo Festivo Nocturno"] +
    valores["Valor Extras Diurnas"] +
    valores["Valor Extras Nocturnas"] +
    valores["Valor Extras Diurnas Dominical"] +
    valores["Valor Extras Nocturnas Dominical"];

  // redondeo 2 decimales
  (Object.keys(valores) as (keyof typeof valores)[]).forEach((k) => {
    valores[k] = +valores[k].toFixed(2);
  });

  return {
    tarifaHoraAplicada: +tarifa.toFixed(2),
    horas,
    valores,
  };
}
