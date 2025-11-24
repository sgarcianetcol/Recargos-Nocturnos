// src/src/models/defaults.tsx
import { Parametros } from "@/components/configuracion/ParametrosGlobalesContext";
import { JornadaRules, NominaConfig, RecargosConfig } from "./config.model";

export const DEFAULT_NOMINA: NominaConfig = {
  horasLaboralesMes: 220,
};

export const DEFAULT_RECARGOS: RecargosConfig = {
  recargo_nocturno_ordinario: 0.35,
  recargo_festivo_diurno: 0.8,
  recargo_festivo_nocturno: 1.15,
  extra_diurna: 1.25,
  extra_nocturna: 1.75,
  extra_diurna_dominical: 2.05,
  extra_nocturna_dominical: 2.55,
};

export const DEFAULT_RULES: JornadaRules = {
  nightStartsAt: "21:00",
  nightEndsAt: "06:00",
  baseDailyHours: 8,
};

export const DEFAULT_PARAMETROS: Parametros = {
  nomina: DEFAULT_NOMINA,
  recargos: DEFAULT_RECARGOS,
  rules: DEFAULT_RULES,
};
