import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc } from "firebase/firestore";
import {
  DEFAULT_NOMINA,
  DEFAULT_RECARGOS,
  DEFAULT_RULES,
} from "@/models/defaults";

const NOMINA_REF = doc(db, "config", "nomina");
const RECARGOS_REF = doc(db, "config", "recargos");
const RULES_REF = doc(db, "config", "rules");

export async function getParametros() {
  const [nominaSnap, recargosSnap, rulesSnap] = await Promise.all([
    getDoc(NOMINA_REF),
    getDoc(RECARGOS_REF),
    getDoc(RULES_REF),
  ]);

  return {
    nomina: nominaSnap.exists() ? nominaSnap.data() : DEFAULT_NOMINA,
    recargos: recargosSnap.exists() ? recargosSnap.data() : DEFAULT_RECARGOS,
    rules: rulesSnap.exists() ? rulesSnap.data() : DEFAULT_RULES,
  };
}

export async function actualizarParametros(parametros: any) {
  await Promise.all([
    setDoc(NOMINA_REF, parametros.nomina ?? {}, { merge: true }),
    setDoc(RECARGOS_REF, parametros.recargos ?? {}, { merge: true }),
    setDoc(RULES_REF, parametros.rules ?? {}, { merge: true }),
  ]);
}
