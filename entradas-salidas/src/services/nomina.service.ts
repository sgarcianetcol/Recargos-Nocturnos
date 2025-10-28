// src/services/nomina/nomina.service.ts
import { db } from "@/lib/firebase";
import {
    collection,
    collectionGroup,
    getDocs,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import type { JornadaDoc, NominaRow } from "@/models/jornada.model";
import type { Empleado } from "@/models/usuarios.model";

type Empresa = Empleado["empresa"];

async function getNombresPorUsuario(): Promise<Record<string, string>> {
    const snap = await getDocs(collection(db, "usuarios"));
    const map: Record<string, string> = {};
    snap.forEach((d) => (map[d.id] = (d.data() as any).nombre ?? d.id));
    return map;
}

/** Resumen de nómina por empleado en un rango y (opcional) por empresa */
export async function getResumenNomina(opts: {
    desdeISO: string;       // "YYYY-MM-DD"
    hastaISO: string;       // "YYYY-MM-DD"
    empresa?: Empresa;      // si no se pasa, trae todas
}): Promise<NominaRow[]> {
    const { desdeISO, hastaISO, empresa } = opts;

    const base = [
        where("fecha", ">=", desdeISO),
        where("fecha", "<=", hastaISO),
        orderBy("fecha", "asc"),
    ];

    // Si filtras por empresa, añádelo ANTES de fecha (necesitarás índice compuesto)
    const q = empresa
        ? query(collectionGroup(db, "jornadas"), where("empresa", "==", empresa), ...base)
        : query(collectionGroup(db, "jornadas"), ...base);

    const snap = await getDocs(q);
    const jornadas: JornadaDoc[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as JornadaDoc) }));

    const nombres = await getNombresPorUsuario();

    // Agregación por empleado
    const map = new Map<string, NominaRow>();
    for (const j of jornadas) {
        const row = map.get(j.userId) ?? {
            userId: j.userId,
            nombre: nombres[j.userId] ?? j.userId,
            hNormales: 0,
            hExtras: 0,
            recargosH: 0,
            total$: 0,
        };

        row.hNormales += j.horasNormales || 0;
        row.hExtras +=
            (j.extrasDiurnas || 0) +
            (j.extrasNocturnas || 0) +
            (j.extrasDiurnasDominical || 0) +
            (j.extrasNocturnasDominical || 0);

        row.recargosH +=
            (j.recargoNocturnoOrdinario || 0) +
            (j.recargoFestivoDiurno || 0) +
            (j.recargoFestivoNocturno || 0);

        row.total$ += j.valorTotalDia || 0;

        map.set(j.userId, row);
    }

    // Ordenar por nombre (opcional)
    return [...map.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Detalle de jornadas por empleado en un rango */
export async function getDetalleEmpleado(opts: {
    userId: string;
    desdeISO: string;
    hastaISO: string;
}): Promise<JornadaDoc[]> {
    const { userId, desdeISO, hastaISO } = opts;
    const q = query(
        collection(db, "usuarios", userId, "jornadas"),
        where("fecha", ">=", desdeISO),
        where("fecha", "<=", hastaISO),
        orderBy("fecha", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as JornadaDoc) }));
}
