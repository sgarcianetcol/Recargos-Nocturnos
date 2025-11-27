"use client";
import * as React from "react";
import * as XLSX from "xlsx";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  crearEmpleadoConAcceso,
  EmpleadoService,
} from "@/services/usuariosService";

import { Edit, Trash2, FileSpreadsheet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empleado } from "@/models/usuarios.model";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CheckCircle2Icon, AlertCircleIcon, InfoIcon } from "lucide-react";

import { getAuth, fetchSignInMethodsForEmail } from "firebase/auth";

export default function UsuariosTable() {
  const normalizeRol = (rol: string): Empleado["rol"] => {
    const lower = rol.toLowerCase().trim();
    if (lower === "admin") return "admin";
    return "empleado";
  };

  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [open, setOpen] = React.useState(false);
  const [openEdit, setOpenEdit] = React.useState(false);
  const [nuevo, setNuevo] = React.useState<
    Partial<Empleado & { salarioBaseMensual: number | undefined }>
  >({
    rol: "empleado",
    empresa: "NETCOL",
    salarioBaseMensual: undefined,
  });
  const [editando, setEditando] = React.useState<Empleado | null>(null);
  const [search, setSearch] = React.useState("");
  const [filtroRol, setFiltroRol] = React.useState<string>("todos");
  const [filtroEmpresa, setFiltroEmpresa] = React.useState<string>("todas");

  // AlertDialog de estado
  const [empleadoAEliminar, setEmpleadoAEliminar] =
    React.useState<Empleado | null>(null);
  const [alertDialogData, setAlertDialogData] = React.useState<{
    tipo: "success" | "warning" | "info";
    titulo: string;
    descripcion: React.ReactNode;
  } | null>(null);

  // Import states
  const [importando, setImportando] = React.useState(false);
  const [importResult, setImportResult] = React.useState<{
    creados: number;
    duplicados: string[];
    errores: Array<{ row: number; email?: string; reason: string }>;
  } | null>(null);
  const [exportData, setExportData] = React.useState<any[]>([]);

  // Cargar empleados al iniciar
  React.useEffect(() => {
    EmpleadoService.listar().then(setEmpleados);
  }, []);

  // Crear empleado
  const guardar = async () => {
    if (!nuevo.nombre || !nuevo.correo) {
      setAlertDialogData({
        tipo: "warning",
        titulo: "Campos incompletos",
        descripcion: "Por favor completa todos los campos obligatorios.",
      });
      return;
    }

    const salario = nuevo.salarioBaseMensual;
    if (!salario || salario <= 0) {
      setAlertDialogData({
        tipo: "warning",
        titulo: "Salario inválido",
        descripcion: "Ingresa un salario base mensual válido.",
      });
      return;
    }

    try {
      // 🔍 Verificar duplicado por documento (cédula)
      if (nuevo.documento) {
        const empleadosRef = collection(db, "usuarios");
        const q = query(
          empleadosRef,
          where("documento", "==", nuevo.documento)
        );
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          setAlertDialogData({
            tipo: "warning",
            titulo: "Documento duplicado",
            descripcion: `Ya existe un empleado registrado con la cédula ${nuevo.documento}.`,
          });
          return; // Detiene el guardado
        }
      }

      // ✅ Si pasa la validación, crear empleado
      const uid = await crearEmpleadoConAcceso({
        nombre: nuevo.nombre!,
        correo: nuevo.correo!,
        documento: nuevo.documento || "",
        rol: nuevo.rol || "empleado",
        empresa: nuevo.empresa || "NETCOL",
        activo: true,
        salarioBaseMensual: Number(nuevo.salarioBaseMensual),
      });

      setAlertDialogData({
        tipo: "success",
        titulo: "Empleado creado ✅",
        descripcion: `Se creó el usuario y se envió un correo a ${nuevo.correo} para que defina su contraseña.`,
      });

      setOpen(false);
      setNuevo({ rol: "empleado", empresa: "NETCOL" });
      setEmpleados(await EmpleadoService.listar());
    } catch (error: any) {
      console.error(error);

      let titulo = "Error al crear empleado";
      let descripcion =
        error.message ||
        "Ocurrió un error desconocido al intentar crear el empleado.";

      // ⚠️ Detectar si el correo ya existe en Firebase
      if (error.code === "auth/email-already-in-use") {
        titulo = "Correo ya registrado";
        descripcion = `El correo ${nuevo.correo} ya está en uso. 
    Usa un correo diferente o revisa si este empleado ya fue creado.`;
      }

      setAlertDialogData({
        tipo: "warning",
        titulo,
        descripcion,
      });
    }
  };

  // Guardar edición
  const guardarEdicion = async () => {
    if (!editando) return;
    await EmpleadoService.actualizar(editando.id!, editando);
    setOpenEdit(false);
    const updated = await EmpleadoService.listar();
    setEmpleados(updated);
    setAlertDialogData({
      tipo: "success",
      titulo: "Empleado actualizado ✅",
      descripcion: `Los cambios del empleado ${editando.nombre} se han guardado correctamente.`,
    });
  };

  // Confirmar eliminación
  const confirmarEliminar = async () => {
    if (!empleadoAEliminar) return;
    await EmpleadoService.eliminar(empleadoAEliminar.id!);
    setEmpleados(await EmpleadoService.listar());
    setAlertDialogData({
      tipo: "success",
      titulo: "Empleado eliminado ✅",
      descripcion: `El empleado ${empleadoAEliminar.nombre} ha sido eliminado correctamente.`,
    });
    setEmpleadoAEliminar(null);
  };

  // Helper: limpiar y convertir salario
  const parseSalario = (raw: any): number => {
    if (raw === null || raw === undefined) return NaN;
    const cleaned = String(raw).replace(/[^0-9.-]+/g, "");
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : NaN;
  };

  // Descargar CSV de errores
  const downloadErrorsCsv = (
    errors: Array<{ row: number; email?: string; reason: string }>,
    duplicados: string[]
  ) => {
    const rows: string[] = [];
    rows.push(`tipo,detalle`);
    // duplicados
    duplicados.forEach((email) => rows.push(`duplicado,${email}`));
    // errores
    errors.forEach((e) =>
      rows.push(`error,Fila ${e.row} | ${e.email ?? "—"} | ${e.reason}`)
    );
    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "errores_importacion.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Importar Excel (implementación completa)
  // Importar Excel (implementación completa con validación de duplicados)
  const handleImportExcel = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setImportando(true);
    setImportResult(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        defval: "",
      });

      if (rawData.length === 0) {
        setAlertDialogData({
          tipo: "warning",
          titulo: "Importación fallida",
          descripcion: "El archivo está vacío.",
        });
        setImportando(false);
        return;
      }

      // Validar encabezados exactos
      const expectedCols = [
        "Nombre",
        "Correo",
        "Documento",
        "Rol",
        "Empresa",
        "Activo",
        "SalarioBaseMensual",
      ];
      const firstKeys = Object.keys(rawData[0]).map((k) => k.trim());
      const missing = expectedCols.filter((col) => !firstKeys.includes(col));
      if (missing.length > 0) {
        setAlertDialogData({
          tipo: "warning",
          titulo: "Columnas faltantes",
          descripcion: `Faltan columnas obligatorias: ${missing.join(", ")}`,
        });
        setImportando(false);
        return;
      }

      const auth = getAuth();
      const VALID_ROLES = ["admin", "empleado"];

      const result = {
        creados: 0,
        duplicados: [] as string[],
        errores: [] as { row: number; email?: string; reason: string }[],
      };

      // Procesar fila por fila (secuencial)
      for (let i = 0; i < rawData.length; i++) {
        const rowNumber = i + 2; // fila en Excel (encabezado fila 1)
        const row = rawData[i];

        // Lectura y normalización
        const nombre = String(row["Nombre"] ?? "").trim();
        const correoRaw = String(row["Correo"] ?? "").trim();
        const correo = correoRaw.toLowerCase();
        const documento = String(row["Documento"] ?? "").trim();
        const rolRaw = String(row["Rol"] ?? "").trim();
        const empresa = String(row["Empresa"] ?? "").trim() || "NETCOL";
        const activoRaw = String(row["Activo"] ?? "").trim();
        const salarioRaw = row["SalarioBaseMensual"];

        // Validaciones básicas
        if (!nombre || !correo || !documento) {
          result.errores.push({
            row: rowNumber,
            email: correo || undefined,
            reason: "Campos obligatorios faltantes (Nombre/Correo/Documento)",
          });
          continue;
        }

        // Validar rol
        const rolNormalized = rolRaw
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!VALID_ROLES.includes(rolNormalized)) {
          result.errores.push({
            row: rowNumber,
            email: correo,
            reason: `Rol inválido: "${rolRaw}"`,
          });
          continue;
        }

        // Mapear a tipo exacto esperado
        let rolVal: Empleado["rol"] = "empleado";
        if (rolNormalized === "admin") rolVal = "admin";

        // Salario
        const salario = parseSalario(salarioRaw);
        if (!Number.isFinite(salario) || salario <= 0) {
          result.errores.push({
            row: rowNumber,
            email: correo,
            reason: "Salario inválido (debe ser número mayor a 0)",
          });
          continue;
        }

        // Activo: por defecto true si no viene
        const activo =
          activoRaw === ""
            ? true
            : ["sí", "si", "true", "1", "yes"].includes(
                activoRaw.toLowerCase()
              );

        // 🚫 Verificar duplicado por correo en Firebase Auth
        try {
          const methods = await fetchSignInMethodsForEmail(auth, correo);
          if (Array.isArray(methods) && methods.length > 0) {
            result.duplicados.push(`${correo} (ya existe en Auth)`);
            continue;
          }
        } catch (err: any) {
          result.errores.push({
            row: rowNumber,
            email: correo,
            reason: `Error verificando existencia del correo: ${
              err?.message ?? String(err)
            }`,
          });
          continue;
        }

        // 🚫 Verificar duplicado por correo o documento en Firestore
        try {
          const empleadosRef = collection(db, "usuarios");

          const [correoSnap, documentoSnap] = await Promise.all([
            getDocs(query(empleadosRef, where("correo", "==", correo))),
            getDocs(query(empleadosRef, where("documento", "==", documento))),
          ]);

          if (!correoSnap.empty || !documentoSnap.empty) {
            result.duplicados.push(
              `${correo} / ${documento} (ya existe en Firestore)`
            );
            continue;
          }
        } catch (err: any) {
          result.errores.push({
            row: rowNumber,
            email: correo,
            reason: `Error verificando duplicados en Firestore: ${
              err?.message ?? String(err)
            }`,
          });
          continue;
        }

        // ✅ Crear usuario (Auth + Firestore)
        try {
          await crearEmpleadoConAcceso({
            nombre,
            correo,
            documento,
            rol: rolVal,
            empresa: empresa as Empleado["empresa"],
            activo,
            salarioBaseMensual: salario,
          });
          result.creados += 1;
        } catch (err: any) {
          result.errores.push({
            row: rowNumber,
            email: correo,
            reason: `Error creando usuario: ${err?.message ?? String(err)}`,
          });
          continue;
        }
      } // end for

      setImportResult(result);

      const descripcion = (
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <p>
            ✅ <strong>Empleados creados correctamente:</strong>{" "}
            <span className="text-green-600 font-semibold">
              {result.creados}
            </span>
          </p>

          {result.duplicados.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-2">
              <p className="font-medium text-yellow-800">
                ⚠️ Empleados omitidos por duplicado ({result.duplicados.length})
              </p>
              <ul className="list-disc ml-5 mt-1">
                {result.duplicados.slice(0, 5).map((dup, idx) => (
                  <li key={idx} className="break-all">
                    {dup}
                  </li>
                ))}
                {result.duplicados.length > 5 && (
                  <li className="italic text-gray-500">
                    ...y {result.duplicados.length - 5} más
                  </li>
                )}
              </ul>
              <p className="text-xs text-yellow-700 mt-1">
                (Verifica si la cédula o correo ya existen en el sistema)
              </p>
            </div>
          )}

          {result.errores.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-2">
              <p className="font-medium text-red-800">
                ❌ Errores encontrados ({result.errores.length})
              </p>
              <ul className="list-disc ml-5 mt-1">
                {result.errores.slice(0, 6).map((e, idx) => (
                  <li key={idx}>
                    <strong>Fila {e.row}</strong> —{" "}
                    <span className="text-gray-700">
                      {e.email ?? "Sin correo"}
                    </span>{" "}
                    — <span className="italic text-red-700">{e.reason}</span>
                  </li>
                ))}
                {result.errores.length > 6 && (
                  <li className="italic text-gray-500">
                    ...más errores (descarga el CSV para verlos todos)
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="mt-2 border-t pt-2 text-xs text-gray-500">
            <p>
              📄 Puedes descargar el reporte completo en formato CSV para
              revisar los detalles de cada registro procesado.
            </p>
          </div>
        </div>
      );
      // ✅ Generar archivo Excel con resultados del proceso
      const resumenData = result.errores.map((e) => ({
        Tipo: "❌ Error",
        Fila: e.row,
        Correo: e.email ?? "Sin correo",
        Motivo: e.reason,
      }));

      const duplicadosData = result.duplicados.map((dup) => ({
        Tipo: "⚠️ Duplicado",
        Correo_o_Cédula: dup,
      }));

      const creadosData = [
        { Tipo: "✅ Empleados creados correctamente", Total: result.creados },
      ];
      // 🔔 Mostrar alerta siempre después de la importación
      setAlertDialogData({
        tipo: "info",
        titulo: "Resultado de la importación",
        descripcion, // <-- Aquí usamos el bloque visual que hiciste arriba
      });

      // Combinar todos los datos en una sola hoja
      const exportData = [...creadosData, ...duplicadosData, ...resumenData];
      setExportData(exportData);

      // Refrescar lista de empleados
      setEmpleados(await EmpleadoService.listar());
    } catch (err) {
      console.error("Error importando archivo:", err);
      setAlertDialogData({
        tipo: "warning",
        titulo: "Error importando",
        descripcion:
          (err as Error).message ||
          "Ocurrió un error desconocido durante la importación.",
      });
    } finally {
      // Limpieza de memoria y estados
      setImportando(false);
      setEmpleados((prev) => [...prev]); // Forzar actualización sin duplicar
      setTimeout(() => {
        setAlertDialogData(null); // limpia alerta antigua
      }, 8000);
    }
  };

  // Exportar Excel (mantengo tu función original)
  const handleExportExcel = () => {
    const data = empleados.map((e) => ({
      Nombre: e.nombre,
      Correo: e.correo,
      Documento: e.documento,
      Rol: e.rol,
      Empresa: e.empresa,
      Activo: e.activo ? "Sí" : "No",
      SalarioBaseMensual: e.salarioBaseMensual,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Empleados");
    XLSX.writeFile(workbook, "Empleados.xlsx");
  };

  // Descargar resultado de importación
  const handleDownloadImportResult = () => {
    if (exportData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen Importación");
    XLSX.writeFile(wb, "resultado_importacion.xlsx");
  };

  // Filtrado
  const filtrados = empleados.filter((e) => {
    const coincideNombre = e.nombre
      ?.toLowerCase()
      .includes(search.toLowerCase());
    const coincideRol = filtroRol === "todos" || e.rol === filtroRol;
    const coincideEmpresa =
      filtroEmpresa === "todas" || e.empresa === filtroEmpresa;
    return coincideNombre && coincideRol && coincideEmpresa;
  });

  return (
    <div className="p-4 space-y-4">
      {/* Encabezado */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Empleados</h2>
        <div className="flex gap-2">
          <Button onClick={() => setOpen(true)}>+ Nuevo</Button>
          <label htmlFor="excel-upload">
            <input
              id="excel-upload"
              type="file"
              accept=".xlsx, .xls"
              className="hidden"
              onChange={handleImportExcel}
            />
            <Button asChild>
              <span className="flex items-center gap-1">
                <FileSpreadsheet className="w-4 h-4" /> Importar
              </span>
            </Button>
          </label>
          <Button onClick={handleExportExcel}>
            <Download className="w-4 h-4 mr-1" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={filtroRol} onValueChange={setFiltroRol}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="empleado">Empleado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las empresas</SelectItem>
            <SelectItem value="NETCOL">NETCOL</SelectItem>
            <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
            <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nombre</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Empresa</TableHead>
            <TableHead>Activo</TableHead>
            <TableHead>Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtrados.map((e) => (
            <TableRow key={e.id}>
              <TableCell>{e.nombre}</TableCell>
              <TableCell>{e.correo}</TableCell>
              <TableCell>{e.rol}</TableCell>
              <TableCell>{e.empresa}</TableCell>
              <TableCell>{e.activo ? "Sí" : "No"}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    onClick={() => {
                      setEditando(e);
                      setOpenEdit(true);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => setEmpleadoAEliminar(e)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Modal Nuevo */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Empleado</DialogTitle>
            <DialogDescription>
              Completa la información del nuevo empleado y guarda los cambios.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Input
              placeholder="Nombre"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
            <Input
              placeholder="Correo"
              type="email"
              value={nuevo.correo}
              onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
            />
            <Input
              placeholder="Documento"
              value={nuevo.documento}
              onChange={(e) =>
                setNuevo({ ...nuevo, documento: e.target.value })
              }
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Salario"
              value={nuevo.salarioBaseMensual ?? ""}
              onChange={(e) =>
                setNuevo({
                  ...nuevo,
                  salarioBaseMensual:
                    e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
            <Select
              value={nuevo.rol}
              onValueChange={(v) =>
                setNuevo({ ...nuevo, rol: v as Empleado["rol"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="empleado">Empleado</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={nuevo.empresa}
              onValueChange={(v) =>
                setNuevo({ ...nuevo, empresa: v as Empleado["empresa"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NETCOL">NETCOL</SelectItem>
                <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
                <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={guardar}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empleado</DialogTitle>
          </DialogHeader>
          {editando && (
            <div className="space-y-3 py-3">
              <Input
                placeholder="Nombre"
                value={editando.nombre}
                onChange={(e) =>
                  setEditando({ ...editando, nombre: e.target.value })
                }
              />
              <Input
                placeholder="Correo"
                value={editando.correo}
                onChange={(e) =>
                  setEditando({ ...editando, correo: e.target.value })
                }
              />
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Salario"
                value={editando.salarioBaseMensual ?? ""}
                onChange={(e) =>
                  setEditando({
                    ...editando,
                    salarioBaseMensual:
                      e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
              <Select
                value={editando.rol}
                onValueChange={(v) =>
                  setEditando({ ...editando, rol: v as Empleado["rol"] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="empleado">Empleado</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={editando.empresa}
                onValueChange={(v) =>
                  setEditando({
                    ...editando,
                    empresa: v as Empleado["empresa"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NETCOL">NETCOL</SelectItem>
                  <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
                  <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button onClick={guardarEdicion}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para eliminar */}
      <AlertDialog
        open={!!empleadoAEliminar}
        onOpenChange={() => setEmpleadoAEliminar(null)}
      >
        <AlertDialogTitle asChild>
          <span className="hidden" />
        </AlertDialogTitle>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {empleadoAEliminar
                ? `Eliminar a ${empleadoAEliminar.nombre}?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEmpleadoAEliminar(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog para notificaciones */}
      {alertDialogData && (
        <AlertDialog open={true} onOpenChange={() => setAlertDialogData(null)}>
          <AlertDialogTitle asChild>
            <span className="hidden" />
          </AlertDialogTitle>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {alertDialogData.tipo === "success" ? (
                  <CheckCircle2Icon className="w-5 h-5 text-green-500" />
                ) : alertDialogData.tipo === "info" ? (
                  <InfoIcon className="w-5 h-5 text-blue-500" />
                ) : (
                  <AlertCircleIcon className="w-5 h-5 text-yellow-500" />
                )}
                {alertDialogData.titulo}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-muted-foreground text-sm">
                  {alertDialogData?.descripcion}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {exportData.length > 0 && (
                <Button onClick={handleDownloadImportResult} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Resultado
                </Button>
              )}
              <AlertDialogAction onClick={() => setAlertDialogData(null)}>
                Cerrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
