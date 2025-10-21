// src/services/empleado.service.ts
import {
    collection, doc, getDoc, getDocs,
    setDoc, deleteDoc, serverTimestamp, getFirestore,
} from "firebase/firestore";
import { Empleado } from "@/models/usuarios.model";

const db = getFirestore();

const col = collection(db, "usuarios");

export const EmpleadoService = {
    async listar(): Promise<Empleado[]> {
        const snap = await getDocs(col);
        return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Empleado));
    },

    async obtener(id: string): Promise<Empleado | null> {
        const snap = await getDoc(doc(col, id));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as Empleado) : null;
    },

    async crear(data: Omit<Empleado, "id" | "creadoEn">): Promise<string> {
        const ref = doc(col);
        await setDoc(ref, { ...data, activo: true, creadoEn: serverTimestamp() });
        return ref.id;
    },

    async actualizar(id: string, parciales: Partial<Empleado>) {
        await setDoc(doc(col, id), parciales, { merge: true });
    },

    async eliminar(id: string) {
        await deleteDoc(doc(col, id));
    },
};
