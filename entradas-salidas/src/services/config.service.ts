// src/services/config.service.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  NominaConfig,
  RecargosConfig,
  JornadaRules,
} from "@/models/config.model";
import {
  DEFAULT_NOMINA,
  DEFAULT_RECARGOS,
  DEFAULT_RULES,
} from "@/models/defaults";

async function getDocOrDefault<T>(path: string, def: T): Promise<T> {
  const snap = await getDoc(doc(db, path));
  if (!snap.exists()) return def;
  return { ...def, ...(snap.data() as object) } as T;
}

async function setDocMerge<T>(path: string, data: Partial<T>) {
  await setDoc(doc(db, path), data, { merge: true });
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

  // ✅ nuevas funciones para actualizar
  setNomina(data: Partial<NominaConfig>) {
    return setDocMerge<NominaConfig>("config/nomina", data);
  },
  setRecargos(data: Partial<RecargosConfig>) {
    return setDocMerge<RecargosConfig>("config/recargos", data);
  },
  setRules(data: Partial<JornadaRules>) {
    return setDocMerge<JornadaRules>("config/rules", data);
  },
};
