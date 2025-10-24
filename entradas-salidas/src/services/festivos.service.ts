// src/services/nomina/festivos.service.ts
import Holidays from "date-holidays";

/** Recibe "YYYY-MM-DD". Devuelve true si es festivo en Colombia. */
export function esFestivoColombia(fechaISO: string): boolean {
    const hd = new Holidays("CO");               // Colombia
    const d = new Date(`${fechaISO}T00:00:00`);  // TZ del servidor recomendada: America/Bogota
    return !!hd.isHoliday(d);
}

/** Dominical o festivo (true/false) */
export function esDominicalOFestivo(fechaISO: string): boolean {
    const d = new Date(`${fechaISO}T00:00:00`);
    const esDomingo = d.getDay() === 0;
    return esDomingo || esFestivoColombia(fechaISO);
}
