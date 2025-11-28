"use client";

import React from "react";
import {
  Calendar,
  Clock,
  Users,
  Moon,
  DollarSign,
  TrendingUp,
} from "lucide-react";

import { Empleado, Rol } from "@/models/usuarios.model";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where } from "firebase/firestore";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";

import { RevenueChart } from "@/components/dashboard/revenue-chart";
import {
  getDashboardStats,
  getActividadReciente,
  type DashboardStats,
} from "@/services/dashboard.service";

export default function DashboardAdmin() {
  const [rol, setRol] = React.useState<Rol | "todos">("todos");
  const [activos, setActivos] = React.useState<Empleado[]>([]);
  const [cargando, setCargando] = React.useState(true);
  const [estadisticas, setEstadisticas] = React.useState<DashboardStats>({
    empleadosActivos: 0,
    horasProgramadasHoy: 0,
    turnosAsignadosHoy: 0,
    empleadosConTurnoHoy: 0,
    turnosNocturnosHoy: 0,
    capacidadSistema: 0,
    cumplimientoProgramacion: 0,
  });
  const [actividadReciente, setActividadReciente] = React.useState<any[]>([]);
  const [cargandoStats, setCargandoStats] = React.useState(true);

  const cargarActivos = React.useCallback(async () => {
    setCargando(true);

    try {
      const col = collection(db, "usuarios");
      let q = query(col, where("activo", "==", true));

      if (rol !== "todos") {
        q = query(col, where("activo", "==", true), where("rol", "==", rol));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Empleado)
      );

      setActivos(data);
    } catch (err) {
      console.error("Error al cargar usuarios activos:", err);
    } finally {
      setCargando(false);
    }
  }, [rol]);

  const cargarEstadisticas = React.useCallback(async () => {
    setCargandoStats(true);
    try {
      const [stats, actividad] = await Promise.all([
        getDashboardStats(),
        getActividadReciente(5),
      ]);
      setEstadisticas(stats);
      setActividadReciente(actividad);
    } catch (error) {
      console.error("Error cargando estadísticas:", error);
    } finally {
      setCargandoStats(false);
    }
  }, []);

  React.useEffect(() => {
    cargarActivos();
  }, [cargarActivos]);

  React.useEffect(() => {
    cargarEstadisticas();
    // Actualizar cada 5 minutos
    const interval = setInterval(cargarEstadisticas, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [cargarEstadisticas]);

  const formatTiempo = (timestamp: any) => {
    if (!timestamp) return "Hace un momento";

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const ahora = new Date();
    const diffMs = ahora.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));

    if (diffMins < 1) return "Hace un momento";
    if (diffMins < 60) return `Hace ${diffMins} minutos`;

    const diffHoras = Math.floor(diffMins / 60);
    if (diffHoras < 24) return `Hace ${diffHoras} horas`;

    return date.toLocaleDateString("es-ES");
  };

  return (
    <>
      {/* Header */}
      <header className="flex h-16 items-center justify-between border-b px-6">
        <div className="flex items-center space-x-4">
          <div>
            <h1 className="text-2xl font-bold">
              Dashboard de Nómina y Recargos Nocturnos
            </h1>
            <p className="text-sm text-gray-600">
              Resumen general del sistema de control de entradas y salidas
            </p>
          </div>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Empleados activos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Empleados Activos
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              {cargando ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {activos.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Con acceso al sistema
                  </p>
                  <div className="mt-2">
                    <Select
                      value={rol}
                      onValueChange={(v) => setRol(v as Rol | "todos")}
                    >
                      <SelectTrigger className="w-full text-xs h-7">
                        <SelectValue placeholder="Filtrar rol" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="empleado">Empleado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Horas programadas hoy */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Horas Programadas Hoy
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.horasProgramadasHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Horas asignadas en mallas
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Turnos asignados hoy */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Turnos Asignados Hoy
              </CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.turnosAsignadosHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {estadisticas.empleadosConTurnoHoy} empleados con turno
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Empleados con turno hoy */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Cobertura de Personal
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.empleadosConTurnoHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    De {estadisticas.empleadosActivos} empleados activos
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        {/* KPIs adicionales */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Turnos Nocturnos Hoy
              </CardTitle>
              <Moon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.turnosNocturnosHoy}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Turnos con horario nocturno
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Capacidad del Sistema
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.capacidadSistema}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Empleados con turno asignado
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">
                Cumplimiento Programación
              </CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {cargandoStats ? (
                <div className="text-gray-400 text-sm">Cargando...</div>
              ) : (
                <>
                  <div className="text-3xl font-bold mb-2">
                    {estadisticas.cumplimientoProgramacion}%
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Programación ejecutada
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        {/* Gráfica */}
        <div className="grid grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Horas del Mes</CardTitle>
              <CardDescription>
                Horas programadas vs horas trabajadas
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RevenueChart />
            </CardContent>
          </Card>
        </div>
        {/* Actividad reciente */}
        <Card>
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>Últimas acciones en el sistema</CardDescription>
          </CardHeader>
          <CardContent>
            {cargandoStats ? (
              <div className="text-gray-400 text-sm">Cargando actividad...</div>
            ) : actividadReciente.length === 0 ? (
              <div className="text-gray-400 text-sm italic">
                No hay actividad reciente
              </div>
            ) : (
              <div className="space-y-3">
                {actividadReciente.map((actividad) => (
                  <div
                    key={actividad.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div
                      className={`w-2 h-2 rounded-full ${
                        actividad.tipo === "jornada_iniciada"
                          ? "bg-green-500"
                          : actividad.tipo === "jornada_finalizada"
                          ? "bg-orange-500"
                          : "bg-blue-500"
                      }`}
                    ></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{actividad.mensaje}</p>
                      <p className="text-xs text-gray-500">
                        {formatTiempo(actividad.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
