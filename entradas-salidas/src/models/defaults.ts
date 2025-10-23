import { JornadaRules, NominaConfig, RecargosConfig } from "./config.model";

export const DEFAULT_NOMINA: NominaConfig = {
    horasLaboralesMes: 240,
};

export const DEFAULT_RECARGOS: RecargosConfig = {
    recargo_nocturno_ordinario: 0.35,
    recargo_festivo_diurno: 0.75,
    recargo_festivo_nocturno: 1.10,
    extra_diurna: 0.25,
    extra_nocturna: 0.75,
    extra_diurna_dominical: 1.0,
    extra_nocturna_dominical: 1.5,
};

export const DEFAULT_RULES: JornadaRules = {
    nightStartsAt: "21:00",
    nightEndsAt: "06:00",
    baseDailyHours: 8,
    // roundToMinutes: 15,
};
