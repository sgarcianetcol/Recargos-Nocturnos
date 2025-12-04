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
import { writeBatch, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle,
  Upload,
  Save,
  Trash2,
  Calendar,
  Users,
  FileSpreadsheet,
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

  // Función para mostrar mensajes
  const showMessage = React.useCallback(
    (title: string, description: string) => {
      setMessageTitle(title);
      setMessageDescription(description);
      setMessageDialogOpen(true);
    },
    []
  );

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
  const buildPreviewForMonth = React.useCallback(
    async (
      monthIndex: number,
      wbArg?: XLSX.WorkBook,
      setState: boolean = true
    ): Promise<PreviewRow[]> => {
      const wb = wbArg ?? workbook; // Usa el argumento o el estado
      if (!wb) {
        showMessage("Error", "Primero sube el Excel.");
        return [];
      }

      // ... (Resto de tu lógica buildPreviewForMonth sin cambios)
      console.log("[PREVIEW] === INICIANDO PREVIEW ===");

      const sheetNames = wb.SheetNames.map((s) => s.trim());

      // --- FORZAMOS HOJA DE EMPLEADOS FIJA ---
      const empleadosSheet = wb.Sheets["Nombres de los empleados"];
      if (!empleadosSheet) {
        showMessage(
          "Error",
          "No se encontró la hoja 'Nombres de los empleados'"
        );
        return [];
      }

      // --- LECTURA FIJA DESDE B4 / C4 SEGÚN CANTIDAD INGRESADA ---
      const numEmpleados = Number(countNumber) || 0;
      if (!numEmpleados || numEmpleados < 1) {
        showMessage("Error", "Ingresa una cantidad válida de empleados");
        return [];
      }

      console.log("[PREVIEW] Cantidad de empleados ingresada:", numEmpleados);

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
      const monthName = MONTH_NAMES[monthIndex];
      const sheetName =
        sheetNames.find(
          (s) =>
            typeof s === "string" &&
            typeof monthName === "string" &&
            s.toLowerCase().includes(monthName.toLowerCase())
        ) ?? null;

      if (!sheetName) {
        showMessage("Error", "Usuarios Guardados");
        return [];
      }
      const monthSheet = wb.Sheets[sheetName];
      if (!monthSheet) {
        showMessage("Error", `Hoja ${sheetName} no encontrada`);
        return [];
      }

      console.log("[PREVIEW] Hoja del mes detectada:", sheetName);

      const days = detectDaysInSheet(monthSheet, monthIndex);
      if (setState) {
        setDiasMes(days);
      }

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

        // map documento -> uid
        const docNorm = String(e.documento ?? "").replace(/\D/g, ""); // Solo dígitos
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

      // Aplicar cambios guardados en localStorage para este mes
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

      if (setState) {
        setPreviewRows(rows);
        setMesSeleccionado(monthIndex);
      }

      console.log("[PREVIEW] ✅ PREVIEW COMPLETADO");
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
    ]
  );

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

  // Guardar meses seleccionados
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
      console.log(
        "🟡 Guardando meses seleccionados:",
        selectedMonths.map((m) => m + 1)
      );

      let totalOps = 0;
      const progressStep = 100 / selectedMonths.length;

      for (let i = 0; i < selectedMonths.length; i++) {
        const monthIndex = selectedMonths[i];
        const previewRows = await buildPreviewForMonth(
          monthIndex,
          undefined,
          false
        );
        if (!previewRows || previewRows.length === 0) {
          console.warn(`⚠️ Mes ${monthIndex + 1}: no hay datos para guardar.`);
          continue;
        }

        const ops = await MallaService.saveMonth({
          previewRows,
          year,
          monthIndex,
        });

        // Calcular jornadas después de guardar la malla
        await MallaService.calculateJornadasForMonth({
          previewRows,
          year,
          monthIndex,
        });

        totalOps += ops;
        setProgress((i + 1) * progressStep);
      }

      setProgress(100);

      showMessage(
        "Success",
        `Meses seleccionados guardados correctamente. Total escrituras: ${totalOps}. Las jornadas han sido calculadas automáticamente.`
      );
      console.log(
        `🏁 Guardado de meses seleccionados finalizado con ${totalOps} operaciones.`
      );
    } catch (err: unknown) {
      console.error("❌ Error guardando meses seleccionados:", err);
      showMessage(
        "Error",
        "Error guardando meses seleccionados: " +
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

  // Guardar TODOS los meses (usa MallaService.saveAllMonths que incluye cálculo de jornadas)
  const saveAllMonths = async () => {
    if (!workbook) {
      showMessage("Error", "Primero selecciona un archivo Excel.");
      return;
    }

    setProcessing(true);
    try {
      console.log("🟡 Guardando TODOS los meses...");

      const totalOps = await MallaService.saveAllMonths({
        year,
        buildRowsForMonth: async (monthIndex: number) => {
          const previewRows = await buildPreviewForMonth(monthIndex);
          if (!previewRows || previewRows.length === 0) {
            console.warn(
              `⚠️ Mes ${monthIndex + 1}: no hay datos para guardar.`
            );
            return [];
          }
          return previewRows;
        },
      });

      showMessage(
        "Success",
        `Proceso completado. Total escrituras: ${totalOps}. Las jornadas han sido calculadas automáticamente.`
      );
      console.log(`🏁 Guardado global finalizado con ${totalOps} operaciones.`);
    } catch (err: unknown) {
      console.error("❌ Error guardando todos los meses:", err);
      showMessage(
        "Error",
        "Error guardando todos los meses: " +
          (err instanceof Error ? err.message : String(err))
      );
    } finally {
      setProcessing(false);
    }
  };

  // Eliminar TODO: jornadas, malla y archivo Excel
  const eliminarTodo = async () => {
    setProcessing(true);
    try {
      console.log("🟡 Eliminando TODAS las jornadas y malla...");

      // Función auxiliar para eliminar en batches
      const deleteInBatches = async (query: unknown) => {
        const snapshot = await getDocs(
          query as ReturnType<typeof collectionGroup>
        );
        const batchSize = 400; // Límite seguro por batch
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

      // Eliminar todas las jornadas
      const jornadasQuery = collectionGroup(db, "jornadas");
      const jornadasDeleted = await deleteInBatches(jornadasQuery);
      console.log(`🗑️ Jornadas eliminadas: ${jornadasDeleted}`);

      // Eliminar toda la malla (días)
      const diasQuery = collectionGroup(db, "dias");
      const diasDeleted = await deleteInBatches(diasQuery);
      console.log(`🗑️ Días de malla eliminados: ${diasDeleted}`);

      // Limpiar localStorage
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem(LOCAL_STORAGE_FILENAME_KEY);
      localStorage.removeItem(LOCAL_STORAGE_UPLOAD_TIMESTAMP_KEY);

      // Resetear estado
      setWorkbook(null);
      setFileName("");
      setPreviewRows([]);
      setMesSeleccionado(0);
      setDiasMes(31);

      showMessage(
        "Success",
        `Todo ha sido eliminado correctamente. Jornadas: ${jornadasDeleted}, Días: ${diasDeleted}.`
      );
      console.log("🏁 Eliminación completa finalizada.");
    } catch (err: unknown) {
      console.error("❌ Error eliminando todo:", err);
      showMessage(
        "Error",
        "Error eliminando todo: " +
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
                key={index}
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
      </Card>

      {/* Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            Acciones
          </CardTitle>
        </CardHeader>
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={processing}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar TODO
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción eliminará TODAS las jornadas creadas, TODA la
                    malla guardada y el archivo Excel cargado. Esta acción no se
                    puede deshacer.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={eliminarTodo}>
                    Sí, eliminar TODO
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

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
                  <td key={c.day} className="p-1 text-center">
                    <input
                      className="w-14 text-center border rounded px-1 text-xs"
                      value={c.turno ?? ""}
                      onChange={(e) => setTurno(row.idx, c.day, e.target.value)}
                    />
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
