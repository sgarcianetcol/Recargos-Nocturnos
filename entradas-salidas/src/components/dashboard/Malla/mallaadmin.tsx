"use client";
import React from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmpleadoService } from "@/services/usuariosService";
import type { Empleado } from "@/models/usuarios.model";
import { MallaService } from "@/services/malla.service";
import { TURNOS_PREDETERMINADOS } from "@/models/turnos.defaults";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import {
  writeBatch,
  collectionGroup,
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  agregarHorasExtraManuales,
  listarJornadasPorEmpresaRango,
} from "@/services/jornada.service";
import {
  Upload,
  Save,
  Trash2,
  Calendar,
  Users,
  FileSpreadsheet,
  Plus,
} from "lucide-react";

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// --- Constantes para localStorage ---
const LOCAL_STORAGE_KEY = "malla_empleados_workbook";
const LOCAL_STORAGE_FILENAME_KEY = "malla_empleados_filename";
const LOCAL_STORAGE_CHANGES_KEY = "malla_changes";
const LOCAL_STORAGE_UPLOAD_TIMESTAMP_KEY = "malla_empleados_upload_timestamp";

// --- Funciones de Serialización/Deserialización ---
// Convierte WorkBook a Base64 para guardarlo en localStorage
function workbookToBase64(wb: XLSX.WorkBook): string {
  const data = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  return data;
}

// Convierte Base64 a WorkBook para cargarlo desde localStorage
function base64ToWorkbook(base64: string): XLSX.WorkBook {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const wb = XLSX.read(bytes, { type: "array" });
  return wb;
}

type PreviewCell = {
  day: number;
  turno: string | null;
  turnoId: string;
  changed?: boolean;
  exitTime?: string;
  overtime?: number;
  note?: string;
};
type PreviewRow = {
  idx: number; // index interno
  nombre: string;
  documento?: string;
  uid: string | null;
  cells: PreviewCell[];
  estado: "pendiente" | "listo" | "sin-usuario" | "corregido";
};

