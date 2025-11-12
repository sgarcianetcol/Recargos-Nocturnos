"use client";
import React from "react";
import * as XLSX from "xlsx";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EmpleadoService } from "@/services/usuariosService";
import type { Empleado } from "@/models/usuarios.model";
import { MallaService } from "@/services/malla.service";

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

type PreviewCell = { day: number; turno: string | null };
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

  // ✅ 1. Estado para las filas del preview
  const [previewRows, setPreviewRows] = React.useState<PreviewRow[]>([]);

  // --- EFECTO: CARGAR WORKBOOK DE LOCAL STORAGE ---
  React.useEffect(() => {
    // Solo se ejecuta en el cliente
    if (typeof window === "undefined") return;

    const savedBase64 = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedBase64) {
      try {
        console.log("[STORAGE] Cargando workbook desde localStorage...");
        const wb = base64ToWorkbook(savedBase64);
        setWorkbook(wb);
        // Generar preview para el mes 0 (Enero) con el workbook cargado
        setTimeout(() => buildPreviewForMonth(0, wb, true), 100);
      } catch (e) {
        console.error("[STORAGE] Error cargando workbook:", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY); // Limpiar data corrupta
      }
    }
  }, []); // Se ejecuta solo al montar el componente

  // Cargar usuarios (map por documento)
  React.useEffect(() => {
    // ... (Tu código actual de carga de usuarios)
    (async () => {
      const list = await EmpleadoService.listar({ limite: undefined });
      const map: Record<string, Empleado> = {};
      for (const u of list) {
        const k = String(u.documento ?? "")
          .replace(/\s+/g, "")
          .toLowerCase();
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

    // ✅ Guardar en localStorage
    try {
      const base64 = workbookToBase64(wb);
      localStorage.setItem(LOCAL_STORAGE_KEY, base64);
      console.log("[STORAGE] Workbook guardado en localStorage.");
    } catch (e) {
      console.error("[STORAGE] No se pudo guardar en localStorage:", e);
      alert(
        "Advertencia: El archivo es muy grande y no se pudo guardar en el navegador. Recarga la página y el archivo desaparecerá."
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
                c.day === day ? { ...c, turno: value || null } : c
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
      alert("Primero sube el Excel.");
      return [];
    }

    // ... (Resto de tu lógica buildPreviewForMonth sin cambios)
    console.log("[PREVIEW] === INICIANDO PREVIEW ===");

    const sheetNames = wb.SheetNames.map((s) => s.trim());

    // --- FORZAMOS HOJA DE EMPLEADOS FIJA ---
    const empleadosSheet = wb.Sheets["Nombres de los empleados"];
    if (!empleadosSheet) {
      alert("No se encontró la hoja 'Nombres de los empleados'");
      return [];
    }

    // --- LECTURA FIJA DESDE B4 / C4 SEGÚN CANTIDAD INGRESADA ---
    const numEmpleados = Number(countNumber) || 0;
    if (!numEmpleados || numEmpleados < 1) {
      alert("Ingresa una cantidad válida de empleados");
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
      alert(`Usurarios Guardados`);
      return [];
    }
    const monthSheet = wb.Sheets[sheetName];
    if (!monthSheet) {
      alert(`Hoja ${sheetName} no encontrada`);
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

        cells.push({ day: d, turno });
      }

      // map documento -> uid
      const docNorm = String(e.documento ?? "")
        .replace(/\s+/g, "")
        .toLowerCase();
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
    const key = String(documento ?? "")
      .replace(/\s+/g, "")
      .toLowerCase();
    const found = empleadosMap[key];
    if (!found) {
      alert("Documento no encontrado en usuarios");
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

  // Guardar UN mes (usa MallaService)
  const saveMonth = async (monthIndex: number) => {
    if (!previewRows.length) {
      alert("No hay preview para guardar.");
      return;
    }

    setProcessing(true);
    try {
      console.log("🟡 Guardando mes:", monthIndex + 1);

      const totalOps = await MallaService.saveMonth({
        previewRows,
        year,
        monthIndex,
      });

      console.log(
        `✅ Guardado del mes ${
          monthIndex + 1
        } completado (${totalOps} escrituras).`
      );
      alert(`Mes ${monthIndex + 1} guardado correctamente.`);
    } catch (err: any) {
      console.error("❌ Error guardando mes:", err);
      alert("Error guardando mes: " + (err?.message ?? String(err)));
    } finally {
      setProcessing(false);
    }
  };
  // Guardar TODOS los meses (usa MallaService)
  const saveAllMonths = async () => {
    if (!workbook) {
      alert("Primero selecciona un archivo Excel.");
      return;
    }

    setProcessing(true);
    try {
      console.log("🟡 Guardando TODOS los meses...");

      const months = workbook.SheetNames;

      let totalOps = 0;

      for (let i = 0; i < months.length; i++) {
        // Build preview for each month
        // Nota: se llama con el índice 'i' y el workbook del estado
        const previewRows = await buildPreviewForMonth(i);
        if (!previewRows || previewRows.length === 0) {
          console.warn(`⚠️ Mes ${i + 1}: no hay datos para guardar.`);
          continue;
        }

        const ops = await MallaService.saveMonth({
          previewRows,
          year,
          monthIndex: i,
        });

        totalOps += ops;
        console.log(`✅ Mes ${i + 1} guardado (${ops} escrituras).`);
      }

      alert(`✅ Proceso completado. Total escrituras: ${totalOps}`);
      console.log(`🏁 Guardado global finalizado con ${totalOps} operaciones.`);
    } catch (err: any) {
      console.error("❌ Error guardando todos los meses:", err);
      alert(
        "Error guardando todos los meses: " + (err?.message ?? String(err))
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

      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2">
          <Input type="file" accept=".xlsx,.xls" onChange={onFile} />
          {workbook && (
            <span className="text-xs text-green-600">✅ Excel cargado</span>
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
        </div>
      </div>

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
                    <Button
                      size="sm"
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
