import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { TurnoBase } from "@/models/config.model";
import { TURNOS_PREDETERMINADOS } from "@/models/turnos.defaults";

export const TurnosService = {
    async listar(): Promise<TurnoBase[]> {
        try {
            const col = collection(db, "config", "turnos");
            const snap = await getDocs(col);
            if (snap.empty) return TURNOS_PREDETERMINADOS;
            return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<TurnoBase, "id">) }));
        } catch {
            return TURNOS_PREDETERMINADOS;
        }
    },
    async obtener(id: string): Promise<TurnoBase | null> {
        const all = await this.listar();
        return all.find(t => t.id === id) ?? null;
    }
};
