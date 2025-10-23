// src/services/usuariosService.ts
import { db } from "@/lib/firebase";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit,
    DocumentData,
} from "firebase/firestore";
import type { Empleado } from "@/models/usuarios.model";

/* ===========================
   Utils
=========================== */
function omitUndefined<T extends Record<string, any>>(obj: T): T {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v !== undefined) out[k] = v;
    }
    return out as T;
}

function mapDocToEmpleado(d: DocumentData, id: string): Empleado {
    return {
        id,
        nombre: d.nombre ?? "",
        correo: d.correo ?? "",
        rol: d.rol ?? "empleado",
        activo: Boolean(d.activo),
        salarioBaseMensual: Number(d.salarioBaseMensual ?? 0), // asegura number
        documento: d.documento ?? undefined,
        area: d.area ?? undefined,
        empresa: d.empresa ?? "NETCOL",
        proyectos: Array.isArray(d.proyectos) ? (d.proyectos as string[]) : undefined,
        creadoEn: d.creadoEn?.toDate ? d.creadoEn.toDate() : (d.creadoEn ?? new Date()),
    };
}

/* ===========================
   Refs
=========================== */
const colRef = collection(db, "usuarios");

/* ===========================
   Service
=========================== */
export const EmpleadoService = {
    /** Lista empleados (con filtros opcionales) */
    async listar(opts?: {
        empresa?: Empleado["empresa"];
        soloActivos?: boolean;
        limite?: number;
        ordenarPorNombre?: boolean;
    }): Promise<Empleado[]> {
        const clauses = [];
        if (opts?.empresa) clauses.push(where("empresa", "==", opts.empresa));
        if (opts?.soloActivos) clauses.push(where("activo", "==", true));
        if (opts?.ordenarPorNombre) clauses.push(orderBy("nombre"));
        if (opts?.limite) clauses.push(limit(opts.limite));

        const snap = clauses.length
            ? await getDocs(query(colRef, ...clauses))
            : await getDocs(colRef);

        return snap.docs.map((docSnap) => mapDocToEmpleado(docSnap.data(), docSnap.id));
    },

    /** Obtiene un empleado por id */
    async obtener(id: string): Promise<Empleado | null> {
        const snap = await getDoc(doc(colRef, id));
        if (!snap.exists()) return null;
        return mapDocToEmpleado(snap.data(), snap.id);
    },

    /** Crea un empleado (exige salario > 0) */
    async crear(data: Omit<Empleado, "id" | "creadoEn">): Promise<string> {
        if (data.salarioBaseMensual == null || Number(data.salarioBaseMensual) <= 0) {
            throw new Error("salarioBaseMensual debe ser un número > 0");
        }
        if (!data.nombre || !data.correo) {
            throw new Error("Faltan campos obligatorios: nombre/correo.");
        }

        const ref = doc(colRef);
        const payload = omitUndefined({
            ...data,
            salarioBaseMensual: Number(data.salarioBaseMensual),
            activo: data.activo ?? true,
            creadoEn: serverTimestamp(),
        });
        await setDoc(ref, payload);
        return ref.id;
    },

    /** Crea/Upsertea con un ID específico (ej. uid de Auth) */
    async crearConId(id: string, data: Omit<Empleado, "id" | "creadoEn">): Promise<void> {
        if (data.salarioBaseMensual == null || Number(data.salarioBaseMensual) <= 0) {
            throw new Error("salarioBaseMensual debe ser un número > 0");
        }
        if (!data.nombre || !data.correo) {
            throw new Error("Faltan campos obligatorios: nombre/correo.");
        }

        const payload = omitUndefined({
            ...data,
            salarioBaseMensual: Number(data.salarioBaseMensual),
            activo: data.activo ?? true,
            creadoEn: serverTimestamp(),
        });
        await setDoc(doc(colRef, id), payload, { merge: false });
    },

    /** Actualiza campos parciales (no lanza error si salario viene vacío/NaN/<=0: simplemente lo omite) */
    async actualizar(id: string, parciales: Partial<Empleado>): Promise<void> {
        const payload: Record<string, any> = { ...parciales };

        if ("salarioBaseMensual" in payload) {
            const raw = payload.salarioBaseMensual as any;

            // Si viene "", null o undefined -> no actualizar el salario
            if (raw === "" || raw === null || raw === undefined) {
                delete payload.salarioBaseMensual;
            } else {
                const v = Number(raw);
                // Si no es finito o <= 0 -> omite actualizar salario (no rompemos flujo)
                if (!Number.isFinite(v) || v <= 0) {
                    delete payload.salarioBaseMensual;
                } else {
                    payload.salarioBaseMensual = v;
                }
            }
        }

        // Nunca envíes undefined
        Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

        await setDoc(doc(colRef, id), payload, { merge: true });
    },

    /** Elimina (hard delete) */
    async eliminar(id: string): Promise<void> {
        await deleteDoc(doc(colRef, id));
    },

    /** Activa / desactiva (soft delete) */
    async activar(id: string, activo: boolean): Promise<void> {
        await setDoc(doc(colRef, id), { activo }, { merge: true });
    },

    /** Cambia rol */
    async setRol(id: string, rol: Empleado["rol"]): Promise<void> {
        await setDoc(doc(colRef, id), { rol }, { merge: true });
    },
};
