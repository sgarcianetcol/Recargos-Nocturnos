"use client";

import React, { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { TURNOS_PREDETERMINADOS } from "@/models/turnos.defaults";
import type { TurnoBase } from "@/models/config.model";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { crearJornadaCalculada } from "@/services/jornada.service";
import type { Empleado } from "@/models/usuarios.model";

export default function DashboardEmpleado() {
  // 🔹 Usuario autenticado
  const [user, setUser] = useState<User | null>(null);

  // 🔹 Turno del día y detalles
  const [turno, setTurno] = useState<{
    turno: string;
    [key: string]: unknown;
  } | null>(null);
  const [detalleTurno, setDetalleTurno] = useState<TurnoBase | null>(null);

  // 🔹 Estados de carga y jornada
  const [loading, setLoading] = useState(true);
  const [jornadaActiva, setJornadaActiva] = useState(false);
  const [tiempoTranscurrido, setTiempoTranscurrido] = useState(0);

  // 🔹 Contador de tiempo
  const contadorRef = useRef<NodeJS.Timeout | null>(null);

  // 🔹 Historial en pantalla (acumulativo)
  const [historial, setHistorial] = useState<
    Array<{
      fecha: string;
      accion: string;
      hora: string;
      ubicacion: { lat: number; lng: number };
      duracion?: number;
    }>
  >([]);

  // 🔹 AlertDialog
  const [showDialog, setShowDialog] = useState(false);
  const [dialogInfo, setDialogInfo] = useState<{
    title: string;
    description: string;
    onConfirm?: () => void;
  } | null>(null);

  // 🔹 Fecha actual
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  const fechaId = `${año}_${mes}_${dia}`;

  // --- Detectar usuario ---
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Cargar turno del día ---
  useEffect(() => {
    if (!user) return;
    const fetchTurno = async () => {
      const ref = doc(
        db,
        `usuarios/${user.uid}/malla/${año}_${mes}/dias/${dia}`
      );
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        if (data.turno) {
          setTurno(data as { turno: string; [key: string]: unknown });
          const detalle = TURNOS_PREDETERMINADOS.find(
            (t) => t.id === data.turno
          );
          setDetalleTurno(detalle || null);
        }
      }
      setLoading(false);
    };
    fetchTurno();
  }, [user, año, mes, dia]);

  // --- Verificar si hay jornada activa ---
  useEffect(() => {
    if (!user) return;
    const checkJornadaActiva = async () => {
      const ref = doc(db, `usuarios/${user.uid}/jornadas/${fechaId}`);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();

        // ✅ Cargar historial siempre, incluso si activo = false
        setHistorial(data.historial || []);

        if (data.activo) {
          setJornadaActiva(true);
          const inicio = data.horaInicioReal?.toDate?.();
          if (inicio) {
            const diff = Math.floor((Date.now() - inicio.getTime()) / 1000);
            setTiempoTranscurrido(diff);
            iniciarContador(inicio);
          }
        } else {
          setJornadaActiva(false);
        }
      }
    };
    checkJornadaActiva();
  }, [user, fechaId]);

  // --- Iniciar contador ---
  const iniciarContador = (inicio: Date) => {
    if (contadorRef.current) clearInterval(contadorRef.current);
    contadorRef.current = setInterval(() => {
      const diff = Math.floor((Date.now() - inicio.getTime()) / 1000);
      setTiempoTranscurrido(diff);
    }, 1000);
  };

  // --- Obtener ubicación actual ---
  const obtenerUbicacion = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        alert("Tu navegador no soporta geolocalización.");
        return reject();
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        (err) => {
          alert("Debes activar la ubicación para continuar.");
          reject(err);
        }
      );
    });
  };

  // --- Guardar movimiento en historial (local + Firestore) ---
  const guardarHistorial = async (
    accion: "inicio" | "fin",
    ubicacion: { lat: number; lng: number },
    duracion?: number
  ) => {
    const horaActual = new Date();

    // ✅ Asegurar estructura limpia (sin undefined)
    const nuevoRegistro = {
      fecha: horaActual.toLocaleDateString("es-CO"),
      accion,
      hora: horaActual.toLocaleTimeString(),
      ubicacion: {
        lat: ubicacion.lat ?? 0,
        lng: ubicacion.lng ?? 0,
      },
      ...(duracion !== undefined && { duracion }), // solo si existe
    };

    // 🔹 Actualizamos historial local
    setHistorial((prev) => [nuevoRegistro, ...prev]);

    // 🔹 Actualizamos historial en Firestore
    const ref = doc(db, `usuarios/${user!.uid}/jornadas/${fechaId}`);
    const snap = await getDoc(ref);
    const movimientos =
      snap.exists() && snap.data().historial ? snap.data().historial : [];
    await updateDoc(ref, {
      historial: [nuevoRegistro, ...movimientos],
    });
  };

  // --- Iniciar jornada ---
  const iniciarJornada = async () => {
    try {
      const ubicacion = await obtenerUbicacion();
      const ref = doc(db, `usuarios/${user!.uid}/jornadas/${fechaId}`);
      const horaInicio = new Date();
      if (!horaInicio || !ubicacion) {
        console.error(
          "No se puede iniciar jornada: horaInicio o ubicación indefinida"
        );
        return;
      }

      await setDoc(
        ref,
        {
          activo: true,
          horaInicioReal: horaInicio,
          ubicacionInicio: ubicacion,
          turnoId: turno?.turno || null,
          fecha: fechaId,
          creadoEn: serverTimestamp(),
        },
        { merge: true } // ✅ evita sobrescribir el historial
      );

      // 🔹 Actualizamos UI
      setJornadaActiva(true);
      iniciarContador(horaInicio);

      // 🔹 Guardamos historial
      await guardarHistorial("inicio", ubicacion);

      // 🔹 AlertDialog
      setDialogInfo({
        title: "Jornada iniciada",
        description: "Has iniciado tu jornada laboral correctamente.",
      });
      setShowDialog(true);
    } catch (e) {
      console.error("❌ Error al iniciar jornada:", e);
    }
  };

  // --- Finalizar jornada ---
  const finalizarJornada = async () => {
    try {
      const ubicacion = await obtenerUbicacion();
      const ref = doc(db, `usuarios/${user!.uid}/jornadas/${fechaId}`);
      const horaFin = new Date();

      // 🔹 Obtener datos de la jornada activa
      const jornadaSnap = await getDoc(ref);
      if (!jornadaSnap.exists()) {
        console.error("❌ No se encontró jornada activa");
        return;
      }

      const jornadaData = jornadaSnap.data();
      if (!jornadaData.turnoId) {
        console.error("❌ Jornada sin turno asignado");
        return;
      }

      // 🔹 Obtener datos del empleado desde Firestore
      const empleadoRef = doc(db, `usuarios/${user!.uid}`);
      const empleadoSnap = await getDoc(empleadoRef);

      if (!empleadoSnap.exists()) {
        console.error("❌ No se encontraron datos del empleado");
        return;
      }

      const empleadoData = empleadoSnap.data() as Empleado;

      // 🔹 Actualizar jornada con hora de fin
      await updateDoc(ref, {
        activo: false,
        horaFinReal: horaFin,
        ubicacionFin: ubicacion,
      });

      // 🔹 Detenemos contador
      setJornadaActiva(false);
      if (contadorRef.current) clearInterval(contadorRef.current);

      // 🔹 Guardamos historial
      await guardarHistorial("fin", ubicacion, tiempoTranscurrido);

      // 🧮 Crear jornada calculada en el sistema de Cálculo Masivo
      try {
        // Convertir fecha de "2025_11_10" a "2025-11-10"
        const fechaISO = fechaId.replace(/_/g, "-");

        // Convertir horas reales a formato "HH:mm"
        const horaInicioReal = jornadaData.horaInicioReal?.toDate
          ? jornadaData.horaInicioReal.toDate()
          : new Date();

        const horaEntradaStr = horaInicioReal.toLocaleTimeString("es-CO", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        });

        const horaSalidaStr = horaFin.toLocaleTimeString("es-CO", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
        });

        // 💾 Crear jornada calculada con horas reales
        const jornadaCalculadaId = await crearJornadaCalculada({
          empleado: {
            ...empleadoData,
            id: user!.uid,
          },
          fecha: fechaISO,
          turnoId: jornadaData.turnoId,
        });

        console.log(
          `✅ Jornada guardada en Cálculo Masivo con ID: ${jornadaCalculadaId}`
        );
        console.log(`   - Fecha: ${fechaISO}`);
        console.log(`   - Turno: ${jornadaData.turnoId}`);
        console.log(`   - Entrada real: ${horaEntradaStr}`);
        console.log(`   - Salida real: ${horaSalidaStr}`);
      } catch (calcErr) {
        console.error("❌ Error al crear jornada en Cálculo Masivo:", calcErr);
      }

      // 🔹 AlertDialog final
      setDialogInfo({
        title: "Jornada finalizada",
        description:
          "Has finalizado tu jornada laboral correctamente. Los datos han sido enviados al cálculo masivo.",
      });
      setShowDialog(true);
    } catch (e) {
      console.error("❌ Error al finalizar jornada:", e);
    }
  };

  if (loading) return <p className="text-center">Cargando turno...</p>;
  if (!turno)
    return (
      <p className="text-center text-gray-500">
        No tienes turno asignado para hoy.
      </p>
    );

  // --- Formatear tiempo transcurrido ---
  const horas = Math.floor(tiempoTranscurrido / 3600);
  const minutos = Math.floor((tiempoTranscurrido % 3600) / 60);
  const segundos = tiempoTranscurrido % 60;

  return (
    <main className="p-6 flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Estado del día</h1>

      <section className="p-6 rounded-2xl shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100 text-center w-full max-w-md">
        {/* Información del turno */}
        <p className="text-lg mb-2">
          <strong>Turno:</strong> {turno.turno}
        </p>
        <p className="text-lg mb-2">
          <strong>Horario:</strong>{" "}
          {detalleTurno
            ? `${detalleTurno.horaEntrada} - ${detalleTurno.horaSalida}`
            : "-"}
        </p>
        <p className="text-lg mb-2">
          <strong>Fecha:</strong> {new Date().toLocaleDateString("es-CO")}
        </p>

        {/* Tiempo transcurrido */}
        {jornadaActiva && (
          <p className="text-lg font-semibold text-green-700 mt-2">
            Tiempo transcurrido: {horas}h {minutos}m {segundos}s
          </p>
        )}

        {/* Botón iniciar / finalizar jornada */}
        <Button
          size="lg"
          className={`w-full text-lg py-6 mt-6 rounded-xl text-white ${
            jornadaActiva ? "bg-red-600 hover:bg-red-700" : ""
          }`}
          onClick={() => {
            if (jornadaActiva) {
              setDialogInfo({
                title: "Finalizar jornada",
                description: "¿Deseas finalizar tu jornada laboral?",
                onConfirm: finalizarJornada,
              });
            } else {
              setDialogInfo({
                title: "Iniciar jornada",
                description: "¿Deseas iniciar tu jornada laboral ahora?",
                onConfirm: iniciarJornada,
              });
            }
            setShowDialog(true); // Se llama siempre después
          }}
        >
          {jornadaActiva
            ? "Finalizar jornada laboral"
            : "Iniciar jornada laboral"}
        </Button>
      </section>

      {/* 🔹 Historial en pantalla */}
      <section className="mt-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4 ">Historial</h2>
        {historial.length === 0 && (
          <p className="text-gray-500">Sin movimientos aún.</p>
        )}
        {historial.map((item, index) => (
          <div
            key={index}
            className="p-3 mb-2 border rounded-lg bg-white shadow-sm"
          >
            <p>
              <strong>Fecha:</strong> {item.fecha}
            </p>
            <p>
              <strong>Acción:</strong>{" "}
              {item.accion === "inicio" ? "Inicio jornada" : "Fin jornada"}
            </p>
            <p>
              <strong>Hora:</strong> {item.hora}
            </p>
            <p>
              <strong>Ubicación:</strong> {item.ubicacion.lat.toFixed(6)},
              {item.ubicacion.lng.toFixed(6)}
            </p>
            {item.duracion !== undefined && (
              <p>
                <strong>Duración:</strong> {Math.floor(item.duracion / 3600)}h{" "}
                {Math.floor((item.duracion % 3600) / 60)}m {item.duracion % 60}s
              </p>
            )}
          </div>
        ))}
      </section>

      {/* 🔹 AlertDialog */}
      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogInfo?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialogInfo?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {dialogInfo?.onConfirm && (
              <AlertDialogAction onClick={dialogInfo.onConfirm}>
                Confirmar
              </AlertDialogAction>
            )}
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
