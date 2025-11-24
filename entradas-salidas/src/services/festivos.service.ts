import Holidays from "date-holidays";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  setDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";

export function esFestivoColombia(fechaISO: string): boolean {
  const hd = new Holidays("CO");
  const d = new Date(`${fechaISO}T00:00:00`);
  return !!hd.isHoliday(d);
}

export async function getFestivosManuales(): Promise<string[]> {
  const snap = await getDocs(collection(db, "festivosManuales"));
  return snap.docs.map((d) => d.id);
}

export async function agregarFestivoManual(fechaISO: string) {
  await setDoc(doc(db, "festivosManuales", fechaISO), {
    creadoEn: new Date().toISOString(),
  });
}

export async function eliminarFestivoManual(fechaISO: string) {
  await deleteDoc(doc(db, "festivosManuales", fechaISO));
}

export async function esDominicalOFestivo(fechaISO: string): Promise<boolean> {
  const manuales = await getFestivosManuales();
  const d = new Date(`${fechaISO}T00:00:00`);
  const esDomingo = d.getDay() === 0;
  return (
    esDomingo || esFestivoColombia(fechaISO) || manuales.includes(fechaISO)
  );
}

export async function hayFestivosEnAnio(anio: number): Promise<boolean> {
  const manuales = await getFestivosManuales();
  return manuales.some((fecha) => fecha.startsWith(`${anio}-`));
}

export async function cachearFestivosAnio(anio: number) {
  // This function would cache holidays for the year, but since we're using date-holidays,
  // it might not need implementation if holidays are computed on the fly.
  // For now, just return a resolved promise.
  return Promise.resolve();
}
