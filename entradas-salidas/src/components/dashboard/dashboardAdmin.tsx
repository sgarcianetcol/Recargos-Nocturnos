"use client"

import {
  ShoppingCart,
  TrendingUp,
  AlertCircle,
} from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Empleado, Rol } from "@/models/usuarios.model";
const col = collection(db, "usuarios");
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar"

import { RevenueChart } from "@/components/dashboard/revenue-chart"
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import React from "react";


export default function DashboardAdmin() {

  const [rol, setRol] = React.useState<Rol | "todos">("todos");
  const [activos, setActivos] = React.useState<Empleado[]>([]);
  const [cargando, setCargando] = React.useState(true);

  const cargarActivos = React.useCallback(async () => {
    setCargando(true);

    try {
      const col = collection(db, "usuarios"); // tu colección Firestore
      let q = query(col, where("activo", "==", true));

      if (rol !== "todos") {
        q = query(col, where("activo", "==", true), where("rol", "==", rol));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Empleado));
      setActivos(data);
    } catch (err) {
      console.error("Error al cargar usuarios activos:", err);
    } finally {
      setCargando(false);
    }
  }, [rol]);

  React.useEffect(() => {
    cargarActivos();
  }, [cargarActivos]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">

        <SidebarInset className="flex-1">
          {/* Header */}
          <header className="flex h-16 items-center justify-between border-b px-6">
            <div className="flex items-center space-x-4">
              <SidebarTrigger />
              <div>
                <h1 className="text-2xl font-bold">Registro y Control de Novedades de Nómina</h1>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 p-6 space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="w-full max-w-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Usuarios activos</CardTitle>
                  <Select value={rol} onValueChange={(v) => setRol(v as Rol | "todos")}>
                    <SelectTrigger className="w-32 text-xs">
                      <SelectValue placeholder="Filtrar rol" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="lider">Líder</SelectItem>
                      <SelectItem value="empleado">Empleado</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>

                <CardContent>
                  {cargando ? (
                    <div className="text-gray-400 text-sm">Cargando...</div>
                  ) : (
                    <>
                      <div className="text-2xl font-bold mb-2">{activos.length}</div>
                      <ul className="text-sm text-gray-700 max-h-32 overflow-y-auto space-y-1">
                        {activos.length === 0 && (
                          <li className="text-gray-400 italic">Sin usuarios activos</li>
                        )}
                      </ul>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Profit Margin</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">28.4%</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">+2.1%</span> from last week
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Orders Today</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">1,247</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">+8.2%</span> from yesterday
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Stock Alerts</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">15</div>
                  <p className="text-xs text-muted-foreground">Items below minimum stock</p>
                </CardContent>
              </Card>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Revenue & Profit Trends</CardTitle>
                  <CardDescription>Monthly performance overview</CardDescription>
                </CardHeader>
                <CardContent>
                  <RevenueChart />
                </CardContent>
              </Card>

            </div>


          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
