"use client";
import * as React from "react";
import * as XLSX from "xlsx";
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
import { EmpleadoService } from "@/services/usuariosService";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { getAuth } from "firebase/auth";
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
import { CheckCircle2Icon, AlertCircleIcon } from "lucide-react";

export default function UsuariosTable() {
  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [open, setOpen] = React.useState(false);
  const [openEdit, setOpenEdit] = React.useState(false);
  const [nuevo, setNuevo] = React.useState<Partial<Empleado>>({
    rol: "empleado",
    empresa: "NETCOL",
  });
  const [editando, setEditando] = React.useState<Empleado | null>(null);
  const [search, setSearch] = React.useState("");
  const [filtroRol, setFiltroRol] = React.useState<string>("todos");
  const [filtroEmpresa, setFiltroEmpresa] = React.useState<string>("todas");

  // AlertDialog de estado
  const [empleadoAEliminar, setEmpleadoAEliminar] = React.useState<Empleado | null>(null);
  const [alertDialogData, setAlertDialogData] = React.useState<{
    tipo: "success" | "warning";
    titulo: string;
    descripcion: React.ReactNode;
  } | null>(null);

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
    if (
      typeof nuevo.salarioBaseMensual !== "number" ||
      nuevo.salarioBaseMensual <= 0
    ) {
      setAlertDialogData({
        tipo: "warning",
        titulo: "Salario inválido",
        descripcion: "Ingresa un salario base mensual válido.",
      });
      return;
    }

    try {
      await EmpleadoService.crear({
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
        descripcion: `El empleado ${nuevo.nombre} ha sido creado correctamente.`,
      });

      setOpen(false);
      setNuevo({ rol: "empleado", empresa: "NETCOL" });
      setEmpleados(await EmpleadoService.listar());
    } catch (error: any) {
      setAlertDialogData({
        tipo: "warning",
        titulo: "Error al crear empleado",
        descripcion: error.message || "Ocurrió un error desconocido.",
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

  // Importar Excel
  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      let importados = 0;
      let duplicados: string[] = [];

      const usuariosExistentes = await EmpleadoService.listar();
      const correosExistentes = usuariosExistentes.map((u: any) => u.correo?.toLowerCase());

      for (const item of jsonData as any[]) {
        try {
          if (!item.Nombre || !item.Correo) continue;
          const correo = item.Correo.toLowerCase();
          if (correosExistentes.includes(correo)) {
            duplicados.push(correo);
            continue;
          }
          await EmpleadoService.crear({
            nombre: item.Nombre,
            correo: item.Correo,
            documento: item.Documento || "",
            rol: item.Rol || "empleado",
            empresa: item.Empresa || "NETCOL",
            activo: true,
            salarioBaseMensual: Number(item.SalarioBaseMensual || 0),
          });
          importados++;
          correosExistentes.push(correo);
        } catch (err) {
          console.error("Error importando empleado:", err);
        }
      }

      // AlertDialog con iconos y resumen
      const descripcion = (
        <div className="flex flex-col gap-1">
          <p>Empleados agregados: {importados}</p>
          {duplicados.length > 0 && (
            <p>
              ⚠️ Duplicados ({duplicados.length}):<br />
              {duplicados.join(", ")}
            </p>
          )}
        </div>
      );

      setAlertDialogData({
        tipo: duplicados.length > 0 ? "warning" : "success",
        titulo: "Importación completada",
        descripcion,
      });

      setEmpleados(await EmpleadoService.listar());
    };
    reader.readAsArrayBuffer(file);
  };

  // Exportar Excel
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

  // Filtrado
  const filtrados = empleados.filter((e) => {
    const coincideNombre = e.nombre?.toLowerCase().includes(search.toLowerCase());
    const coincideRol = filtroRol === "todos" || e.rol === filtroRol;
    const coincideEmpresa = filtroEmpresa === "todas" || e.empresa === filtroEmpresa;
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
            <SelectItem value="lider">Líder</SelectItem>
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
              onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })}
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
              onValueChange={(v) => setNuevo({ ...nuevo, rol: v as Empleado["rol"] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="lider">Líder</SelectItem>
                <SelectItem value="empleado">Empleado</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={nuevo.empresa}
              onValueChange={(v) => setNuevo({ ...nuevo, empresa: v as Empleado["empresa"] })}
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
                onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
              />
              <Input
                placeholder="Correo"
                value={editando.correo}
                onChange={(e) => setEditando({ ...editando, correo: e.target.value })}
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
                onValueChange={(v) => setEditando({ ...editando, rol: v as Empleado["rol"] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rol" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="lider">Líder</SelectItem>
                  <SelectItem value="empleado">Empleado</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={editando.empresa}
                onValueChange={(v) => setEditando({ ...editando, empresa: v as Empleado["empresa"] })}
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
      <AlertDialog open={!!empleadoAEliminar} onOpenChange={() => setEmpleadoAEliminar(null)}>
        <AlertDialogTrigger asChild>
          <span className="hidden" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {empleadoAEliminar ? `Eliminar a ${empleadoAEliminar.nombre}?` : ""}
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
          <AlertDialogTrigger asChild>
            <span className="hidden" />
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {alertDialogData.tipo === "success" ? (
                  <CheckCircle2Icon className="w-5 h-5 text-green-500" />
                ) : (
                  <AlertCircleIcon className="w-5 h-5 text-yellow-500" />
                )}
                {alertDialogData.titulo}
              </AlertDialogTitle>
              <AlertDialogDescription>{alertDialogData.descripcion}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setAlertDialogData(null)}>Cerrar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
