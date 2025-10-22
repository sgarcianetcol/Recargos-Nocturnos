"use client";
import * as React from "react";
import { Edit, Trash2, KeyRound, Plus } from "lucide-react";
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
import { getAuth, createUserWithEmailAndPassword, updatePassword } from "firebase/auth";

export default function UsuariosTable() {
  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [open, setOpen] = React.useState(false);
  const [openEdit, setOpenEdit] = React.useState(false);
  const [openPass, setOpenPass] = React.useState(false);
  const [nuevo, setNuevo] = React.useState<Partial<Empleado>>({
    rol: "empleado",
    empresa: "NETCOL",
  });
  const [editando, setEditando] = React.useState<Empleado | null>(null);
  const [search, setSearch] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [filtroRol, setFiltroRol] = React.useState<string>("todos");
  const [filtroEmpresa, setFiltroEmpresa] = React.useState<string>("todas");


  React.useEffect(() => {
    EmpleadoService.listar().then(setEmpleados);
  }, []);

  // ✅ Crear empleado con Firebase Auth + Firestore
  const guardar = async () => {
    if (!nuevo.nombre || !nuevo.correo || !nuevo.password) {
      alert("Por favor completa todos los campos, incluida la contraseña.");
      return;
    }

    try {
      const auth = getAuth();

      // 1️⃣ Crear usuario en Firebase Authentication
      const cred = await createUserWithEmailAndPassword(
        auth,
        nuevo.correo!,
        nuevo.password!
      );

      // 2️⃣ Guardar datos adicionales en Firestore
      await EmpleadoService.crear({
        nombre: nuevo.nombre!,
        correo: nuevo.correo!,
        documento: nuevo.documento || "",
        rol: nuevo.rol || "empleado",
        empresa: nuevo.empresa || "NETCOL",
        activo: true,
        uid: cred.user.uid, 
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

  // ✅ Cambiar contraseña (Auth + Firestore)
  const cambiarContrasena = async () => {
    if (!editando || !newPassword) return alert("Escribe la nueva contraseña");

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (user) {
        await updatePassword(user, newPassword);
      }

      await EmpleadoService.actualizar(editando.id!, { password: newPassword });
      setOpenPass(false);
      setNewPassword("");
      alert("Contraseña actualizada correctamente ✅");
    } catch (error: any) {
      alert("Error al cambiar contraseña: " + error.message);
    }
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
    onClick={() => {
      setEditando(e);
      setOpenPass(true);
    }}>
    <KeyRound className="w-4 h-4" />
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
              value={nuevo.nombre || ""}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
            <Input
              placeholder="Correo"
              type="email"
              value={nuevo.correo || ""}
              onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })}
            />
            <Input
              placeholder="Contraseña"
              type="password"
              value={nuevo.password || ""}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
            />
            <Input
              placeholder="Documento"
              value={nuevo.documento || ""}
              onChange={(e) =>
                setNuevo({ ...nuevo, documento: e.target.value })
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
                value={editando.nombre || ""}
                onChange={(e) =>
                  setEditando({ ...editando, nombre: e.target.value })
                }
              />
              <Input
                placeholder="Correo"
                value={editando.correo || ""}
                onChange={(e) =>
                  setEditando({ ...editando, correo: e.target.value })
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

      {/* Cambiar contraseña */}
      <Dialog open={openPass} onOpenChange={setOpenPass}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <Input
              type="password"
              placeholder="Nueva contraseña"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={cambiarContrasena}>Actualizar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
