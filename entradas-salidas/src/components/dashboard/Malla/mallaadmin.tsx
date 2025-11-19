"use client";
import React from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EmpleadoService } from "@/services/usuariosService";
import type { Empleado } from "@/models/usuarios.model";
import { MallaService } from "@/services/malla.service";
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";

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

// ... (Resto de tipos y MONTH_NAMES)

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
  const [readMode, setReadMode] = React.useState<"sheet" | "count">("sheet");
  const [countStartRow, setCountStartRow] = React.useState<number>(9);
  const [countNumber, setCountNumber] = React.useState<number | "">(9);
  const [processing, setProcessing] = React.useState(false);
  const [year, setYear] = React.useState<number>(new Date().getFullYear());
  const [fileName, setFileName] = React.useState<string>("");

  // ✅ 1. Estado para las filas del preview
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);

  // Estado para el diálogo de mensajes
  const [messageDialogOpen, setMessageDialogOpen] = React.useState(false);
  const [messageTitle, setMessageTitle] = React.useState("");
  const [messageDescription, setMessageDescription] = React.useState("");

  // Estado para el progreso
  const [showProgress, setShowProgress] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  // Función para mostrar mensajes
  const showMessage = (title: string, description: string) => {
    setMessageTitle(title);
    setMessageDescription(description);
    setMessageDialogOpen(true);
  };

  // --- EFECTO: CARGAR WORKBOOK Y FILENAME DE LOCAL STORAGE ---
  React.useEffect(() => {
    // Solo se ejecuta en el cliente
    if (typeof window === "undefined") return;

    const savedBase64 = localStorage.getItem(LOCAL_STORAGE_KEY);
    const savedFileName = localStorage.getItem(LOCAL_STORAGE_FILENAME_KEY);

    // Cargar filename siempre si existe
    if (savedFileName) setFileName(savedFileName);

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

  // --- EFECTO: CONSTRUIR PREVIEW CUANDO WORKBOOK Y EMPLEADOSMAP ESTÉN LISTOS ---
  React.useEffect(() => {
    if (workbook && Object.keys(empleadosMap).length > 0) {
      buildPreviewForMonth(0, workbook, true);
    }
  }, [workbook, empleadosMap]);

  // Cargar usuarios (map por documento)
  React.useEffect(() => {
    // ... (Tu código actual de carga de usuarios)
    (async () => {
      const list = await EmpleadoService.listar({ limite: undefined });
      const map: Record<string, Empleado> = {};
      for (const u of list) {
        const k = String(u.documento ?? "").replace(/\D/g, ""); // Solo dígitos
        if (k) map[k] = u;
      }
      setEmpleadosMap(map);
    })();
  }, []);

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
  // ... (Tu código actual de detectDaysInSheet)
  const detectDaysInSheet = (
    sheet: XLSX.WorkSheet,
    fallbackMonthIndex: number
  ) => {
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
  };

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
  };

  // Construir preview para 1 mes
  const buildPreviewForMonth = async (
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
      showMessage("Error", "No se encontró la hoja 'Nombres de los empleados'");
      return [];
    }

    // --- LECTURA FIJA DESDE B4 / C4 SEGÚN CANTIDAD INGRESADA ---
    const numEmpleados = Number(countNumber) || 0;
    if (!numEmpleados || numEmpleados < 1) {
      showMessage("Error", "Ingresa una cantidad válida de empleados");
      return [];
    }

    console.log("[PREVIEW] Cantidad de empleados ingresada:", numEmpleados);

    let empleadosList: { nombre: string; documento?: string; row?: number }[] =
      [];

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

    sheetNames[monthIndex] ?? null;

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

    if (setState) {
      setPreviewRows(rows);
      setMesSeleccionado(monthIndex);
    }

    console.log("[PREVIEW] ✅ PREVIEW COMPLETADO");
    return rows;
  };

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
  const saveMonth = async (monthIndex: number) => {
    if (!previewRows.length) {
      showMessage("Error", "No hay preview para guardar.");
      return;
    }

    setProcessing(true);
    setShowProgress(true);
    setProgress(0);

    try {
      console.log("🟡 Guardando mes:", monthIndex + 1);

      // Simular progreso del 1 al 100
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const totalOps = await MallaService.saveMonth({
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

      clearInterval(progressInterval);
      setProgress(100);

      console.log(
        `✅ Guardado del mes ${
          monthIndex + 1
        } completado (${totalOps} escrituras).`
      );
      showMessage(
        "Success",
        `Mes ${
          monthIndex + 1
        } guardado correctamente. Las jornadas han sido calculadas automáticamente.`
      );
    } catch (err: any) {
      console.error("❌ Error guardando mes:", err);
      showMessage(
        "Error",
        "Error guardando mes: " + (err?.message ?? String(err))
      );
    } finally {
      setProcessing(false);
      setTimeout(() => {
        setShowProgress(false);
        setProgress(0);
      }, 1000);
    }
  };
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

      // Marcar como listo y resetear cambios
      setPreviewRows((prev) =>
        prev.map((r) =>
          r.idx === rowIdx
            ? {
                ...r,
                estado: "listo",
                cells: r.cells.map((c) => ({ ...c, changed: false })),
              }
            : r
        )
      );

      showMessage("Success", "Fila guardada correctamente.");
    } catch (err: any) {
      console.error("❌ Error guardando fila:", err);
      showMessage(
        "Error",
        "Error guardando fila: " + (err?.message ?? String(err))
      );
    } finally {
      setProcessing(false);
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
    } catch (err: any) {
      console.error("❌ Error guardando todos los meses:", err);
      showMessage(
        "Error",
        "Error guardando todos los meses: " + (err?.message ?? String(err))
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
      const deleteInBatches = async (query: any) => {
        const snapshot = await getDocs(query);
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
    } catch (err: any) {
      console.error("❌ Error eliminando todo:", err);
      showMessage(
        "Error",
        "Error eliminando todo: " + (err?.message ?? String(err))
      );
    } finally {
      setProcessing(false);
    }
  };

  return (
    // ... (Tu JSX sin cambios)
    <div className="p-6 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger />
          <h1 className="text-2xl font-bold">Malla de Empleados</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Año:</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="border px-2 rounded w-24"
          />
        </div>
      </header>

      {showProgress && (
        <div className="mb-4">
          <Progress value={progress} className="w-full" />
          <p className="text-sm text-center mt-2">
            Guardando mes... {progress}%
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2">
          <Input type="file" accept=".xlsx,.xls" onChange={onFile} />
          {fileName && (
            <span className="text-xs text-green-600">
              ✅ Excel cargado: {fileName}
            </span>
          )}
        </label>
        <div>
          <label>Mes:</label>
          <select
            value={mesSeleccionado}
            onChange={(e) => buildPreviewForMonth(Number(e.target.value))}
            className="border px-2 rounded ml-2"
            disabled={!workbook}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Empleados:</label>
          <input
            type="number"
            value={countNumber}
            onChange={(e) =>
              setCountNumber(
                e.target.value === "" ? "" : Number(e.target.value)
              )
            }
            className="border px-2 rounded w-20"
            placeholder="9"
            min="1"
            max="50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => saveMonth(mesSeleccionado)}
            disabled={processing || previewRows.length === 0}
          >
            Guardar mes
          </Button>
          <Button
            onClick={() => saveAllMonths()}
            disabled={processing || !workbook}
          >
            Guardar todos los meses
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={processing}>
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
      </div>

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

      <div>
        <p className="text-sm text-muted-foreground">Días en mes: {diasMes}</p>
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
                    <span className="text-green-600">OK</span>
                  ) : (
                    <span className="text-red-600">Sin usuario</span>
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
                        onClick={() => saveRow(row.idx)}
                        disabled={processing}
                      >
                        Guardar Cambios
                      </Button>
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
                  Sube un Excel y pulsa "Generar preview".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
