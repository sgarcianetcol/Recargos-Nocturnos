// src/components/configuracion/configuracionAdmin.tsx
"use client";

import * as React from "react";
import {
  DEFAULT_NOMINA,
  DEFAULT_RECARGOS,
  DEFAULT_RULES,
} from "@/models/defaults";
import { useEffect, useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Servicios
import {
  getUsuarios,
  toggleRecargos,
  EmpleadoService,
  crearEmpleadoConAcceso,
} from "@/services/usuariosService";
import {
  getFestivosManuales,
  agregarFestivoManual,
  eliminarFestivoManual,
} from "@/services/festivos.service";
import {
  getParametros,
  actualizarParametros,
} from "@/services/parametros.service";
import { MallaService } from "@/services/malla.service";
import {
  eliminarJornada,
  crearJornadaCalculada,
  listarJornadasPorUsuarioRango,
  actualizarJornada,
} from "@/services/jornada.service";
import { ConfigNominaService } from "@/services/config.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { esDominicalOFestivo } from "@/services/festivos.service";
import { JornadaDoc } from "@/models/jornada.model";

// Tipos
import type { Empleado, Rol, Empresas } from "@/models/usuarios.model";
import type { Parametros } from "./ParametrosGlobalesContext";
import { DEFAULT_PARAMETROS } from "@/models/defaults";

/**
 * Panel de configuración completo del administrador
 *
 * Funcionalidades:
 * - CRUD completo de usuarios (crear, editar, eliminar, activar/desactivar)
 * - Gestión de recargos por usuario
 * - Gestión de festivos manuales
 * - Edición de parámetros globales
 */

interface FormularioUsuario {
  nombre: string;
  correo: string;
  rol: Rol;
  empresa: Empresas;
  documento: string;
  area: string;
  salarioBaseMensual: string;
  proyectos: string;
}

const FORM_INICIAL: FormularioUsuario = {
  nombre: "",
  correo: "",
  rol: "empleado",
  empresa: "NETCOL",
  documento: "",
  area: "",
  salarioBaseMensual: "",
  proyectos: "",
};

export default function ConfiguracionAdmin() {
  // Estados de datos
  const [usuarios, setUsuarios] = useState<Empleado[]>([]);
  const [festivos, setFestivos] = useState<string[]>([]);
  const [parametros, setParametros] = useState<Parametros>(DEFAULT_PARAMETROS);

  // Estados de carga
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Estados de UI
  const [modalUsuarioAbierto, setModalUsuarioAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Empleado | null>(null);
  const [formulario, setFormulario] = useState<FormularioUsuario>(FORM_INICIAL);
  const [nuevoFestivo, setNuevoFestivo] = useState("");
  const [mensaje, setMensaje] = useState<{
    tipo: "exito" | "error";
    texto: string;
  } | null>(null);
  const [recargoInput, setRecargoInput] = useState<{ [key: string]: string }>(
    {}
  );

  const mostrarMensaje = useCallback(
    (tipo: "exito" | "error", texto: string) => {
      setMensaje({ tipo, texto });
      setTimeout(() => setMensaje(null), 5000);
    },
    []
  );

  const cargarUsuarios = useCallback(async () => {
    try {
      setCargandoUsuarios(true);
      const u = await getUsuarios();
      setUsuarios(u);
    } catch (err) {
      console.error("Error cargarUsuarios:", err);
      mostrarMensaje("error", "Error al cargar usuarios");
    } finally {
      setCargandoUsuarios(false);
    }
  }, [mostrarMensaje]);

  const cargarFestivos = useCallback(async () => {
    try {
      const f = await getFestivosManuales();
      setFestivos(f || []);
    } catch (err) {
      console.error("Error cargarFestivos:", err);
      mostrarMensaje("error", "Error al cargar festivos");
    }
  }, [mostrarMensaje]);

  const cargarParametros = useCallback(async () => {
    try {
      const p = await getParametros();
      setParametros((prev) => ({
        ...prev,
        ...p,
        nomina: { ...prev.nomina, ...p.nomina },
        recargos: { ...prev.recargos, ...p.recargos },
        rules: { ...prev.rules, ...p.rules },
      }));
    } catch (err) {
      console.error("Error cargarParametros:", err);
      mostrarMensaje("error", "Error al cargar parámetros");
    }
  }, [mostrarMensaje]);

  const cargarTodosDatos = useCallback(async () => {
    await Promise.all([cargarUsuarios(), cargarFestivos(), cargarParametros()]);
  }, []);

  // Cargar datos iniciales
  useEffect(() => {
    cargarTodosDatos();
  }, [cargarTodosDatos]);

  // ============================================================================
  // USUARIOS - CRUD
  // ============================================================================

  const abrirModalNuevoUsuario = () => {
    setUsuarioEditando(null);
    setFormulario(FORM_INICIAL);
    setModalUsuarioAbierto(true);
  };

  const abrirModalEditarUsuario = (usuario: Empleado) => {
    setUsuarioEditando(usuario);
    setFormulario({
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      empresa: usuario.empresa,
      documento: usuario.documento || "",
      area: usuario.area || "",
      salarioBaseMensual: usuario.salarioBaseMensual.toString(),
      proyectos: usuario.proyectos?.join(", ") || "",
    });
    setModalUsuarioAbierto(true);
  };

  const handleGuardarUsuario = async () => {
    try {
      // Validaciones
      if (!formulario.nombre.trim()) {
        mostrarMensaje("error", "El nombre es obligatorio");
        return;
      }
      if (!formulario.correo.trim()) {
        mostrarMensaje("error", "El correo es obligatorio");
        return;
      }
      if (
        !formulario.salarioBaseMensual ||
        Number(formulario.salarioBaseMensual) <= 0
      ) {
        mostrarMensaje("error", "El salario debe ser mayor a 0");
        return;
      }

      // Verificar documento duplicado
      if (formulario.documento.trim()) {
        const existe = await EmpleadoService.existePorDocumento(
          formulario.documento
        );
        if (
          existe &&
          (!usuarioEditando ||
            usuarioEditando.documento !== formulario.documento)
        ) {
          mostrarMensaje("error", "Ya existe un usuario con ese documento");
          return;
        }
      }

      setGuardando(true);

      const proyectosArray = formulario.proyectos
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);

      const datosUsuario: Omit<Empleado, "id" | "creadoEn"> = {
        nombre: formulario.nombre.trim(),
        correo: formulario.correo.trim(),
        rol: formulario.rol,
        empresa: formulario.empresa,
        activo: true,
        salarioBaseMensual: Number(formulario.salarioBaseMensual),
        documento: formulario.documento.trim() || undefined,
        area: formulario.area.trim() || undefined,
        proyectos: proyectosArray.length > 0 ? proyectosArray : undefined,
        recargosActivos: true, // Default to true for new users
      };

      if (usuarioEditando) {
        // Editar usuario existente
        await EmpleadoService.actualizar(usuarioEditando.id, datosUsuario);
        mostrarMensaje("exito", "Usuario actualizado correctamente");
      } else {
        // Crear nuevo usuario con acceso
        await crearEmpleadoConAcceso(datosUsuario);
        mostrarMensaje(
          "exito",
          "Usuario creado. Se envió correo para configurar contraseña"
        );
      }

      setModalUsuarioAbierto(false);
      await cargarUsuarios();
    } catch (err) {
      console.error("Error guardando usuario:", err);
      mostrarMensaje(
        "error",
        err instanceof Error ? err.message : "Error al guardar usuario"
      );
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminarUsuario = async (usuario: Empleado) => {
    try {
      await EmpleadoService.eliminar(usuario.id);
      mostrarMensaje("exito", "Usuario eliminado correctamente");
      await cargarUsuarios();
    } catch (err) {
      console.error("Error eliminando usuario:", err);
      mostrarMensaje("error", "Error al eliminar usuario");
    }
  };

  const handleToggleActivarUsuario = async (usuario: Empleado) => {
    try {
      await EmpleadoService.activar(usuario.id, !usuario.activo);
      mostrarMensaje(
        "exito",
        `Usuario ${!usuario.activo ? "activado" : "desactivado"}`
      );
      await cargarUsuarios();
    } catch (err) {
      console.error("Error toggle activo:", err);
      mostrarMensaje("error", "Error al cambiar estado del usuario");
    }
  };

  const handleToggleRecargos = async (userId: string, activar: boolean) => {
    try {
      await toggleRecargos(userId, activar);
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, recargosActivos: activar } : u
        )
      );

      // Recalcular todas las jornadas del empleado para aplicar el nuevo estado de recargos
      await recalcularJornadasEmpleado(userId);

      mostrarMensaje(
        "exito",
        `Extras ${activar ? "activados" : "desactivados"}`
      );
    } catch (err) {
      console.error("Error toggleRecargos:", err);
      mostrarMensaje("error", "Error al cambiar extras");
    }
  };

  const handleCambiarRol = async (usuario: Empleado, nuevoRol: Rol) => {
    try {
      await EmpleadoService.setRol(usuario.id, nuevoRol);
      mostrarMensaje("exito", "Rol actualizado correctamente");
      await cargarUsuarios();
    } catch (err) {
      console.error("Error cambiando rol:", err);
      mostrarMensaje("error", "Error al cambiar rol");
    }
  };

  // ============================================================================
  // FESTIVOS
  // ============================================================================

  const handleAgregarFestivo = async () => {
    if (!nuevoFestivo) {
      mostrarMensaje("error", "Selecciona una fecha válida");
      return;
    }
    try {
      await agregarFestivoManual(nuevoFestivo);
      setFestivos((prev) => [...prev, nuevoFestivo]);
      setNuevoFestivo("");
      mostrarMensaje("exito", "Festivo agregado");
    } catch (err) {
      console.error("Error agregarFestivo:", err);
      mostrarMensaje("error", "Error al agregar festivo");
    }
  };

  const handleEliminarFestivo = async (fecha: string) => {
    try {
      await eliminarFestivoManual(fecha);
      setFestivos((prev) => prev.filter((f) => f !== fecha));
      mostrarMensaje("exito", "Festivo eliminado");
    } catch (err) {
      console.error("Error eliminarFestivo:", err);
      mostrarMensaje("error", "Error al eliminar festivo");
    }
  };

  // ============================================================================
  // PARÁMETROS
  // ============================================================================

  const handleGuardarParametros = async () => {
    try {
      setGuardando(true);
      await actualizarParametros(parametros);
      mostrarMensaje("exito", "Parámetros guardados correctamente");
    } catch (err) {
      console.error("Error actualizarParametros:", err);
      mostrarMensaje("error", "Error al guardar parámetros");
    } finally {
      setGuardando(false);
    }
  };

  // ============================================================================
  // RECALCULAR JORNADAS
  // ============================================================================

  const recalcularJornadasEmpleado = async (userId: string) => {
    try {
      // Obtener todas las jornadas del empleado
      const jornadas = await listarJornadasPorUsuarioRango({
        userId,
        desdeISO: "2020-01-01", // Fecha antigua para obtener todas
        hastaISO: new Date().toISOString().split("T")[0],
      });

      // Obtener datos del empleado actualizados
      const empleado = await EmpleadoService.obtener(userId);
      if (!empleado) {
        console.warn(`Empleado ${userId} no encontrado`);
        return;
      }

      // Obtener configuraciones para recalcular
      const [nominaCfgRaw, recargosCfgRaw, rulesRaw] = await Promise.all([
        ConfigNominaService.getNomina(),
        ConfigNominaService.getRecargos(),
        ConfigNominaService.getRules(),
      ]);

      const nominaCfg = nominaCfgRaw ?? DEFAULT_NOMINA;
      const recargosCfg = recargosCfgRaw ?? DEFAULT_RECARGOS;
      const rules = rulesRaw ?? DEFAULT_RULES;

      // Recalcular cada jornada
      for (const jornada of jornadas) {
        try {
          // Verificar que la jornada tenga ID
          if (!jornada.id) {
            console.warn(`Jornada sin ID encontrada, saltando:`, jornada);
            continue;
          }

          // Recalcular con el nuevo estado de recargos
          const calc = calcularDiaBasico(
            empleado.salarioBaseMensual ?? 0,
            nominaCfg,
            recargosCfg,
            rules,
            {
              fecha: jornada.fecha,
              horaEntrada: jornada.horaEntrada,
              horaSalida: jornada.horaSalida,
              esDominicalFestivo: jornada.esDominicalFestivo,
              recargosActivos: empleado.recargosActivos ?? true,
            }
          );

          // Actualizar jornada existente con los nuevos valores calculados
          const updateData: Partial<JornadaDoc> = {
            // Horas recalculadas
            recargoNocturnoOrdinario:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Recargo Nocturno Ordinario"] ?? 0,
            recargoFestivoDiurno:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Recargo Festivo Diurno"] ?? 0,
            recargoFestivoNocturno:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Recargo Festivo Nocturno"] ?? 0,
            extrasDiurnas:
              jornada.turnoId === "D" ? 0 : calc.horas?.["Extras Diurnas"] ?? 0,
            extrasNocturnas:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Extras Nocturnas"] ?? 0,
            extrasDiurnasDominical:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Extras Diurnas Dominical"] ?? 0,
            extrasNocturnasDominical:
              jornada.turnoId === "D"
                ? 0
                : calc.horas?.["Extras Nocturnas Dominical"] ?? 0,
            horasExtras:
              jornada.turnoId === "D"
                ? 0
                : (calc.horas?.["Extras Diurnas"] ?? 0) +
                  (calc.horas?.["Extras Nocturnas"] ?? 0) +
                  (calc.horas?.["Extras Diurnas Dominical"] ?? 0) +
                  (calc.horas?.["Extras Nocturnas Dominical"] ?? 0),
            totalHoras:
              jornada.turnoId === "D" ? 0 : calc.horas?.["Total Horas"] ?? 0,

            // Valores recalculados
            valorRecargoNocturnoOrdinario:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Recargo Nocturno Ordinario"] ?? 0,
            valorRecargoFestivoDiurno:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Recargo Festivo Diurno"] ?? 0,
            valorRecargoFestivoNocturno:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Recargo Festivo Nocturno"] ?? 0,
            valorExtrasDiurnas:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Extras Diurnas"] ?? 0,
            valorExtrasNocturnas:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Extras Nocturnas"] ?? 0,
            valorExtrasDiurnasDominical:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Extras Diurnas Dominical"] ?? 0,
            valorExtrasNocturnasDominical:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Extras Nocturnas Dominical"] ?? 0,
            valorTotalDia:
              jornada.turnoId === "D"
                ? 0
                : calc.valores?.["Valor Total Día"] ?? 0,
          };

          await actualizarJornada(userId, jornada.id, updateData);

          console.log(`Jornada actualizada para ${userId} en ${jornada.fecha}`);
        } catch (error) {
          console.error(
            `Error recalculando jornada ${jornada.id || "sin ID"}:`,
            error
          );
        }
      }

      console.log(
        `Recálculo completado para ${userId}: ${jornadas.length} jornadas`
      );
    } catch (error) {
      console.error(`Error recalculando jornadas para ${userId}:`, error);
      throw error;
    }
  };

  // ============================================================================
  // COMPONENTES DE CONFIRMACIÓN
  // ============================================================================

  const RecargosButtonWithConfirm = ({
    usuario,
  }: {
    usuario: Empleado & { recargosActivos?: boolean };
  }) => {
    const activar = !usuario.recargosActivos;

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              usuario.recargosActivos
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-green-50 text-green-600 hover:bg-green-100"
            }`}
          >
            {usuario.recargosActivos ? "Desactivar" : "Activar"}
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {activar ? "Activar recargos" : "Desactivar recargos"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {activar
                ? `¿Deseas activar recargos para ${usuario.nombre}?`
                : `¿Deseas desactivar recargos para ${usuario.nombre}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleRecargos(usuario.id, activar)}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <section className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Mensajes */}
      {mensaje && (
        <div
          className={`p-4 rounded-lg border ${
            mensaje.tipo === "exito"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          {mensaje.texto}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          Configuración del Administrador
        </h1>
        <p className="text-sm text-gray-600">
          Gestión de empleados, horarios nocturnos, recargos y parámetros de
          nómina
        </p>
      </div>
      {/* ====================================================================
          GESTIÓN DE USUARIOS
      ==================================================================== */}
      <div className="p-5 border rounded-xl bg-white shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold text-lg">Gestión de Usuarios</h2>
            <p className="text-sm text-gray-500">
              Crear, editar y administrar usuarios del sistema
            </p>
          </div>
          <Button onClick={abrirModalNuevoUsuario}>+ Nuevo Usuario</Button>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-3 text-left">Nombre</th>
                <th className="p-3 text-left">Correo</th>
                <th className="p-3 text-left">Documento</th>
                <th className="p-3 text-left">Rol</th>
                <th className="p-3 text-left">Empresa</th>
                <th className="p-3 text-center">Salario</th>
                <th className="p-3 text-center">Extras</th>
                <th className="p-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoUsuarios ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center">
                    Cargando usuarios...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium">{u.nombre}</td>
                    <td className="p-3 text-gray-600">{u.correo}</td>
                    <td className="p-3 text-gray-600">{u.documento || "-"}</td>
                    <td className="p-3">
                      <select
                        value={u.rol}
                        onChange={(e) =>
                          handleCambiarRol(u, e.target.value as Rol)
                        }
                        className="text-sm border rounded px-2 py-1 capitalize"
                      >
                        <option value="empleado">Empleado</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="p-3">{u.empresa}</td>
                    <td className="p-3 text-center">
                      ${u.salarioBaseMensual.toLocaleString()}
                    </td>
                    <td className="p-3 text-center">
                      <RecargosButtonWithConfirm usuario={u} />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => abrirModalEditarUsuario(u)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          Editar
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="text-red-600 hover:text-red-800 text-sm">
                              Eliminar
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Eliminar usuario
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                ¿Seguro que deseas eliminar a {u.nombre}? Esta
                                acción no se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleEliminarUsuario(u)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* ====================================================================
          FESTIVOS MANUALES
      ==================================================================== */}
      <div className="p-5 border rounded-xl bg-white shadow-sm">
        <h2 className="font-semibold mb-3 text-lg">Días Festivos Manuales</h2>
        <p className="text-sm text-gray-500 mb-4">
          Agrega festivos adicionales que el sistema reconocerá
        </p>

        <div className="flex items-center gap-3 mb-4">
          <Input
            type="date"
            value={nuevoFestivo}
            onChange={(e) => setNuevoFestivo(e.target.value)}
            className="max-w-xs"
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default">Agregar festivo</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Agregar festivo</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Deseas agregar la fecha {nuevoFestivo || "(no seleccionada)"}{" "}
                  como festivo?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleAgregarFestivo}>
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {festivos.length === 0 ? (
            <p className="text-sm text-gray-500 col-span-full">
              No hay festivos manuales registrados
            </p>
          ) : (
            festivos.map((f) => (
              <div
                key={f}
                className="flex justify-between items-center p-3 border rounded-lg bg-gray-50"
              >
                <span className="font-mono text-sm">{f}</span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="text-sm text-red-600 hover:text-red-800">
                      Eliminar
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Eliminar festivo</AlertDialogTitle>
                      <AlertDialogDescription>
                        ¿Seguro que deseas eliminar el festivo {f}?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleEliminarFestivo(f)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))
          )}
        </div>
      </div>
      {/* ====================================================================
      PARÁMETROS GLOBALES
==================================================================== */}
      <div className="p-5 border rounded-xl bg-white shadow-sm">
        <h2 className="font-semibold mb-3 text-lg">Parámetros Globales</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configura horarios nocturnos, porcentajes de recargos, valores fijos y
          horas laborales
        </p>

        <div className="grid sm:grid-cols-2 gap-8">
          {/* Porcentajes de recargo */}
          <div>
            <h3 className="font-medium mb-4">Porcentajes de Recargo (%)</h3>

            {Object.entries(parametros.recargos).map(([key, value]) => {
              const inputValue = recargoInput[key] ?? value.toFixed(2);

              return (
                <div
                  key={key}
                  className="flex justify-between items-center mb-2"
                >
                  <Label>{key.replace(/_/g, " ")}</Label>
                  <Input
                    type="text" // Usamos text para evitar que React convierta a número antes de tiempo
                    className="w-24"
                    value={inputValue}
                    onChange={(e) => {
                      const val = e.target.value;
                      // Permitimos solo números y punto decimal
                      if (/^[0-9]*\.?[0-9]*$/.test(val)) {
                        setRecargoInput((prev) => ({ ...prev, [key]: val }));
                      }
                    }}
                    onBlur={() => {
                      // Guardamos el valor decimal directamente
                      const num = parseFloat(recargoInput[key] ?? "0");
                      setParametros((prev) => ({
                        ...prev,
                        recargos: { ...prev.recargos, [key]: num },
                      }));
                      // Fijamos el input con 2 decimales
                      setRecargoInput((prev) => ({
                        ...prev,
                        [key]: (num ?? 0).toFixed(2),
                      }));
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Horas laborales */}
          <div>
            <h3 className="font-medium mb-4">Horas Laborales</h3>
            <div className="flex justify-between items-center mb-2">
              <Label>Horas Mensuales</Label>
              <Input
                type="number"
                className="w-24"
                value={parametros.nomina.horasLaboralesMes}
                onChange={(e) =>
                  setParametros((prev) => ({
                    ...prev,
                    nomina: {
                      ...prev.nomina,
                      horasLaboralesMes: Number(e.target.value),
                    },
                  }))
                }
              />
            </div>
            <h3 className="font-medium mb-4 mt-6">Horarios Nocturnos</h3>
            <div className="flex justify-between items-center mb-2">
              <Label>Hora Inicio Nocturno</Label>
              <Input
                type="time"
                className="w-24"
                value={parametros.rules.nightStartsAt}
                onChange={(e) =>
                  setParametros((prev) => ({
                    ...prev,
                    rules: {
                      ...prev.rules,
                      nightStartsAt: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <div className="flex justify-between items-center mb-2">
              <Label>Hora Fin Nocturno</Label>
              <Input
                type="time"
                className="w-24"
                value={parametros.rules.nightEndsAt}
                onChange={(e) =>
                  setParametros((prev) => ({
                    ...prev,
                    rules: {
                      ...prev.rules,
                      nightEndsAt: e.target.value,
                    },
                  }))
                }
              />
            </div>
            <h3 className="font-medium mb-4 mt-6">
              Valor Fijo Recargo Nocturno
            </h3>
            <div className="flex justify-between items-center mb-2">
              <Label>Valor Fijo (opcional)</Label>
              <Input
                type="number"
                step="0.01"
                className="w-24"
                value={parametros.recargos.fixedRecargoValue ?? ""}
                onChange={(e) =>
                  setParametros((prev) => ({
                    ...prev,
                    recargos: {
                      ...prev.recargos,
                      fixedRecargoValue:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    },
                  }))
                }
                placeholder="Ej: 0.35"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={guardando}>
                {guardando ? "Guardando..." : "Guardar parámetros"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Guardar parámetros</AlertDialogTitle>
                <AlertDialogDescription>
                  ¿Deseas guardar los cambios en los parámetros globales?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleGuardarParametros}>
                  Guardar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* ====================================================================
          MODAL CREAR/EDITAR USUARIO
      ==================================================================== */}
      <Dialog open={modalUsuarioAbierto} onOpenChange={setModalUsuarioAbierto}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {usuarioEditando ? "Editar Usuario" : "Nuevo Usuario"}
            </DialogTitle>
            <DialogDescription>
              {usuarioEditando
                ? "Actualiza la información del usuario"
                : "Se creará el usuario y se enviará un correo para configurar su contraseña"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nombre">Nombre *</Label>
                <Input
                  id="nombre"
                  value={formulario.nombre}
                  onChange={(e) =>
                    setFormulario({ ...formulario, nombre: e.target.value })
                  }
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <Label htmlFor="correo">Correo *</Label>
                <Input
                  id="correo"
                  type="email"
                  value={formulario.correo}
                  onChange={(e) =>
                    setFormulario({ ...formulario, correo: e.target.value })
                  }
                  placeholder="juan@ejemplo.com"
                  disabled={!!usuarioEditando}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="documento">Documento</Label>
                <Input
                  id="documento"
                  value={formulario.documento}
                  onChange={(e) =>
                    setFormulario({
                      ...formulario,
                      documento: e.target.value,
                    })
                  }
                  placeholder="123456789"
                />
              </div>
              <div>
                <Label htmlFor="salario">Salario Base Mensual *</Label>
                <Input
                  id="salario"
                  type="number"
                  value={formulario.salarioBaseMensual}
                  onChange={(e) =>
                    setFormulario({
                      ...formulario,
                      salarioBaseMensual: e.target.value,
                    })
                  }
                  placeholder="1300000"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="rol">Rol *</Label>
                <Select
                  value={formulario.rol}
                  onValueChange={(value: Rol) =>
                    setFormulario({ ...formulario, rol: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empleado">Empleado</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="empresa">Empresa *</Label>
                <Select
                  value={formulario.empresa}
                  onValueChange={(value: Empresas) =>
                    setFormulario({ ...formulario, empresa: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NETCOL">NETCOL</SelectItem>
                    <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
                    <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setModalUsuarioAbierto(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button onClick={handleGuardarUsuario} disabled={guardando}>
              {guardando
                ? "Guardando..."
                : usuarioEditando
                ? "Actualizar"
                : "Crear Usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
