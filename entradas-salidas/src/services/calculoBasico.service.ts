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
}

export function calcularDiaBasico(
  salarioBaseMensual: number,
  cfgNomina: NominaConfig,
  recargos: RecargosConfig,
  rules: JornadaRules,
  turno: TurnoInput
): { tarifaHoraAplicada: number; horas: any; valores: any } {
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

  let diurnaMin: number, nocturnaMin: number, totalMin: number;
  totalMin = minDiff(start, end);
  nocturnaMin = Math.min(noct1 + noct2, totalMin);
  diurnaMin = totalMin - nocturnaMin;

  // redondeo opcional
  if (rules.roundToMinutes && rules.roundToMinutes > 1) {
    const r = rules.roundToMinutes;
    diurnaMin = Math.round(diurnaMin / r) * r;
    nocturnaMin = Math.round(nocturnaMin / r) * r;
    totalMin = diurnaMin + nocturnaMin;
  }

  // 3) normales vs extras
  const baseMin = Math.min(totalMin, rules.baseDailyHours * 60);
  const pDiur = diurnaMin / totalMin || 0;
  const normalesDiurMin = Math.round(baseMin * pDiur);
  const normalesNoctMin = baseMin - normalesDiurMin;
  const extrasDiurMin = Math.max(0, diurnaMin - normalesDiurMin);
  const extrasNoctMin = Math.max(0, nocturnaMin - normalesNoctMin);

  const h = (m: number) => +(m / 60).toFixed(2);

  // --- HORAS ---
  const horas = {
    "Total Horas": h(totalMin),
    "Hora laboral ordinaria": h(baseMin),
    "Recargo Nocturno Ordinario": turno.esDominicalFestivo
      ? 0
      : h(normalesNoctMin),
    "Recargo Festivo Diurno": turno.esDominicalFestivo ? h(normalesDiurMin) : 0,
    "Recargo Festivo Nocturno": turno.esDominicalFestivo
      ? h(normalesNoctMin)
      : 0,
    "Extras Diurnas":
      turno.esDominicalFestivo || !turno.recargosActivos ? 0 : h(extrasDiurMin),
    "Extras Nocturnas":
      turno.esDominicalFestivo || !turno.recargosActivos ? 0 : h(extrasNoctMin),
    "Extras Diurnas Dominical":
      turno.esDominicalFestivo && turno.recargosActivos ? h(extrasDiurMin) : 0,
    "Extras Nocturnas Dominical":
      turno.esDominicalFestivo && turno.recargosActivos ? h(extrasNoctMin) : 0,
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
    "Valor Extras Diurnas":
      horas["Extras Diurnas"] *
      tarifa *
      (turno.recargosActivos ? recargos.extra_diurna : 1),
    "Valor Extras Nocturnas":
      horas["Extras Nocturnas"] *
      tarifa *
      (turno.recargosActivos ? recargos.extra_nocturna : 1),
    "Valor Extras Diurnas Dominical":
      horas["Extras Diurnas Dominical"] *
      tarifa *
      (turno.recargosActivos ? recargos.extra_diurna_dominical : 1),
    "Valor Extras Nocturnas Dominical":
      horas["Extras Nocturnas Dominical"] *
      tarifa *
      (turno.recargosActivos ? recargos.extra_nocturna_dominical : 1),
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
