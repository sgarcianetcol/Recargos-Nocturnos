import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { NominaConfig, RecargosConfig, JornadaRules } from "@/models/config.model";
import { DEFAULT_NOMINA, DEFAULT_RECARGOS, DEFAULT_RULES } from "@/models/defaults";

// Utilidad: lee un doc o devuelve defaults + merge superficial
async function getDocOrDefault<T>(path: string, def: T): Promise<T> {
    const snap = await getDoc(doc(db, path));
    if (!snap.exists()) return def;
    return { ...def, ...(snap.data() as object) } as T;
}

export const ConfigNominaService = {
    getNomina(): Promise<NominaConfig> {
        return getDocOrDefault<NominaConfig>("config/nomina", DEFAULT_NOMINA);
    },
    getRecargos(): Promise<RecargosConfig> {
        return getDocOrDefault<RecargosConfig>("config/recargos", DEFAULT_RECARGOS);
    },
    getRules(): Promise<JornadaRules> {
        return getDocOrDefault<JornadaRules>("config/rules", DEFAULT_RULES);
    },
};
