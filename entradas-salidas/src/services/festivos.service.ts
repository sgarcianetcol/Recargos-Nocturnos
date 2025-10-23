import { db } from "@/lib/firebase";
import { doc, getDoc, writeBatch, collection, getDocs, query, where } from "firebase/firestore";
import Holidays from "date-holidays";

/** "YYYY-MM-DD" */
export function toISO(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** 1) Consulta rápida: ¿es festivo? (lee cache y, si falta, calcula y guarda) */
export async function esFestivoColombia(fechaISO: string): Promise<boolean> {
    // 1. Busca en cache
    const ref = doc(db, "festivos", fechaISO);
    const snap = await getDoc(ref);
    if (snap.exists()) return true;

    // 2. Si no está en cache, calcula el año y precalienta ese año
    const year = Number(fechaISO.slice(0, 4));
    await cachearFestivosAnio(year);

    // 3. Reintenta la misma fecha en cache
    const again = await getDoc(ref);
    return again.exists();
}

/** 2) Precalentar/cachear todos los festivos de un año (una sola llamada) */
export async function cachearFestivosAnio(year: number) {
    // Evita duplicar escrituras: si ya hay docs de ese año, sal temprano (opcional)
    const yaHay = await hayFestivosEnAnio(year);
    if (yaHay) return;

    const hd = new Holidays("CO"); // Colombia
    const list = hd.getHolidays(year); // -> array con todos los festivos del año

    const batch = writeBatch(db);
    for (const h of list) {
        // h.date viene como ISO "YYYY-MM-DD xx:xx:xx GMT..." -> conviértelo a "YYYY-MM-DD"
        const dt = new Date(h.date as unknown as string);
        const key = toISO(dt);
        batch.set(doc(db, "festivos", key), {
            fecha: key,
            nombre: h.name,
            type: h.type,         // info extra
            rule: h.rule,         // info extra (Ley Emiliani, etc.)
            country: "CO",
            year,
        }, { merge: true });
    }
    await batch.commit();
}

/** 3) (Opcional) Saber si ya cacheaste al menos 1 festivo de ese año */
export async function hayFestivosEnAnio(year: number) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    const q = query(collection(db, "festivos"), where("year", "==", year));
    const s = await getDocs(q);
    return !s.empty;
}
