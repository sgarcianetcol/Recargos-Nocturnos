import React, { useState, useEffect } from "react";
import { Calendar, Users, Info, Clock } from "lucide-react";
import { MallaService } from "@/services/malla.service";
import { useAcl } from "@/hooks/useAcl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TURNOS_PREDETERMINADOS } from "@/models/turnos.defaults";

export default function MallaInfo() {
  const { uid } = useAcl();
  const [mallaMensual, setMallaMensual] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());

  useEffect(() => {
    loadMallaMensual();
  }, [uid, currentMonth, currentYear]);

  const loadMallaMensual = async () => {
    if (!uid) return setLoading(false);

    try {
      const malla = await MallaService.getMallaMensual(
        uid,
        currentYear,
        currentMonth
      );
      setMallaMensual(malla);
    } catch (error) {
      console.error("Error cargando malla mensual:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTurnoColor = (turno: string | null) => {
    const colors: Record<string, string> = {
      M8: "bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-200",
      T8: "bg-green-200 text-green-900 dark:bg-green-900 dark:text-green-200",
      N8: "bg-purple-200 text-purple-900 dark:bg-purple-900 dark:text-purple-200",
      D12: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-200",
      N12: "bg-indigo-200 text-indigo-900 dark:bg-indigo-900 dark:text-indigo-200",
      D: "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-200",
    };
    return (
      colors[turno ?? ""] ??
      "bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-gray-200"
    );
  };

  const calcularHorasPorTurno = () => {
    const horas: Record<string, number> = {};

    TURNOS_PREDETERMINADOS.forEach((turno) => {
      horas[turno.id] = 0;
    });

    horas["D"] = 0;

    mallaMensual.forEach((dia) => {
      const turno = dia.turno;
      if (!turno) return;

      if (turno === "D") {
        horas["D"] += 1;
      } else {
        const info = TURNOS_PREDETERMINADOS.find((t) => t.id === turno);
        if (info) horas[turno] += info.duracionHoras;
      }
    });

    return horas;
  };

  const calcularEstadisticas = () => {
    const horas = calcularHorasPorTurno();

    return {
      totalHoras: horas.M8 + horas.T8 + horas.N8 + horas.D12 + horas.N12,
      diasTrabajados: mallaMensual.filter((d) => d.turno && d.turno !== "D")
        .length,
      diasDescanso: horas.D,
      diasEnMalla: mallaMensual.length,
    };
  };

  const stats = calcularEstadisticas();

  if (loading) {
    return (
      <div className="p-10 text-center text-xl">Cargando malla mensual...</div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-blue-100 via-indigo-100 to-purple-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* ESTADÍSTICAS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              title: "Total Horas",
              value: `${stats.totalHoras}h`,
              icon: Clock,
              color: "from-blue-500 to-blue-700",
            },
            {
              title: "Días Trabajados",
              value: stats.diasTrabajados,
              icon: Users,
              color: "from-green-500 to-green-700",
            },
            {
              title: "Días de Descanso",
              value: stats.diasDescanso,
              icon: Info,
              color: "from-orange-500 to-orange-700",
            },
            {
              title: "Días en Malla",
              value: stats.diasEnMalla,
              icon: Calendar,
              color: "from-purple-500 to-purple-700",
            },
          ].map((item, i) => (
            <Card
              key={i}
              className={`rounded-2xl bg-gradient-to-br ${item.color} text-black shadow-xl border-0 hover:scale-[1.02] transition-all`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {item.title}
                    </p>
                    <p className="text-7xl font-extrabold text-gray-900 dark:text-gray-100">
                      {item.value}
                    </p>
                  </div>
                  <item.icon className="w-12 h-12 text-gray-900 dark:text-gray-100 opacity-90" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CALENDARIO SIMPLIFICADO */}
        <Card className="rounded-3xl shadow-xl border dark:border-gray-700 bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-bold text-gray-800 dark:text-gray-100">
              Calendario del Mes
            </CardTitle>

            {/* 🔥 NUEVO: NAV MESES (flechas) */}
            <div className="flex items-center justify-between mt-4 px-4">
              <button
                onClick={() => {
                  setCurrentMonth((prev) => (prev === 0 ? 11 : prev - 1));
                  if (currentMonth === 0) setCurrentYear(currentYear - 1);
                }}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                ←
              </button>

              <h3 className="text-xl font-semibold capitalize">
                {new Date(currentYear, currentMonth).toLocaleString("es-ES", {
                  month: "long",
                  year: "numeric",
                })}
              </h3>

              <button
                onClick={() => {
                  setCurrentMonth((prev) => (prev === 11 ? 0 : prev + 1));
                  if (currentMonth === 11) setCurrentYear(currentYear + 1);
                }}
                className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                →
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-6">
            {/* Calendar Grid */}
            <div
              className="calendar-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "8px",
                width: "100%",
              }}
            >
              {/* Días de la semana (DOM–SÁB) */}
              {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((dia) => (
                <div
                  key={dia}
                  className="text-center text-sm font-semibold text-gray-600 dark:text-gray-300 py-2"
                >
                  {dia}
                </div>
              ))}

              {/* Espacios vacíos para alinear el mes */}
              {(() => {
                const emptySpaces = new Date(
                  currentYear,
                  currentMonth,
                  1
                ).getDay();
                return Array.from({ length: emptySpaces }, (_, i) => (
                  <div key={`empty-${i}`} className="h-20"></div>
                ));
              })()}

              {/* Días de la malla */}
              {mallaMensual.map((dia) => (
                <div
                  key={dia.dia}
                  className="h-20 p-3 border border-gray-200 dark:border-gray-600 rounded-lg text-center flex flex-col justify-center bg-white dark:bg-gray-700 hover:shadow-md transition-all duration-200 hover:scale-[1.03]"
                >
                  <div className="font-bold text-lg text-gray-800 dark:text-gray-100 mb-1">
                    {dia.dia}
                  </div>

                  {dia.turno && (
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-bold ${getTurnoColor(
                        dia.turno
                      )}`}
                    >
                      {dia.turno}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
