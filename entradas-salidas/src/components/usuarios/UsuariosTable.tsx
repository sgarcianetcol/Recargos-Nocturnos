"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empleado } from "@/models/usuarios.model";
import { EmpleadoService } from "@/services/usuariosService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function UsuariosTable() {
    const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
    const [open, setOpen] = React.useState(false);
    const [nuevo, setNuevo] = React.useState<Partial<Empleado>>({ rol: "empleado", empresa: "NETCOL" });

    React.useEffect(() => {
        EmpleadoService.listar().then(setEmpleados);
    }, []);

    const guardar = async () => {
        if (!nuevo.nombre || !nuevo.correo) return;
        await EmpleadoService.crear({
            ...nuevo,
            nombre: nuevo.nombre!,
            correo: nuevo.correo!,
            rol: nuevo.rol!,
            empresa: nuevo.empresa!,
            activo: true,
            creadoEn: new Date(),
        } as Empleado);
        setOpen(false);
        setNuevo({ rol: "empleado", empresa: "NETCOL" });
        const updated = await EmpleadoService.listar();
        setEmpleados(updated);
    };

    const eliminar = async (id: string) => {
        if (confirm("¿Eliminar este empleado?")) {
            await EmpleadoService.eliminar(id);
            setEmpleados(await EmpleadoService.listar());
        }
    };

    return (
        <div className="p-4 space-y-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Empleados</h2>
                <Button onClick={() => setOpen(true)}>+ Nuevo</Button>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Correo</TableHead>
                        <TableHead>Rol</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead>Activo</TableHead>
                        <TableHead></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {empleados.map((e) => (
                        <TableRow key={e.id}>
                            <TableCell>{e.nombre}</TableCell>
                            <TableCell>{e.correo}</TableCell>
                            <TableCell>{e.rol}</TableCell>
                            <TableCell>{e.empresa}</TableCell>
                            <TableCell>{e.activo ? "si" : "no"}</TableCell>
                            <TableCell>
                                <Button variant="destructive" onClick={() => eliminar(e.id)}>Eliminar</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nuevo Empleado</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-3">
                        <Input placeholder="Nombre" value={nuevo.nombre || ""} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
                        <Input placeholder="Correo" value={nuevo.correo || ""} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} />
                        <Input placeholder="Documento" value={nuevo.documento || ""} onChange={(e) => setNuevo({ ...nuevo, documento: e.target.value })} />
                        <Select
                            value={nuevo.rol}
                            onValueChange={(v) => setNuevo({ ...nuevo, rol: v as Empleado["rol"] })}
                        >
                            <SelectTrigger><SelectValue placeholder="Rol" /></SelectTrigger>
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
                            <SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger>
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
        </div>
    );
}
