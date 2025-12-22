import React, { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Users,
  Info,
  Clock,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import { MallaService } from "@/services/malla.service";
import { useAcl } from "@/hooks/useAcl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listarJornadasPorUsuarioRango } from "@/services/jornada.service";
import { JornadaDoc } from "@/models/jornada.model";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { EmpleadoService } from "@/services/usuariosService";
import type { Empleado } from "@/models/usuarios.model";

// ==============================
// COMPONENTE PRINCIPAL
// ==============================
export default function MallaInfo() {
  const { uid } = useAcl();

  const [mallaRango, setMallaRango] = useState<Record<string, unknown>[]>([]);
  const [jornadasRango, setJornadasRango] = useState<JornadaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [, setUserData] = useState<Empleado | null>(null);

  const [desde, setDesde] = useState(() => {
    const today = new Date();
    const back = new Date(today);
    back.setDate(today.getDate() - 30);
    return back.toISOString().split("T")[0];
  });

  const [hasta, setHasta] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

  // ==============================
  // CARGAR DATOS DEL USUARIO
  // ==============================
  const loadUserData = useCallback(async () => {
    if (!uid) return;
    try {
      const user = await EmpleadoService.obtener(uid);
      setUserData(user);
    } catch (error) {
      console.error("Error cargando datos del usuario:", error);
    }
  }, [uid]);

  // ==============================
  // CARGAR DATOS DEL RANGO
  // ==============================
  const loadDataRango = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      const [malla, jornadas] = await Promise.all([
        MallaService.getMallaRango(uid, desde, hasta),
        listarJornadasPorUsuarioRango({
          userId: uid,
          desdeISO: desde,
          hastaISO: hasta,
        }),
      ]);

      setMallaRango(malla as Record<string, unknown>[]);
      setJornadasRango(jornadas);
    } catch (error) {
      console.error("Error cargando datos del rango:", error);
    } finally {
      setLoading(false);
    }
  }, [uid, desde, hasta]);

  // ==============================
  // EFECTO PRINCIPAL
  // ==============================
  useEffect(() => {
    loadUserData();
    loadDataRango();
  }, [loadUserData, loadDataRango]);

  // ==============================
  // REFRESH MANUAL
  // ==============================
  const handleRefresh = async () => {
    if (!uid) return;

    setRefreshing(true);
    try {
      const [malla, jornadas] = await Promise.all([
        MallaService.getMallaRango(uid, desde, hasta),
        listarJornadasPorUsuarioRango({
          userId: uid,
          desdeISO: desde,
          hastaISO: hasta,
        }),
      ]);

      setMallaRango(malla as Record<string, unknown>[]);
      setJornadasRango(jornadas);
    } catch (error) {
      console.error("Error actualizando datos:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // ==============================
  // ESTADÍSTICAS DEL RANGO
  // ==============================
  const calcularEstadisticasRango = () => {
    const totalPago = jornadasRango.reduce(
      (sum, j) => sum + (isNaN(j.valorTotalDia) ? 0 : j.valorTotalDia),
      0
    );

    const totalHoras = jornadasRango.reduce(
      (sum, j) => sum + (isNaN(j.totalHoras) ? 0 : j.totalHoras),
      0
    );

    const diasTrabajados = jornadasRango.length;
    const diasDescanso = mallaRango.filter((d) => d.turno === "D").length;

    return {
      totalPago,
      totalHoras,
      diasTrabajados,
      diasDescanso,
      diasEnRango: mallaRango.length,
    };
  };

  const stats = calcularEstadisticasRango();

  // ==============================
  // LOADING
  // ==============================
  if (loading) {
    return (
      <div className="p-10 text-center text-xl">
        Cargando datos del rango...
      </div>
    );
  }

  // ==============================
  // UI COMPLETA
  // ==============================
  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* FILTROS */}
        <Card className="rounded-2xl shadow-xl border dark:border-gray-700 bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold text-gray-800 dark:text-gray-100">
              Filtrar por Rango de Fechas
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="desde">Desde</Label>
                <Input
                  id="desde"
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="hasta">Hasta</Label>
                <Input
                  id="hasta"
                  type="date"
                  value={hasta}
                  onChange={(e) => setHasta(e.target.value)}
                />
              </div>

              <div className="flex items-end">
                <Button
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="w-full black-600 hover:black-700 text-white"
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-2 ${
                      refreshing ? "animate-spin" : ""
                    }`}
                  />
                  {refreshing ? "Actualizando..." : "Actualizar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ESTADÍSTICAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {[
            {
              title: "Total a Pagar",
              value: isNaN(stats.totalPago)
                ? "$0"
                : `$${stats.totalPago.toLocaleString()}`,
              icon: DollarSign,
            },
            {
              title: "Total Horas",
              value: `${stats.totalHoras.toFixed(1)}h`,
              icon: Clock,
            },
            {
              title: "Días Trabajados",
              value: stats.diasTrabajados.toString(),
              icon: Users,
            },
            {
              title: "Días de Descanso",
              value: stats.diasDescanso.toString(),
              icon: Info,
            },
            {
              title: "Días en Rango",
              value: stats.diasEnRango.toString(),
              icon: Calendar,
            },
          ].map((item, i) => (
            <Card
              key={i}
              className="rounded-2xl bg-black text-white shadow-xl border-0 hover:scale-[1.02] transition-all min-h-[140px]"
            >
              <CardContent className="p-6 flex flex-col items-center justify-center text-center">
                <item.icon className="w-10 h-10 text-white opacity-90 mb-2" />
                <p className="text-sm font-bold">{item.title}</p>
                <p className="text-2xl font-extrabold">{item.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* LISTA DE JORNADAS */}
        <Card className="rounded-3xl shadow-xl border dark:border-gray-700 bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-bold text-gray-800 dark:text-gray-100">
              Jornadas en el Rango ({jornadasRango.length})
            </CardTitle>
          </CardHeader>

          <CardContent className="p-6">
            <div className="space-y-4">
              {jornadasRango.map((j) => (
                <div
                  key={j.id}
                  className="border border-gray-200 dark:border-gray-600 rounded-lg p-4"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{j.fecha}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Turno: {j.turnoId} | Horas:{" "}
                        {isNaN(j.totalHoras) ? "0.0" : j.totalHoras.toFixed(1)}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Hora Entrada: {j.horaEntrada} | Hora Salida:{" "}
                        {j.horaSalida}
                      </p>
                      {j.notaJefeExtra && (
                        <p className="text-sm text-blue-600 dark:text-blue-300 mt-2">
                          Nota del jefe: {j.notaJefeExtra}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        ${j.valorTotalDia.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
