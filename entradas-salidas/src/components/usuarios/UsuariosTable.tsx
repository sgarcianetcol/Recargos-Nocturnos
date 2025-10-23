"use client";
import * as React from "react";
import { Edit, Trash2 } from "lucide-react";
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


  React.useEffect(() => {
    EmpleadoService.listar().then(setEmpleados);
  }, []);

  // ✅ Crear empleado con Firebase Auth + Firestore
  const guardar = async () => {
    if (!nuevo.nombre || !nuevo.correo) {
      alert("Por favor completa todos los campos, incluida la contraseña.");
      return;
    } if (typeof nuevo.salarioBaseMensual !== "number" || nuevo.salarioBaseMensual <= 0) {
      alert("Ingresa un salario base mensual válido.");
      return;
    }

    try {
      const auth = getAuth();

      await EmpleadoService.crear({
        nombre: nuevo.nombre!,
        correo: nuevo.correo!,
        documento: nuevo.documento || "",
        rol: nuevo.rol || "empleado",
        empresa: nuevo.empresa || "NETCOL",
        activo: true,
        salarioBaseMensual: Number(nuevo.salarioBaseMensual),
      });

      alert("Empleado creado correctamente ✅");

      setOpen(false);
      setNuevo({ rol: "empleado", empresa: "NETCOL" });
      setEmpleados(await EmpleadoService.listar());
    } catch (error: any) {
      alert("Error al crear empleado: " + error.message);
    }
  };

  const guardarEdicion = async () => {
    if (!editando) return;
    await EmpleadoService.actualizar(editando.id!, editando);
    setOpenEdit(false);
    const updated = await EmpleadoService.listar();
    setEmpleados(updated);
  };


  const eliminar = async (id: string) => {
    if (confirm("¿Eliminar este empleado?")) {
      await EmpleadoService.eliminar(id);
      setEmpleados(await EmpleadoService.listar());
    }
  };

  const filtrados = empleados.filter((e) => {
    const coincideNombre = e.nombre?.toLowerCase().includes(search.toLowerCase());
    const coincideRol = filtroRol === "todos" || e.rol === filtroRol;
    const coincideEmpresa = filtroEmpresa === "todas" || e.empresa === filtroEmpresa;
    return coincideNombre && coincideRol && coincideEmpresa;
  });


  return (
    <div className="p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Empleados</h2>
        <Button onClick={() => setOpen(true)}>+ Nuevo</Button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Input
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v)}>
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

        <Select value={filtroEmpresa} onValueChange={(v) => setFiltroEmpresa(v)}>
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
              <TableCell className="space-x-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    onClick={() => {
                      setEditando(e);
                      setOpenEdit(true);
                    }}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => eliminar(e.id!)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 🟢 Crear nuevo empleado */}
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
              onChange={(e) =>
                setNuevo({ ...nuevo, documento: e.target.value })
              }
            />
            <Input
              type="number"
              inputMode="numeric"
              placeholder="Salario"
              value={nuevo.salarioBaseMensual ?? ""}               // 👈 controla con 'nuevo'
              onChange={(e) =>
                setNuevo({
                  ...nuevo,
                  salarioBaseMensual:
                    e.target.value === "" ? undefined : Number(e.target.value),  // 👈 evita Number("")
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
                <SelectItem value="lider">Líder</SelectItem>
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

      {/* Editar empleado */}
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
                value={nuevo.salarioBaseMensual ?? ""}               // 👈 controla con 'nuevo'
                onChange={(e) =>
                  setNuevo({
                    ...nuevo,
                    salarioBaseMensual:
                      e.target.value === "" ? undefined : Number(e.target.value),  // 👈 evita Number("")
                  })
                }
              />
              {editando && (
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="Salario"
                  value={editando.salarioBaseMensual ?? ""}          // 👈 controla con 'editando'
                  onChange={(e) =>
                    setEditando({
                      ...editando, salarioBaseMensual:
                        e.target.value === "" ? 0 : Number(e.target.value), // 👈 evita Number("")
                    })
                  }
                />
              )}
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
                  <SelectItem value="lider">Líder</SelectItem>
                  <SelectItem value="empleado">Empleado</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={editando.empresa}
                onValueChange={(v) =>
                  setEditando({ ...editando, empresa: v as Empleado["empresa"] })
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
    </div>
  );
}
