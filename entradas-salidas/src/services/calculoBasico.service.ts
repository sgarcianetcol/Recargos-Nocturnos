// src/services/nomina/calculoBasico.service.ts
import { NominaConfig, RecargosConfig, JornadaRules } from "@/models/config.model";

export interface TurnoInput {
    fecha: string;        // "YYYY-MM-DD"
    horaEntrada: string;  // "HH:mm"
    horaSalida: string;   // "HH:mm" (si <= entrada ⇒ día siguiente)
    esDominicalFestivo: boolean;
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
    const minDiff = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
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

    // 2) dividir en diurna/nocturna (21:00–06:00 por default)
    const dayStart = new Date(start); dayStart.setHours(0, 0, 0, 0);
    const nextDay = new Date(dayStart); nextDay.setDate(nextDay.getDate() + 1);
    const [nsH, nsM] = rules.nightStartsAt.split(":").map(Number);
    const [neH, neM] = rules.nightEndsAt.split(":").map(Number);
    const night1Start = new Date(start); night1Start.setHours(nsH, nsM, 0, 0);
    const midnight = new Date(dayStart); midnight.setDate(midnight.getDate() + 1);
    const night2Start = new Date(nextDay); night2Start.setHours(0, 0, 0, 0);
    const night2End = new Date(nextDay); night2End.setHours(neH, neM, 0, 0);

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

    // 3) normales vs extras (por día): cupo 8h
    const baseMin = Math.min(totalMin, rules.baseDailyHours * 60);
    const pDiur = diurnaMin / totalMin || 0;
    const normalesDiurMin = Math.round(baseMin * pDiur);
    const normalesNoctMin = baseMin - normalesDiurMin;
    const extrasDiurMin = Math.max(0, diurnaMin - normalesDiurMin);
    const extrasNoctMin = Math.max(0, nocturnaMin - normalesNoctMin);

    const h = (m: number) => +(m / 60).toFixed(2);
    const horas = {
        totalHoras: h(totalMin),
        horasNormales: h(baseMin),
        recargoNocturnoOrdinario: turno.esDominicalFestivo ? 0 : h(normalesNoctMin),
        recargoFestivoDiurno: turno.esDominicalFestivo ? h(normalesDiurMin) : 0,
        recargoFestivoNocturno: turno.esDominicalFestivo ? h(normalesNoctMin) : 0,
        extrasDiurnas: turno.esDominicalFestivo ? 0 : h(extrasDiurMin),
        extrasNocturnas: turno.esDominicalFestivo ? 0 : h(extrasNoctMin),
        extrasDiurnasDominical: turno.esDominicalFestivo ? h(extrasDiurMin) : 0,
        extrasNocturnasDominical: turno.esDominicalFestivo ? h(extrasNoctMin) : 0,
    };

    // 4) valores $
    const tarifa = salarioBaseMensual / cfgNomina.horasLaboralesMes;
    const valores = {
        valorHorasNormales: horas.horasNormales * tarifa,
        valorRecargoNocturnoOrdinario: horas.recargoNocturnoOrdinario * tarifa * recargos.recargo_nocturno_ordinario,
        valorRecargoFestivoDiurno: horas.recargoFestivoDiurno * tarifa * recargos.recargo_festivo_diurno,
        valorRecargoFestivoNocturno: horas.recargoFestivoNocturno * tarifa * recargos.recargo_festivo_nocturno,
        valorExtrasDiurnas: horas.extrasDiurnas * tarifa * (1 + recargos.extra_diurna),
        valorExtrasNocturnas: horas.extrasNocturnas * tarifa * (1 + recargos.extra_nocturna),
        valorExtrasDiurnasDominical: horas.extrasDiurnasDominical * tarifa * (1 + recargos.extra_diurna_dominical),
        valorExtrasNocturnasDominical: horas.extrasNocturnasDominical * tarifa * (1 + recargos.extra_nocturna_dominical),
        valorTotalDia: 0,
    } as Record<string, number>;

    valores.valorTotalDia =
        valores.valorHorasNormales +
        valores.valorRecargoNocturnoOrdinario +
        valores.valorRecargoFestivoDiurno +
        valores.valorRecargoFestivoNocturno +
        valores.valorExtrasDiurnas +
        valores.valorExtrasNocturnas +
        valores.valorExtrasDiurnasDominical +
        valores.valorExtrasNocturnasDominical;

    // redondeo 2 decimales
    Object.keys(valores).forEach(k => { valores[k] = +valores[k].toFixed(2); });

    return { tarifaHoraAplicada: +tarifa.toFixed(2), horas, valores };
}
