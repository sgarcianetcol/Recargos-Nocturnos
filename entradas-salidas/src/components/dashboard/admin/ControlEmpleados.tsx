"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import {
  UserPlus,
  Search,
  History,
  Clock,
  MapPin,
  Camera,
  Download,
} from "lucide-react";

import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "react-day-picker";

import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

import { format } from "date-fns";
import { es } from "date-fns/locale";

import { getUsuarios } from "@/services/usuariosService";
import {
  listarTodasLasJornadas,
  JornadaActiva,
  obtenerJornadaActiva,
  listarJornadasActivas,
} from "@/services/jornadaActiva.service";

// ------------------------------------------------------
// TIPOS NECESARIOS
// ------------------------------------------------------
export interface Empleado {
  id: string;
  nombre: string;
  correo: string;
  rol: string;
  activo: boolean;
  salarioBaseMensual: number;
  documento?: string;
  area?: string;
  empresa: string;
  proyectos?: string[];
  recargosActivos?: boolean;
  creadoEn: Date;
}

// ------------------------------------------------------
// COMPONENTE PRINCIPAL
// ------------------------------------------------------
export default function ControlEmpleados() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<Empleado | null>(
    null
  );

  const [employeeHistory, setEmployeeHistory] = useState<JornadaActiva[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [dateRange, setDateRange] = useState<DateRange>();

  const [jornadasActivas, setJornadasActivas] = useState<JornadaActiva[]>([]);

  const [filterMode, setFilterMode] = useState<"all" | "range">("all");

  // ------------------------------------------------------
  // FILTRO DE EMPLEADOS
  // ------------------------------------------------------
  const filteredEmpleados = useMemo(() => {
    let filtered = empleados.filter((emp) => {
      const term = searchTerm.toLowerCase();

      return (
        emp.nombre.toLowerCase().includes(term) ||
        emp.correo.toLowerCase().includes(term) ||
        (emp.documento && emp.documento.toLowerCase().includes(term))
      );
    });

    // Ordenar: empleados con jornada activa primero
    filtered.sort((a, b) => {
      const aActiva = jornadasActivas.some((j) => j.userId === a.id);
      const bActiva = jornadasActivas.some((j) => j.userId === b.id);

      if (aActiva && !bActiva) return -1;
      if (!aActiva && bActiva) return 1;
      return 0;
    });

    return filtered;
  }, [empleados, searchTerm, jornadasActivas]);

  // ------------------------------------------------------
  // FILTRO DE HISTORIAL POR FECHAS
  // ------------------------------------------------------
  const filteredHistory = useMemo(() => {
    if (!dateRange?.from) return employeeHistory;

    const from = dateRange.from;
    const to = dateRange.to || from;

    return employeeHistory.filter((j) => {
      const fecha = new Date(j.fecha);
      return fecha >= from && fecha <= to;
    });
  }, [employeeHistory, dateRange]);

  // ------------------------------------------------------
  // CARGAR EMPLEADOS
  // ------------------------------------------------------
  useEffect(() => {
    const cargarEmpleados = async () => {
      try {
        setLoading(true);
        const data = await getUsuarios();
        setEmpleados(data);
      } catch (error) {
        console.error("Error cargando empleados:", error);
      } finally {
        setLoading(false);
      }
    };

    cargarEmpleados();
  }, []);

  // ------------------------------------------------------
  // CARGAR JORNADAS ACTIVAS
  // ------------------------------------------------------
  useEffect(() => {
    const cargarJornadasActivas = async () => {
      try {
        const data = await listarJornadasActivas();
        setJornadasActivas(data);
      } catch (error) {
        console.error("Error cargando jornadas activas:", error);
      }
    };

    cargarJornadasActivas();
  }, []);

  // ------------------------------------------------------
  // CARGAR HISTORIAL DEL EMPLEADO
  // ------------------------------------------------------
  const cargarHistorialEmpleado = async (empleado: Empleado) => {
    try {
      setHistoryLoading(true);
      const all = await listarTodasLasJornadas();
      const jornadasUser = all.filter((j) => j.userId === empleado.id);
      setEmployeeHistory(jornadasUser);
    } catch (error) {
      console.error("Error cargando historial:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ------------------------------------------------------
  // EXPORTAR A EXCEL
  // ------------------------------------------------------
  const exportToExcel = () => {
    if (filteredHistory.length === 0) return;

    const data = filteredHistory.map((j) => ({
      Fecha: j.fecha,
      "Hora Inicio": j.horaInicio ? format(j.horaInicio, "HH:mm") : "N/A",
      "Hora Fin": j.horaFin ? format(j.horaFin, "HH:mm") : "N/A",
      Turno: j.turnoId,
      Estado: j.estado,
      "Ubicación Inicio": j.ubicacionInicio
        ? `${j.ubicacionInicio.lat}, ${j.ubicacionInicio.lng}`
        : "N/A",
      "Ubicación Fin": j.ubicacionFin
        ? `${j.ubicacionFin.lat}, ${j.ubicacionFin.lng}`
        : "N/A",
      "Foto Inicio": j.fotoInicioUrl ? "Sí" : "No",
      "Foto Fin": j.fotoFinUrl ? "Sí" : "No",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");

    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });

    saveAs(
      new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `historial_${selectedEmployee?.nombre || "empleado"}.xlsx`
    );
  };

  // ------------------------------------------------------
  // RENDER
  // ------------------------------------------------------
  return (
    <div className="p-6 space-y-6">
      {/* TITULO */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Control de Empleados</h1>
      </div>

      {/* LISTA DE EMPLEADOS */}
      <Card>
        <CardHeader>
          <CardTitle>Empleados Registrados</CardTitle>

          <div className="flex items-center gap-2">
            <Search size={16} />
            <Input
              placeholder="Buscar por nombre, correo o documento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-8 text-center">Cargando empleados...</div>
          ) : filteredEmpleados.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No hay empleados.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEmpleados.map((emp) => (
                <Card key={emp.id} className="hover:shadow-md transition">
                  <CardContent className="p-4 space-y-3">
                    {/* INFO */}
                    <div>
                      <h3 className="font-semibold text-lg">{emp.nombre}</h3>
                      <p className="text-sm text-muted-foreground">
                        {emp.correo}
                      </p>
                    </div>

                    <div className="text-sm space-y-1">
                      {emp.documento && (
                        <p>
                          <b>Documento:</b> {emp.documento}
                        </p>
                      )}
                      {emp.area && (
                        <p>
                          <b>Área:</b> {emp.area}
                        </p>
                      )}
                      <p>
                        <b>Empresa:</b> {emp.empresa}
                      </p>

                      <div className="flex gap-2 items-center">
                        <span className="font-medium">Estado:</span>
                        <Badge
                          variant={
                            jornadasActivas.some((j) => j.userId === emp.id)
                              ? "default"
                              : "secondary"
                          }
                        >
                          {jornadasActivas.some((j) => j.userId === emp.id)
                            ? "Activa"
                            : "Inactiva"}
                        </Badge>
                      </div>
                    </div>

                    {/* BOTONES */}
                    <div className="flex gap-2 pt-2">
                      {/* HISTORIAL */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSelectedEmployee(emp);
                              cargarHistorialEmpleado(emp);
                            }}
                          >
                            <History size={14} className="mr-1" />
                            Historial
                          </Button>
                        </DialogTrigger>

                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>
                              Historial de {selectedEmployee?.nombre}
                            </DialogTitle>
                          </DialogHeader>

                          {/* FILTRO Y EXPORT */}
                          <div className="space-y-4">
                            {/* MODO DE FILTRO */}
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-medium text-muted-foreground">
                                  Mostrar:
                                </span>
                                <div className="flex gap-2">
                                  <Button
                                    variant={
                                      filterMode === "all"
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    onClick={() => setFilterMode("all")}
                                  >
                                    Todas las jornadas
                                  </Button>
                                  <Button
                                    variant={
                                      filterMode === "range"
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    onClick={() => setFilterMode("range")}
                                  >
                                    Filtrar por fechas
                                  </Button>
                                </div>
                              </div>
                            </div>

                            {/* SELECTOR DE FECHAS */}
                            {filterMode === "range" && (
                              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                                <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                                  <span className="text-sm font-medium text-muted-foreground">
                                    Rango de fechas:
                                  </span>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="min-w-[200px] justify-start text-left font-normal"
                                      >
                                        {dateRange?.from
                                          ? dateRange.to
                                            ? `${format(
                                                dateRange.from,
                                                "dd/MM/yyyy"
                                              )} - ${format(
                                                dateRange.to,
                                                "dd/MM/yyyy"
                                              )}`
                                            : format(
                                                dateRange.from,
                                                "dd/MM/yyyy"
                                              )
                                          : "Seleccionar rango de fechas"}
                                      </Button>
                                    </PopoverTrigger>

                                    <PopoverContent
                                      className="w-auto p-0"
                                      align="start"
                                    >
                                      <Calendar
                                        mode="range"
                                        selected={dateRange}
                                        onSelect={setDateRange}
                                        numberOfMonths={2}
                                        className="rounded-md border"
                                      />
                                    </PopoverContent>
                                  </Popover>
                                </div>

                                <Button
                                  size="sm"
                                  onClick={exportToExcel}
                                  disabled={filteredHistory.length === 0}
                                  className="shrink-0"
                                >
                                  <Download size={14} className="mr-1" />
                                  Exportar Excel
                                </Button>
                              </div>
                            )}

                            {/* BOTÓN EXPORTAR CUANDO MUESTRA TODAS */}
                            {filterMode === "all" && (
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  onClick={exportToExcel}
                                  disabled={filteredHistory.length === 0}
                                  className="shrink-0"
                                >
                                  <Download size={14} className="mr-1" />
                                  Exportar Excel
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* HISTORIAL */}
                          {historyLoading ? (
                            <div className="py-8 text-center">
                              Cargando historial...
                            </div>
                          ) : filteredHistory.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground">
                              No hay datos.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {filteredHistory.map((j) => (
                                <Card key={j.id} className="p-4">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* INFO PRINCIPAL */}
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <Clock size={16} />
                                        <b>
                                          {(() => {
                                            try {
                                              return format(
                                                new Date(j.fecha),
                                                "EEEE dd/MM/yyyy",
                                                { locale: es }
                                              );
                                            } catch (error) {
                                              return (
                                                j.fecha || "Fecha inválida"
                                              );
                                            }
                                          })()}
                                        </b>
                                      </div>

                                      <div className="text-sm space-y-1">
                                        <p>
                                          <b>Inicio:</b>{" "}
                                          {j.horaInicio
                                            ? (() => {
                                                try {
                                                  return format(
                                                    j.horaInicio,
                                                    "HH:mm"
                                                  );
                                                } catch (error) {
                                                  return "Hora inválida";
                                                }
                                              })()
                                            : "N/A"}
                                        </p>
                                        <p>
                                          <b>Fin:</b>{" "}
                                          {j.horaFin
                                            ? (() => {
                                                try {
                                                  return format(
                                                    j.horaFin,
                                                    "HH:mm"
                                                  );
                                                } catch (error) {
                                                  return "Hora inválida";
                                                }
                                              })()
                                            : "N/A"}
                                        </p>
                                        <p>
                                          <b>Turno:</b> {j.turnoId}
                                        </p>

                                        <Badge
                                          variant={
                                            j.estado === "finalizada"
                                              ? "default"
                                              : "secondary"
                                          }
                                        >
                                          {j.estado}
                                        </Badge>
                                      </div>
                                    </div>

                                    {/* UBICACIONES + FOTOS */}
                                    <div className="space-y-2">
                                      {j.ubicacionInicio && (
                                        <p className="flex gap-2 text-sm">
                                          <MapPin size={14} />
                                          <a
                                            href={`https://www.google.com/maps?q=${j.ubicacionInicio.lat},${j.ubicacionInicio.lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            Inicio:{" "}
                                            {j.ubicacionInicio.lat.toFixed(6)},{" "}
                                            {j.ubicacionInicio.lng.toFixed(6)}
                                          </a>
                                        </p>
                                      )}

                                      {j.ubicacionFin && (
                                        <p className="flex gap-2 text-sm">
                                          <MapPin size={14} />
                                          <a
                                            href={`https://www.google.com/maps?q=${j.ubicacionFin.lat},${j.ubicacionFin.lng}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            Fin: {j.ubicacionFin.lat.toFixed(6)}
                                            , {j.ubicacionFin.lng.toFixed(6)}
                                          </a>
                                        </p>
                                      )}

                                      <div className="space-y-1">
                                        {j.fotoInicioUrl && (
                                          <p className="flex gap-2 text-sm">
                                            <Camera size={14} />
                                            <a
                                              href={j.fotoInicioUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline"
                                            >
                                              Foto Inicio
                                            </a>
                                          </p>
                                        )}

                                        {j.fotoFinUrl && (
                                          <p className="flex gap-2 text-sm">
                                            <Camera size={14} />
                                            <a
                                              href={j.fotoFinUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-blue-600 hover:underline"
                                            >
                                              Foto Fin
                                            </a>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </Card>
                              ))}
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
