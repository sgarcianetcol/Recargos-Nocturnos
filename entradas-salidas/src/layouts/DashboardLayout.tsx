"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  Bolt,
  Calculator,
  Calendar,
  CheckCheck,
  Clock,
  FolderArchive,
  LogOut,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { signOut, onAuthStateChanged, checkActionCode } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

// 🔹 MENÚS SEGÚN ROL
const menuAdmin = [
  { title: "Resumen", icon: BarChart3, href: "/dashboard" },
  { title: "Usuarios", icon: Users, href: "/usuarios" },
  { title: "Calcular", icon: Calculator, href: "/calculadora" },
  { title: "Cálculo masivo", icon: Calculator, href: "/calculoMasivo" },
  { title: "Control empleados", icon: Clock, href: "/controlempleados" },
  { title: "Malla Empleados", icon: FolderArchive, href: "/MallaEmpleados" },
  { title: "Configuración", icon: Bolt, href: "/configuracion" },
];

const menuEmpleado = [
  { title: "Mi jornada", icon: BarChart3, href: "/empleado" },
  { title: "Inicio Jornada", icon: CheckCheck, href: "/iniciojornada" },
  { title: "Malla", icon: Calendar, href: "/malla" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  const router = useRouter();

  const [rol, setRol] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  // 🔹 Detecta el usuario logueado y trae su rol desde Firestore
  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/signin");
        return;
      }

      try {
        const userRef = doc(db, "usuarios", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setRol(data.rol || "empleado");
        } else {
          console.warn("⚠️ No se encontró el usuario en Firestore");
          setRol("empleado");
        }
      } catch (error) {
        console.error("Error al obtener el rol del usuario:", error);
        setRol("empleado");
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  // 🔹 Cerrar sesión
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/signin");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-600 dark:text-gray-300 animate-pulse">
          Cargando panel...
        </p>
      </div>
    );
  }

  const menuItems = rol === "admin" ? menuAdmin : menuEmpleado;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100">
        <Sidebar className="flex flex-col justify-between border-r border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-950/60 backdrop-blur-md">
          {/* ---- Menú ---- */}
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sm font-semibold tracking-wide text-gray-500 uppercase mb-2 mt-4 ml-3">
                Panel
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {menuItems.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className={`flex items-center gap-3 px-4 py-2 rounded-lg transition-all ${
                            active
                              ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
                              : "hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                        >
                          <a href={item.href}>
                            <div className="flex items-center gap-3">
                              <item.icon className="w-4 h-4" />
                              <span>{item.title}</span>
                            </div>
                          </a>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          {/* ---- Cerrar sesión abajo ---- */}
          <div className="p-4 border-t border-gray-100 dark:border-gray-800">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-red-500 transition-colors">
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Cerrar sesión?</AlertDialogTitle>
                  <AlertDialogDescription>
                    ¿Seguro que quieres cerrar tu sesión actual?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLogout}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Sí, salir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </Sidebar>

        <SidebarInset>
          <header className="flex h-16 items-center gap-4 border-b px-6">
            <SidebarTrigger />
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="text-sm text-gray-600">Panel de control</p>
            </div>
          </header>
          <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
