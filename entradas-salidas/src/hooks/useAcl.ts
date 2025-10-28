// src/hooks/useAcl.ts
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import type { Rol } from "@/auth/permissions";

export function useAcl() {
    const [loading, setLoading] = useState(true);
    const [rol, setRol] = useState<Rol | null>(null);
    const [uid, setUid] = useState<string | null>(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(getAuth(), async (u) => {
            if (!u) { setUid(null); setRol(null); setLoading(false); return; }
            setUid(u.uid);
            const snap = await getDoc(doc(db, "usuarios", u.uid));
            const r = (snap.data()?.rol ?? "empleado") as Rol;
            setRol(r);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    return { loading, rol, uid };
}
