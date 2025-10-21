// src/components/RequireAuth.tsx
import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Props = { children: ReactNode };

// rutas que no requieren login
const PUBLIC_ROUTES = ["/signin", "/signup", "/forgot", "/_error"];


export default function RequireAuth({ children }: Props) {
    const router = useRouter();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            const path = router.pathname;

            const isPublic = PUBLIC_ROUTES.includes(path);
            if (!user && !isPublic) {
                const next = router.asPath && router.asPath !== "/_error" ? router.asPath : "/dashboard";
                router.replace(`/signin?from=${encodeURIComponent(next)}`);
            }
            setChecked(true);
        });
        return () => unsub();
    }, [router]);

    if (!checked) return <div className="p-6">Cargando…</div>;
    return <>{children}</>;
}
