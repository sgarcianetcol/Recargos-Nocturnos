// src/pages/index.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function HomePage() {
    const router = useRouter();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                // ✅ Usuario autenticado → dashboard
                router.replace("/dashboard");
            } else {
                // 🚪 No autenticado → login
                router.replace("/signin");
            }
        });

        return () => unsubscribe();
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Cargando...</p>
        </div>
    );
}