export default function MallaEmpleadosPage() {
  const [workbook, setWorkbook] = React.useState<XLSX.WorkBook | null>(null);
  const [mesSeleccionado, setMesSeleccionado] = React.useState<number>(0);
  const [diasMes, setDiasMes] = React.useState<number>(31);
  // ... (otros estados)

  const [empleadosMap, setEmpleadosMap] = React.useState<
    Record<string, Empleado>
  >({});
  const [] = React.useState<number>(9);
  const [countNumber, setCountNumber] = React.useState<number | "">(9);
  const [processing, setProcessing] = React.useState(false);
  const [year, setYear] = React.useState<number>(new Date().getFullYear());
  const [fileName, setFileName] = React.useState<string>("");
  const [, setUploadTimestamp] = React.useState<string>("");

  // Agrega estos 3 estados nuevos (alrededor de la línea 80-90)
  const [usuarios, setUsuarios] = React.useState<
    Array<{ id: string; nombre: string }>
  >([]);
  const [usuarioSeleccionado, setUsuarioSeleccionado] =
    React.useState<string>("");
  const [tipoEliminacion, setTipoEliminacion] = React.useState<
    "todo" | "jornadas" | "malla"
  >("todo");

  // Estado para meses seleccionados para guardar
  const [selectedMonths, setSelectedMonths] = React.useState<number[]>([]);

  // ✅ 1. Estado para las filas del preview
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);

  // Estado para el diálogo de mensajes
  const [messageDialogOpen, setMessageDialogOpen] = React.useState(false);
  const [messageTitle, setMessageTitle] = React.useState("");
  const [messageDescription, setMessageDescription] = React.useState("");

  // Estado para el progreso
  const [showProgress, setShowProgress] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // Estado para las horas totales por empleado
  const [horasPorEmpleado, setHorasPorEmpleado] = React.useState<
    { nombre: string; documento?: string; horasTotales: number }[]
  >([]);

  // Estados para filtros del resumen de horas
  const [fechaDesde, setFechaDesde] = React.useState<string>("");
  const [fechaHasta, setFechaHasta] = React.useState<string>("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const [minHours, setMinHours] = React.useState<number | "">("");
  const [maxHours, setMaxHours] = React.useState<number | "">("");
  const [onlyWithHours, setOnlyWithHours] = React.useState(false);

  // Estados para modal de horas extra
  const [extraHoursModalOpen, setExtraHoursModalOpen] = React.useState(false);
  const [selectedRowForExtra, setSelectedRowForExtra] =
    React.useState<PreviewRow | null>(null);
  const [selectedDayForExtra, setSelectedDayForExtra] =
    React.useState<number>(1);
  const [extraHoursType, setExtraHoursType] = React.useState<
    "exact" | "amount"
  >("exact");
  const [newExitTime, setNewExitTime] = React.useState<string>("");
  const [extraHoursAmount, setExtraHoursAmount] = React.useState<number>(1);
  const [extraHoursNote, setExtraHoursNote] = React.useState<string>("");

  // Función para mostrar mensajes
  const showMessage = React.useCallback(
    (title: string, description: string) => {
      setMessageTitle(title);
      setMessageDescription(description);
      setMessageDialogOpen(true);
    },
    []
  );

  // Nueva función para cargar usuarios (con mejor manejo de errores)
  const cargarUsuarios = async () => {
    try {
      console.log("🔄 Cargando usuarios...");
      const usuariosSnapshot = await getDocs(collection(db, "usuarios"));

      if (usuariosSnapshot.empty) {
        showMessage(
          "Advertencia",
          "No se encontraron usuarios en la base de datos."
        );
        return;
      }

      const listaUsuarios = usuariosSnapshot.docs
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            nombre: String(
              data.nombre || data.email || data.displayName || "Sin nombre"
            ),
          };
        })
        .filter((u) => u.id && u.nombre); // Filtrar datos inválidos

      console.log("✅ Usuarios cargados:", listaUsuarios.length);
      setUsuarios(listaUsuarios);

      if (listaUsuarios.length === 0) {
        showMessage("Advertencia", "No se encontraron usuarios válidos.");
      }
    } catch (error) {
      console.error("❌ Error cargando usuarios:", error);
      showMessage(
        "Error",
        "No se pudieron cargar los usuarios: " +
          (error instanceof Error ? error.message : String(error))
      );
    }
  };

  // Función para agregar horas extra
  const agregarHorasExtra = async () => {
    if (!selectedRowForExtra || !selectedRowForExtra.uid) {
      showMessage("Error", "Empleado no seleccionado o sin UID.");
      return;
    }

    if (!extraHoursNote.trim()) {
      showMessage("Error", "La nota del jefe es obligatoria.");
      return;
    }

    setProcessing(true);
    try {
      // Construir fecha
      const fecha = `${year}-${String(mesSeleccionado + 1).padStart(
        2,
        "0"
      )}-${String(selectedDayForExtra).padStart(2, "0")}`;

      // Buscar la jornada existente
      const jornadaQuery = query(
        collection(db, "usuarios", selectedRowForExtra.uid, "jornadas"),
        where("fecha", "==", fecha)
      );
      const jornadaSnap = await getDocs(jornadaQuery);

      if (jornadaSnap.empty) {
        showMessage("Error", "No se encontró jornada para este día.");
        return;
      }

      const jornadaDoc = jornadaSnap.docs[0];
      const jornadaId = jornadaDoc.id;

      // Calcular nueva hora de salida
      let nuevaHoraSalida: string;
      if (extraHoursType === "exact") {
        nuevaHoraSalida = newExitTime;
      } else {
        // Calcular hora de salida agregando horas
        const cell = selectedRowForExtra.cells.find(
          (c) => c.day === selectedDayForExtra
        );
        if (!cell || !cell.turno || cell.turno === "D") {
          showMessage("Error", "No hay turno asignado para este día.");
          return;
        }

        const turno = TURNOS_PREDETERMINADOS.find((t) => t.id === cell.turno);
        if (!turno) {
          showMessage("Error", "Turno no encontrado.");
          return;
        }

        const [hora, min] = turno.horaSalida.split(":").map(Number);
        const totalMin = hora * 60 + min + extraHoursAmount * 60;
        const nuevaHora = Math.floor(totalMin / 60) % 24;
        const nuevoMin = totalMin % 60;
        nuevaHoraSalida = `${String(nuevaHora).padStart(2, "0")}:${String(
          nuevoMin
        ).padStart(2, "0")}`;
      }

      // Agregar horas extra
      await agregarHorasExtraManuales(
        selectedRowForExtra.uid,
        jornadaId,
        nuevaHoraSalida,
        extraHoursNote
      );

      showMessage("Éxito", "Horas extra agregadas correctamente.");

      // Cerrar modal y resetear estados
      setExtraHoursModalOpen(false);
      setSelectedRowForExtra(null);
      setSelectedDayForExtra(1);
      setExtraHoursType("exact");
      setNewExitTime("");
      setExtraHoursAmount(1);
      setExtraHoursNote("");

      // Recargar preview para reflejar cambios
      await buildPreviewForMonth(mesSeleccionado);
    } catch (error) {
      console.error("Error agregando horas extra:", error);
      showMessage(
        "Error",
        "Error agregando horas extra: " +
          (error instanceof Error ? error.message : String(error))
      );
    } finally {
      setProcessing(false);
    }
  };

  // --- EFECTO: CARGAR WORKBOOK Y FILENAME DE LOCAL STORAGE ---
  React.useEffect(() => {
    // Solo se ejecuta en el cliente
    if (typeof window === "undefined") return;

    const savedBase64 = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedFileName = localStorage.getItem(LOCAL_STORAGE_FILENAME_KEY);
    const savedTimestamp = localStorage.getItem(
      LOCAL_STORAGE_UPLOAD_TIMESTAMP_KEY
    );

    // Cargar filename siempre si existe
    if (savedFileName) setFileName(savedFileName);

    // Cargar timestamp si existe
    if (savedTimestamp) setUploadTimestamp(savedTimestamp);

    if (savedBase64) {
      try {
        console.log("[STORAGE] Cargando workbook desde localStorage...");
        const wb = base64ToWorkbook(savedBase64);
        setWorkbook(wb);
        // No llamar buildPreviewForMonth aquí, se hará en el useEffect de workbook y empleadosMap
      } catch (e) {
        console.error("[STORAGE] Error cargando workbook:", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Limpiar data corrupta
        // No remover filename, ya que puede persistir sin workbook
      }
    }
  }, []); // Se ejecuta solo al montar el componente

  // Cargar usuarios (map por documento) - Solo activos para mejorar rendimiento
  React.useEffect(() => {
    (async () => {
      const list = await EmpleadoService.listar({ soloActivos: true });
      const map: Record<string, Empleado> = {};
      for (const u of list) {
        const k = String(u.documento ?? "").replace(/\D/g, ""); // Solo dígitos
        if (k) map[k] = u;
      }
      setEmpleadosMap(map);
    })();
  }, []);

  // Función para calcular horas totales por empleado
  const calcularHorasPorEmpleado = React.useCallback(() => {
    const resumen: {
      nombre: string;
      documento?: string;
      horasTotales: number;
    }[] = [];

    previewRows.forEach((row) => {
      let horasEmpleado = 0;

      row.cells.forEach((cell) => {
        // Aplicar filtro de fechas si está configurado
        if (fechaDesde || fechaHasta) {
          const fechaDia = new Date(year, mesSeleccionado, cell.day);
          const fechaDesdeDate = fechaDesde ? new Date(fechaDesde) : null;
          const fechaHastaDate = fechaHasta ? new Date(fechaHasta) : null;

          if (fechaDesdeDate && fechaDia < fechaDesdeDate) return;
          if (fechaHastaDate && fechaDia > fechaHastaDate) return;
        }

        if (cell.turno && cell.turno !== "D") {
          // Buscar el turno en los turnos predeterminados
          const turnoEncontrado = TURNOS_PREDETERMINADOS.find(
            (t) => t.id === cell.turno
          );
          if (turnoEncontrado) {
            horasEmpleado += turnoEncontrado.duracionHoras;
          }
        }
      });

      resumen.push({
        nombre: row.nombre,
        documento: row.documento,
        horasTotales: horasEmpleado,
      });
    });

    setHorasPorEmpleado(resumen);
  }, [previewRows, fechaDesde, fechaHasta, year, mesSeleccionado]);

  // Calcular horas cuando cambian las filas del preview
  React.useEffect(() => {
    if (previewRows.length > 0) {
      calcularHorasPorEmpleado();
    }
  }, [previewRows, calcularHorasPorEmpleado]);

  // Filtrar horas por empleado basado en los filtros
  const filteredHorasPorEmpleado = React.useMemo(() => {
    return horasPorEmpleado.filter((emp) => {
      // Filtro de búsqueda
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesName = emp.nombre.toLowerCase().includes(searchLower);
        const matchesDoc = emp.documento?.toLowerCase().includes(searchLower);
        if (!matchesName && !matchesDoc) return false;
      }

      // Filtro de horas mínimas
      if (minHours !== "" && emp.horasTotales < minHours) return false;

      // Filtro de horas máximas
      if (maxHours !== "" && emp.horasTotales > maxHours) return false;

      // Filtro de solo con horas
      if (onlyWithHours && emp.horasTotales === 0) return false;

      return true;
    });
  }, [horasPorEmpleado, searchTerm, minHours, maxHours, onlyWithHours]);

  // Calcular total de horas filtradas
  const totalHorasFiltradas = React.useMemo(() => {
    return filteredHorasPorEmpleado.reduce(
      (total, emp) => total + emp.horasTotales,
      0
    );
  }, [filteredHorasPorEmpleado]);

  // Manejar archivo (ahora guarda en localStorage)
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array" });
    setWorkbook(wb);
    setFileName(file.name);

    // ✅ Guardar filename siempre
    localStorage.setItem(LOCAL_STORAGE_FILENAME_KEY, file.name);

    // ✅ Guardar timestamp de subida
    const uploadTimestamp = new Date().toISOString();
    localStorage.setItem(LOCAL_STORAGE_UPLOAD_TIMESTAMP_KEY, uploadTimestamp);

    // ✅ Guardar workbook si es posible
    try {
      const base64 = workbookToBase64(wb);
      localStorage.setItem(LOCAL_STORAGE_KEY, base64);
      console.log("[STORAGE] Workbook guardado en localStorage.");
    } catch (e) {
      console.error(
        "[STORAGE] No se pudo guardar workbook en localStorage:",
        e
      );
      showMessage(
        "Advertencia",
        "El archivo es muy grande y no se pudo guardar en el navegador. Recarga la página y el archivo desaparecerá."
      );
    }

    // set default month to Enero (index 0) and build preview
    setTimeout(() => buildPreviewForMonth(0, wb), 50);
  };

  // Detecta número de días en una hoja de mes
  const detectDaysInSheet = React.useCallback(
    (sheet: XLSX.WorkSheet, fallbackMonthIndex: number) => {
      // intenta contar columnas con datos desde C8 hacia la derecha
      let count = 0;
      for (let c = 2; c < 40; c++) {
        const col = XLSX.utils.encode_col(c);
        const cell = sheet[`${col}8`];
        if (cell && String(cell.v).toString().trim() !== "") count++;
        else if (count > 0 && c > 10) break; // si ya hallamos y después vacio, salimos
      }
      if (count >= 28 && count <= 31) return count;

      // fallback: contar datos en fila 9 (primer empleado) desde C9 en adelante
      let count2 = 0;
      for (let c = 2; c < 60; c++) {
        const col = XLSX.utils.encode_col(c);
        const cell = sheet[`${col}9`];
        if (cell && String(cell.v).toString().trim() !== "") count2++;
        else if (count2 > 0 && c > 10) break;
      }
      if (count2 >= 28 && count2 <= 31) return count2;

      // fallback al cálculo por mes y año (último recurso)
      const d = new Date(year, fallbackMonthIndex + 1, 0).getDate();
      return d;
    },
    [year]
  );

  // ✅ 2. Función setTurno
  const setTurno = (rowIdx: number, day: number, value: string) => {
    setPreviewRows((prev) =>
      prev.map((r) =>
        r.idx === rowIdx
          ? {
              ...r,
              estado: "corregido",
              cells: r.cells.map((c) =>
                c.day === day
                  ? {
                      ...c,
                      turno: value || null,
                      turnoId: value || "",
                      changed: true,
                    }
                  : c
              ),
            }
          : r
      )
    );

    // Guardar cambio en localStorage
    const changesKey = `${mesSeleccionado}-${rowIdx}-${day}`;
    const existingChanges = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_CHANGES_KEY) || "{}"
    );
    existingChanges[changesKey] = value || "";
    localStorage.setItem(
      LOCAL_STORAGE_CHANGES_KEY,
      JSON.stringify(existingChanges)
    );
  };

  // Construir preview para 1 mes
  // COPIA ESTE BLOQUE COMPLETO - Reemplaza desde "const buildPreviewForMonth"
  // hasta ANTES de la siguiente función (linkDocument, saveRow, etc.)

  const buildPreviewForMonth = React.useCallback(
    async (
      monthIndex: number,
      wbArg?: XLSX.WorkBook,
      setState: boolean = true
    ): Promise<PreviewRow[]> => {
      const wb = wbArg ?? workbook;
      if (!wb) {
        showMessage("Error", "Primero debe cargar un archivo Excel válido");
        return [];
      }

      // --- LECTURA FIJA DESDE B4 / C4 SEGÚN CANTIDAD INGRESADA ---
      const numEmpleados = Number(countNumber) || 0;
      if (!numEmpleados || numEmpleados < 1) {
        showMessage("Error", "Ingresa una cantidad válida de empleados");
        return [];
      }

      console.log("[PREVIEW] Cantidad de empleados ingresada:", numEmpleados);

      const empleadosSheet = wb.Sheets["Nombres de los empleados"];
      if (!empleadosSheet) {
        showMessage(
          "Error",
          'No se encontró la hoja "Nombres de los empleados"'
        );
        return [];
      }

      const empleadosList: {
        nombre: string;
        documento?: string;
        row?: number;
      }[] = [];

      for (let i = 0; i < numEmpleados; i++) {
        const rowExcel = 4 + i; // B4, C4...
        const nombre = empleadosSheet[`B${rowExcel}`]?.v ?? null;
        const documento = empleadosSheet[`C${rowExcel}`]?.v ?? null;

        if (!nombre || !documento) {
          console.warn(
            `[PREVIEW] ⚠️ Empleado omitido en fila ${rowExcel} (nombre o documento vacío)`
          );
          continue;
        }

        empleadosList.push({
          nombre: String(nombre).trim(),
          documento: String(documento).trim(),
          row: 9 + i, // EN TODAS LAS HOJAS MENSUALES EMPIEZA EN B9
        });

        console.log(
          `[PREVIEW] Empleado detectado: ${nombre} (${documento}) → fila mes ${
            9 + i
          }`
        );
      }

      console.log("[PREVIEW] Total empleados cargados:", empleadosList.length);

      // --- HOJA DEL MES ---
      const sheetNames = wb.SheetNames;
      const monthName = MONTH_NAMES[monthIndex];
      const sheetName =
        sheetNames.find(
          (s) =>
            typeof s === "string" &&
            typeof monthName === "string" &&
            s.toLowerCase().includes(monthName.toLowerCase())
        ) ?? null;

      if (!sheetName) {
        showMessage("Error", "Hoja del mes no encontrada");
        return [];
      }

      const monthSheet = wb.Sheets[sheetName];
      if (!monthSheet) {
        showMessage("Error", `Hoja ${sheetName} no encontrada`);
        return [];
      }

      console.log("[PREVIEW] Hoja del mes detectada:", sheetName);

      const days = detectDaysInSheet(monthSheet, monthIndex);
      if (setState && setDiasMes) setDiasMes(days);

      // --- CONSTRUIR PREVIEW ---
      const rows: PreviewRow[] = [];
      for (let idx = 0; idx < empleadosList.length; idx++) {
        const e = empleadosList[idx];
        const rowNum = e.row ?? 9;

        const cells: PreviewCell[] = [];
        for (let d = 1; d <= days; d++) {
          const colIndex = 2 + d; // C = col 2
          const colLetter = XLSX.utils.encode_col(colIndex - 1);
          const addr = `${colLetter}${rowNum}`;
          const c = monthSheet[addr];
          const turnoRaw = c?.v ? String(c.v).trim() : "";
          const turno = turnoRaw === "" ? "D" : turnoRaw;

          cells.push({ day: d, turno: turno, turnoId: turno });
        }

        const docNorm = String(e.documento ?? "").replace(/\D/g, "");
        const match = docNorm ? empleadosMap[docNorm] ?? undefined : undefined;

        rows.push({
          idx,
          nombre: e.nombre,
          documento: e.documento,
          uid: match ? match.id : null,
          cells,
          estado: match ? "pendiente" : "sin-usuario",
        });
      }

      // --- APLICAR CAMBIOS LOCALES ---
      const existingChanges = JSON.parse(
        localStorage.getItem(LOCAL_STORAGE_CHANGES_KEY) || "{}"
      );

      rows.forEach((row) => {
        row.cells.forEach((cell) => {
          const changesKey = `${monthIndex}-${row.idx}-${cell.day}`;
          if (existingChanges[changesKey] !== undefined) {
            cell.turno = existingChanges[changesKey] || null;
            cell.turnoId = existingChanges[changesKey] || "";
            cell.changed = true;
            row.estado = "corregido";
          }
        });
      });

      // --- 🔥 OPTIMIZACIÓN: CARGAR TODAS LAS JORNADAS DEL MES DE UNA SOLA VEZ ---
      console.log("[PREVIEW] Cargando datos de jornadas de Firestore...");

      const startDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
      const endDate = `${year}-${String(monthIndex + 1).padStart(
        2,
        "0"
      )}-${String(days).padStart(2, "0")}`;

      // 1 llamada a Firestore (NO 600)
      const allJornadas = await listarJornadasPorEmpresaRango({
        empresa: "NETCOL",
        desdeISO: startDate,
        hastaISO: endDate,
      });

      // Indexar por UID + fecha → acceso O(1)
      const jornadaIndex: Record<string, unknown> = {};
      for (const j of allJornadas) {
        jornadaIndex[`${j.userId}-${j.fecha}`] = j;
      }

      // Asignar jornadas sin hacer más llamadas
      for (const row of rows) {
        if (!row.uid) continue;

        for (const cell of row.cells) {
          const fecha = `${year}-${String(monthIndex + 1).padStart(
            2,
            "0"
          )}-${String(cell.day).padStart(2, "0")}`;

          const jornada = jornadaIndex[`${row.uid}-${fecha}`] as
            | {
                horaSalida?: string;
                horasExtras?: number;
                notaJefeExtra?: string;
              }
            | undefined;

          if (jornada) {
            cell.exitTime = jornada.horaSalida || undefined;
            cell.overtime = jornada.horasExtras || 0;
            cell.note = jornada.notaJefeExtra || undefined;
          }
        }
      }

      // --- ACTUALIZAR ESTADOS ---
      if (setState) {
        if (setPreviewRows) setPreviewRows(rows);
        if (setMesSeleccionado) setMesSeleccionado(monthIndex);
      }

      console.log("[PREVIEW] ✅ PREVIEW COMPLETADO CON DATOS DE FIRESTORE");
      return rows;
    },
    [
      workbook,
      countNumber,
      empleadosMap,
      showMessage,
      setDiasMes,
      setPreviewRows,
      setMesSeleccionado,
      detectDaysInSheet,
      year,
    ]
  ); // ← ESTE PARÉNTESIS CIERRA EL useCallback COMPLETO

  // ... (Resto de funciones: linkDocument, saveMonth, saveAllMonths)
  // vincular documento manualmente
  const linkDocument = (rowIdx: number, documento: string) => {
    const key = String(documento ?? "").replace(/\D/g, ""); // Solo dígitos
    const found = empleadosMap[key];
    if (!found) {
      showMessage("Error", "Documento no encontrado en usuarios");
      return false;
    }
    setPreviewRows((prev) =>
      prev.map((r) =>
        r.idx === rowIdx
          ? { ...r, uid: found.id, documento, estado: "pendiente" }
          : r
      )
    );
    return true;
  };

  // Guardar UN mes (usa MallaService y calcula jornadas)
  // Guardar fila específica (solo días cambiados)
  const saveRow = async (rowIdx: number) => {
    const row = previewRows.find((r) => r.idx === rowIdx);
    if (!row) return;

    setProcessing(true);
    try {
      console.log("🟡 Guardando fila:", row.nombre);

      const totalOps = await MallaService.saveDay({
        row,
        year,
        monthIndex: mesSeleccionado,
      });

      console.log(`✅ Fila guardada (${totalOps} escrituras).`);

      // Actualizar el workbook con los nuevos turnos
      if (workbook) {
        const updatedWorkbook = {
          ...workbook,
          Sheets: { ...workbook.Sheets },
        };

        const monthName = MONTH_NAMES[mesSeleccionado];
        const sheetName = Object.keys(updatedWorkbook.Sheets).find((s) =>
          s.toLowerCase().includes(monthName.toLowerCase())
        );
        if (sheetName) {
          const sheet = updatedWorkbook.Sheets[sheetName];
          const changedCells = row.cells.filter((c) => c.changed);

          // Encontrar la fila del empleado en el Excel (basado en el preview)
          // Asumiendo que el rowNum es 9 + idx, pero necesitamos mapear correctamente
          // Para simplicidad, buscar por nombre o documento, pero como es preview, usar el idx
          // En buildPreviewForMonth, empleadosList[idx].row = 9 + idx
          const rowNum = 9 + rowIdx; // Ajustar si es necesario

          changedCells.forEach((cell) => {
            const colIndex = 2 + cell.day; // C = col 2
            const colLetter = XLSX.utils.encode_col(colIndex - 1);
            const addr = `${colLetter}${rowNum}`;
            if (sheet[addr]) {
              sheet[addr].v = cell.turnoId || cell.turno || "";
            } else {
              sheet[addr] = { t: "s", v: cell.turnoId || cell.turno || "" };
            }
          });

          // Actualizar el estado del workbook
          setWorkbook(updatedWorkbook);

          // Guardar el workbook actualizado en localStorage
          try {
            const base64 = workbookToBase64(updatedWorkbook);
            localStorage.setItem(LOCAL_STORAGE_KEY, base64);
            console.log("[STORAGE] Workbook actualizado en localStorage.");
          } catch (e) {
            console.error("[STORAGE] Error guardando workbook:", e);
          }

          // Reconstruir el preview con el workbook actualizado
          await buildPreviewForMonth(mesSeleccionado, updatedWorkbook, true);
        }
      }

      showMessage("Success", "Fila guardada correctamente.");
    } catch (err: unknown) {
      console.error("❌ Error guardando fila:", err);
      showMessage(
        "Error",
        "Error guardando fila: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setProcessing(false);
    }
  };

  // Guardar meses seleccionados (INCREMENTAL - solo nuevos empleados)
  const saveSelectedMonths = async () => {
    if (!workbook) {
      showMessage("Error", "Primero selecciona un archivo Excel.");
      return;
    }

    if (selectedMonths.length === 0) {
      showMessage("Error", "Selecciona al menos un mes para guardar.");
      return;
    }

    setProcessing(true);
    setShowProgress(true);
    setProgress(0);

    try {
      console.log("🟡 Guardando meses seleccionados (modo incremental)...");

      let totalOps = 0;
      let empleadosNuevosTotal = 0;
      let empleadosOmitidosTotal = 0;
      const progressStep = 100 / selectedMonths.length;

      for (let i = 0; i < selectedMonths.length; i++) {
        const monthIndex = selectedMonths[i];
        console.log(
          `\n📅 Procesando mes ${monthIndex + 1} (${
            MONTH_NAMES[monthIndex]
          })...`
        );

        const previewRows = await buildPreviewForMonth(
          monthIndex,
          undefined,
          false
        );

        if (!previewRows || previewRows.length === 0) {
          console.warn(`⚠️ Mes ${monthIndex + 1}: no hay datos para guardar.`);
          setProgress((i + 1) * progressStep);
          continue;
        }

        console.log(
          `📋 Total de empleados en el Excel para este mes: ${previewRows.length}`
        );

        // 🔥 FILTRAR EMPLEADO POR EMPLEADO
        const empleadosSinDatos: typeof previewRows = [];
        let empleadosNuevosMes = 0;
        let empleadosOmitidosMes = 0;

        for (const row of previewRows) {
          if (!row.uid) {
            console.warn(
              `⚠️ ${row.nombre} (${row.documento}) sin UID en sistema, se omite`
            );
            continue;
          }

          // 🔍 Verificar si este empleado específico tiene datos de ESTE MES
          const mallaRef = collection(
            db,
            "usuarios",
            row.uid,
            "malla",
            String(year),
            "dias"
          );

          // Buscar cualquier día de este mes para este empleado
          const checkQuery = query(
            mallaRef,
            where("mes", "==", monthIndex + 1),
            where("año", "==", year)
          );

          console.log(
            `🔍 Verificando ${row.nombre} (${row.documento}) - UID: ${row.uid}...`
          );

          const existingDocs = await getDocs(checkQuery);

          if (!existingDocs.empty) {
            console.log(
              `   ⏭️  YA TIENE ${existingDocs.size} días guardados - SE OMITE`
            );
            empleadosOmitidosMes++;
            continue;
          } else {
            console.log(`   ✅ NO tiene datos - SE PROCESARÁ`);
            empleadosSinDatos.push(row);
            empleadosNuevosMes++;
          }
        }

        console.log(`\n📊 Resumen del mes ${monthIndex + 1}:`);
        console.log(`   - Empleados a procesar: ${empleadosNuevosMes}`);
        console.log(`   - Empleados omitidos: ${empleadosOmitidosMes}`);

        empleadosNuevosTotal += empleadosNuevosMes;
        empleadosOmitidosTotal += empleadosOmitidosMes;

        // Si no hay empleados nuevos en este mes, continuar
        if (empleadosSinDatos.length === 0) {
          console.log(
            `⏭️ Mes ${
              monthIndex + 1
            }: todos los empleados del Excel ya tienen datos\n`
          );
          setProgress((i + 1) * progressStep);
          continue;
        }

        // 🔥 GUARDAR SOLO EMPLEADOS NUEVOS CON EL SERVICIO ORIGINAL
        console.log(
          `💾 Guardando malla para ${empleadosSinDatos.length} empleado(s) nuevo(s)...`
        );

        const ops = await MallaService.saveMonth({
          previewRows: empleadosSinDatos,
          year,
          monthIndex,
        });

        console.log(
          `🧮 Calculando jornadas para estos ${empleadosSinDatos.length} empleado(s)...`
        );

        await MallaService.calculateJornadasForMonth({
          previewRows: empleadosSinDatos,
          year,
          monthIndex,
        });

        totalOps += ops;
        console.log(
          `✅ Mes ${monthIndex + 1} completado (${ops} operaciones)\n`
        );

        setProgress((i + 1) * progressStep);
      }

      setProgress(100);

      console.log(`\n🏁 RESUMEN FINAL:`);
      console.log(`   - Total empleados procesados: ${empleadosNuevosTotal}`);
      console.log(`   - Total empleados omitidos: ${empleadosOmitidosTotal}`);
      console.log(`   - Total operaciones: ${totalOps}`);

      showMessage(
        "Success",
        `✅ Guardado incremental completado.\n\n` +
          `📊 Empleados del Excel procesados: ${empleadosNuevosTotal}\n` +
          `⏭️ Empleados del Excel omitidos (ya tenían datos): ${empleadosOmitidosTotal}\n` +
          `💾 Total de operaciones: ${totalOps}\n\n` +
          `Las jornadas han sido calculadas automáticamente.`
      );
    } catch (err: unknown) {
      console.error("❌ Error en guardado incremental:", err);
      showMessage(
        "Error",
        "Error guardando meses: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setProcessing(false);
      setTimeout(() => {
        setShowProgress(false);
        setProgress(0);
      }, 1000);
    }
  };

  // Guardar TODOS los meses (INCREMENTAL)
  const saveAllMonths = async () => {
    if (!workbook) {
      showMessage("Error", "Primero selecciona un archivo Excel.");
      return;
    }

    setProcessing(true);
    try {
      console.log("🟡 Guardando TODOS los meses (modo incremental)...");

      let totalOps = 0;
      let empleadosNuevosTotal = 0;
      let empleadosOmitidosTotal = 0;

      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        console.log(`\n📅 Procesando mes ${monthIndex + 1}...`);

        const previewRows = await buildPreviewForMonth(
          monthIndex,
          undefined,
          false
        );

        if (!previewRows || previewRows.length === 0) {
          console.warn(`⚠️ Mes ${monthIndex + 1}: no hay datos.`);
          continue;
        }

        const empleadosSinDatos: typeof previewRows = [];

        for (const row of previewRows) {
          if (!row.uid) continue;

          const mallaRef = collection(
            db,
            "usuarios",
            row.uid,
            "malla",
            String(year),
            "dias"
          );
          const checkQuery = query(
            mallaRef,
            where("mes", "==", monthIndex + 1),
            where("año", "==", year)
          );
          const existingDocs = await getDocs(checkQuery);

          if (!existingDocs.empty) {
            empleadosOmitidosTotal++;
            console.log(`   ⏭️  ${row.nombre} ya tiene datos`);
            continue;
          }

          empleadosSinDatos.push(row);
          empleadosNuevosTotal++;
          console.log(`   ✅ ${row.nombre} será procesado`);
        }

        if (empleadosSinDatos.length === 0) {
          console.log(`⏭️ Mes ${monthIndex + 1}: todos tienen datos`);
          continue;
        }

        const ops = await MallaService.saveMonth({
          previewRows: empleadosSinDatos,
          year,
          monthIndex,
        });

        await MallaService.calculateJornadasForMonth({
          previewRows: empleadosSinDatos,
          year,
          monthIndex,
        });

        totalOps += ops;
        console.log(`✅ Mes ${monthIndex + 1} completado\n`);
      }

      showMessage(
        "Success",
        `✅ Proceso completado.\n` +
          `📊 Empleados procesados: ${empleadosNuevosTotal}\n` +
          `⏭️ Empleados omitidos: ${empleadosOmitidosTotal}\n` +
          `💾 Total operaciones: ${totalOps}\n\n` +
          `Las jornadas han sido calculadas automáticamente.`
      );
      console.log(`🏁 Guardado completo finalizado.`);
    } catch (err: unknown) {
      console.error("❌ Error guardando todos los meses:", err);
      showMessage(
        "Error",
        "Error: " + (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setProcessing(false);
    }
  };
  // Eliminar TODO: jornadas, malla y archivo Excel (Masivo o Individual)
  const eliminarTodo = async () => {
    setProcessing(true);
    try {
      const esMasivo = !usuarioSeleccionado;
      const userId = usuarioSeleccionado || undefined;

      console.log(
        esMasivo
          ? "🟡 Eliminando TODAS las jornadas y malla..."
          : `🟡 Eliminando datos del usuario: ${usuarioSeleccionado}`
      );

      // Función auxiliar para eliminar en batches
      const deleteInBatches = async (queryRef: unknown, userId?: string) => {
        let snapshot;

        if (userId) {
          snapshot = await getDocs(
            query(
              queryRef as ReturnType<typeof collectionGroup>,
              where("userId", "==", userId)
            )
          );
        } else {
          snapshot = await getDocs(
            queryRef as ReturnType<typeof collectionGroup>
          );
        }

        const batchSize = 400;
        let totalDeleted = 0;

        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = writeBatch(db);
          const batchDocs = snapshot.docs.slice(i, i + batchSize);

          batchDocs.forEach((doc) => {
            batch.delete(doc.ref);
          });

          await batch.commit();
          totalDeleted += batchDocs.length;
          console.log(`✅ Batch eliminado: ${batchDocs.length} documentos`);
        }

        return totalDeleted;
      };

      let jornadasDeleted = 0;
      let diasDeleted = 0;

      // Eliminar jornadas si corresponde
      if (tipoEliminacion === "todo" || tipoEliminacion === "jornadas") {
        const jornadasQuery = collectionGroup(db, "jornadas");
        jornadasDeleted = await deleteInBatches(jornadasQuery, userId);
        console.log(`🗑️ Jornadas eliminadas: ${jornadasDeleted}`);
      }

      // Eliminar malla (días) si corresponde
      if (tipoEliminacion === "todo" || tipoEliminacion === "malla") {
        const diasQuery = collectionGroup(db, "dias");
        diasDeleted = await deleteInBatches(diasQuery, userId);
        console.log(`🗑️ Días de malla eliminados: ${diasDeleted}`);
      }

      // Solo limpiar localStorage si es eliminación masiva y total
      if (esMasivo && tipoEliminacion === "todo") {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        localStorage.removeItem(LOCAL_STORAGE_FILENAME_KEY);
        localStorage.removeItem(LOCAL_STORAGE_UPLOAD_TIMESTAMP_KEY);

        setWorkbook(null);
        setFileName("");
        setPreviewRows([]);
        setMesSeleccionado(0);
        setDiasMes(31);
      }

      const mensaje = esMasivo
        ? `Todo ha sido eliminado correctamente. Jornadas: ${jornadasDeleted}, Días: ${diasDeleted}.`
        : `Datos del usuario eliminados. Jornadas: ${jornadasDeleted}, Días: ${diasDeleted}.`;

      showMessage("Success", mensaje);
      console.log("🏁 Eliminación finalizada.");

      setUsuarioSeleccionado("");
    } catch (err: unknown) {
      console.error("❌ Error eliminando:", err);
      showMessage(
        "Error",
        "Error eliminando: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setProcessing(false);
    }
  };
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Malla de Empleados - {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Año:</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border px-2 py-1 rounded w-24"
              />
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <label className="text-sm">Empleados:</label>
              <input
                type="number"
                value={countNumber}
                onChange={(e) =>
                  setCountNumber(
                    e.target.value === "" ? "" : Number(e.target.value)
                  )
                }
                className="border px-2 py-1 rounded w-20"
                placeholder="9"
                min="1"
                max="50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Cargar Archivo Excel
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Input type="file" accept=".xlsx,.xls" onChange={onFile} />
            {fileName && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {fileName}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {showProgress && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Guardando mes...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month Selection for Viewing */}
      {workbook && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Mes para ver
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 max-w-lg">
              {MONTH_NAMES.map((month, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={mesSeleccionado === index ? "default" : "outline"}
                  size="sm"
                  className={`text-xs h-9 w-full font-medium ${
                    mesSeleccionado === index
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                      : "hover:bg-gray-50 border-gray-300"
                  }`}
                  onClick={() => buildPreviewForMonth(index)}
                  disabled={processing}
                >
                  {month.slice(0, 3)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Month Selection for Saving */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            Seleccionar meses para guardar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 max-w-lg">
            {MONTH_NAMES.map((month, index) => (
              <Button
                key={month} // 🔥 clave estable
                type="button"
                variant={selectedMonths.includes(index) ? "default" : "outline"}
                size="sm"
                className={`text-xs h-9 w-full font-medium ${
                  selectedMonths.includes(index)
                    ? "bg-green-600 hover:bg-green-700 text-white shadow-sm"
                    : "hover:bg-gray-50 border-gray-300"
                }`}
                onClick={() => {
                  if (selectedMonths.includes(index)) {
                    setSelectedMonths((prev) =>
                      prev.filter((m) => m !== index)
                    );
                  } else {
                    setSelectedMonths((prev) => [...prev, index]);
                  }
                }}
                disabled={processing}
              >
                {month.slice(0, 3)}
              </Button>
            ))}
          </div>
          {selectedMonths.length > 0 && (
            <Badge variant="outline" className="mt-2">
              {selectedMonths.length} mes
              {selectedMonths.length !== 1 ? "es" : ""} seleccionado
              {selectedMonths.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </CardContent>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => saveSelectedMonths()}
              disabled={processing || !workbook || selectedMonths.length === 0}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar meses seleccionados ({selectedMonths.length})
            </Button>
            <Button
              onClick={() => saveAllMonths()}
              disabled={processing || !workbook}
            >
              <Save className="h-4 w-4 mr-2" />
              Guardar todos los meses
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* NUEVO: Opciones de Eliminación */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Opciones de Eliminación
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Selector de tipo de eliminación */}
          <div>
            <Label className="mb-2 block">¿Qué deseas eliminar?</Label>
            <Select
              value={tipoEliminacion}
              onValueChange={(value: "todo" | "jornadas" | "malla") =>
                setTipoEliminacion(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">Todo (Jornadas + Malla)</SelectItem>
                <SelectItem value="jornadas">Solo Jornadas</SelectItem>
                <SelectItem value="malla">Solo Malla</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Selector de usuario */}
          <div className="space-y-2">
            <Button
              onClick={cargarUsuarios}
              variant="outline"
              className="w-full"
              disabled={processing}
            >
              <Users className="h-4 w-4 mr-2" />
              Cargar Lista de Usuarios
            </Button>

            {usuarios.length > 0 && (
              <div>
                <Label className="mb-2 block">
                  Seleccionar usuario (opcional)
                </Label>
                <Select
                  value={usuarioSeleccionado}
                  onValueChange={setUsuarioSeleccionado}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los usuarios (Masivo)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">
                      Todos los usuarios (Masivo)
                    </SelectItem>

                    {usuarios.map((usuario) => (
                      <SelectItem key={`user-${usuario.id}`} value={usuario.id}>
                        {usuario.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Botón de eliminar con confirmación */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                disabled={processing}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {usuarioSeleccionado
                  ? `Eliminar ${tipoEliminacion} del usuario seleccionado`
                  : `Eliminar ${tipoEliminacion} de TODOS los usuarios`}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                <AlertDialogDescription>
                  {usuarioSeleccionado
                    ? `Esto eliminará ${tipoEliminacion} del usuario seleccionado.`
                    : `Esto eliminará ${tipoEliminacion} de TODOS los usuarios.`}{" "}
                  Esta acción no se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={eliminarTodo}>
                  Sí, eliminar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Modal de Horas Extra */}
      <Dialog open={extraHoursModalOpen} onOpenChange={setExtraHoursModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Agregar Horas Extra - Día {selectedDayForExtra}
            </DialogTitle>
            <DialogDescription>
              Agregue horas extra para {selectedRowForExtra?.nombre} en el día{" "}
              {selectedDayForExtra}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de horas extra</Label>
              <Select
                value={extraHoursType}
                onValueChange={(value: "exact" | "amount") =>
                  setExtraHoursType(value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Hora exacta de salida</SelectItem>
                  <SelectItem value="amount">
                    Cantidad de horas (+1h, +2h, +3h)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {extraHoursType === "exact" ? (
              <div>
                <Label htmlFor="exit-time">Nueva hora de salida</Label>
                <Input
                  id="exit-time"
                  type="time"
                  value={newExitTime}
                  onChange={(e) => setNewExitTime(e.target.value)}
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="hours-amount">Horas adicionales</Label>
                <Select
                  value={extraHoursAmount.toString()}
                  onValueChange={(value) => setExtraHoursAmount(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">+1 hora</SelectItem>
                    <SelectItem value="2">+2 horas</SelectItem>
                    <SelectItem value="3">+3 horas</SelectItem>
                    <SelectItem value="4">+4 horas</SelectItem>
                    <SelectItem value="5">+5 horas</SelectItem>
                    <SelectItem value="6">+6 horas</SelectItem>
                    <SelectItem value="7">+7 horas</SelectItem>
                    <SelectItem value="8">+8 horas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="note">Nota del jefe</Label>
              <textarea
                id="note"
                className="w-full border rounded px-3 py-2"
                rows={3}
                value={extraHoursNote}
                onChange={(e) => setExtraHoursNote(e.target.value)}
                placeholder="Indique el motivo de las horas extra"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExtraHoursModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={agregarHorasExtra} disabled={processing}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Message Dialog */}
      <AlertDialog open={messageDialogOpen} onOpenChange={setMessageDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{messageTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {messageDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setMessageDialogOpen(false)}>
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Days in Month */}
      <div className="text-sm text-muted-foreground">
        Días en mes: {diasMes}
      </div>

      {/* Preview table (scroll) */}
      <div className="overflow-auto border rounded">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Empleado</th>
              <th className="p-2 text-left">Documento</th>
              <th className="p-2">Estado</th>
              {Array.from({ length: diasMes }).map((_, i) => (
                <th key={i} className="p-1 text-center">
                  {i + 1}
                </th>
              ))}
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row) => (
              <tr key={row.idx} className="even:bg-gray-50">
                <td className="p-2">{row.nombre}</td>
                <td className="p-2">
                  {row.documento ?? (
                    <em className="text-red-600">sin documento</em>
                  )}
                </td>
                <td className="p-2">
                  {row.uid ? (
                    <Badge variant="default">OK</Badge>
                  ) : (
                    <Badge variant="destructive">Sin usuario</Badge>
                  )}
                </td>
                {row.cells.slice(0, diasMes).map((c) => (
                  <td key={c.day} className="p-1 text-center min-w-[120px]">
                    <div className="flex flex-col items-center space-y-1">
                      <input
                        className="w-14 text-center border rounded px-1 text-xs"
                        value={c.turno ?? ""}
                        onChange={(e) =>
                          setTurno(row.idx, c.day, e.target.value)
                        }
                      />
                      {c.exitTime && (
                        <div className="text-xs text-gray-600">
                          Salida: {c.exitTime}
                        </div>
                      )}
                      {c.overtime && c.overtime > 0 && (
                        <div className="text-xs text-blue-600 font-medium">
                          Extra: {c.overtime}h
                        </div>
                      )}
                      {c.note && (
                        <div
                          className="text-xs text-green-600 max-w-[100px] truncate"
                          title={c.note}
                        >
                          Nota: {c.note}
                        </div>
                      )}
                      {c.turno && c.turno !== "D" && row.uid && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-1 text-xs"
                          onClick={() => {
                            setSelectedRowForExtra(row);
                            setSelectedDayForExtra(c.day);
                            setNewExitTime(c.exitTime || "");
                            setExtraHoursModalOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                ))}
                <td className="p-2">
                  {row.uid ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPreviewRows((prev) =>
                            prev.map((r) =>
                              r.idx === row.idx ? { ...r, estado: "listo" } : r
                            )
                          )
                        }
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveRow(row.idx)}
                      >
                        Guardar Día
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Documento"
                        id={`link-${row.idx}`}
                        className="w-32"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const inp = document.getElementById(
                            `link-${row.idx}`
                          ) as HTMLInputElement;
                          if (!inp) return;
                          linkDocument(row.idx, inp.value);
                        }}
                      >
                        Vincular
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {previewRows.length === 0 && (
              <tr>
                <td
                  colSpan={4 + diasMes}
                  className="p-6 text-center text-sm text-muted-foreground"
                >
                  Sube un archivo excel
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Resumen de Horas por Empleado */}
      {horasPorEmpleado.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Resumen de Horas - {MONTH_NAMES[mesSeleccionado]} {year}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filtros */}
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Fecha desde
                  </label>
                  <Input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Fecha hasta
                  </label>
                  <Input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Buscar por nombre o documento
                  </label>
                  <Input
                    type="text"
                    placeholder="Buscar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Horas mínimas
                  </label>
                  <Input
                    type="number"
                    placeholder="Min"
                    value={minHours}
                    onChange={(e) =>
                      setMinHours(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full"
                    min="0"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    Horas máximas
                  </label>
                  <Input
                    type="number"
                    placeholder="Max"
                    value={maxHours}
                    onChange={(e) =>
                      setMaxHours(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full"
                    min="0"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyWithHours}
                      onChange={(e) => setOnlyWithHours(e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm font-medium">
                      Solo con horas asignadas
                    </span>
                  </label>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFechaDesde("");
                      setFechaHasta("");
                      setSearchTerm("");
                      setMinHours("");
                      setMaxHours("");
                      setOnlyWithHours(false);
                    }}
                    className="w-full"
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </div>
              {(fechaDesde ||
                fechaHasta ||
                searchTerm ||
                minHours !== "" ||
                maxHours !== "" ||
                onlyWithHours) && (
                <div className="text-sm text-gray-600">
                  Mostrando {filteredHorasPorEmpleado.length} de{" "}
                  {horasPorEmpleado.length} empleados
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-2">
                {filteredHorasPorEmpleado.map((emp, index) => (
                  <div
                    key={index}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <span className="font-medium">{emp.nombre}</span>
                      {emp.documento && (
                        <span className="text-sm text-gray-600 ml-2">
                          ({emp.documento})
                        </span>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {emp.horasTotales} horas
                    </Badge>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="font-bold text-lg">
                  Total de empleados mostrados
                </span>
                <Badge
                  variant="default"
                  className="text-xl px-4 py-2 bg-blue-600"
                >
                  {totalHorasFiltradas} horas
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
