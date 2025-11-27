"use client";

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogDescription,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import {
  Play,
  Square,
  Camera,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  iniciarJornada,
  finalizarJornada,
  obtenerJornadaActiva,
  capturarFoto,
  obtenerUbicacionActual,
  type JornadaActiva,
} from "@/services/jornadaActiva.service";
import type { Empleado } from "@/models/usuarios.model";

type EstadoJornada =
  | "no_iniciada"
  | "iniciando"
  | "activa"
  | "finalizando"
  | "finalizada"
  | "error";

export default function InicioJornadaView() {
  const [user, setUser] = useState<User | null>(null);
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [estado, setEstado] = useState<EstadoJornada>("no_iniciada");
  const [jornadaActiva, setJornadaActiva] = useState<JornadaActiva | null>(
    null
  );
  const [mensaje, setMensaje] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [turnoId, setTurnoId] = useState<string>("");

  // Estados para cámara
  const [mostrarCamara, setMostrarCamara] = useState(false);
  const [tipoAccion, setTipoAccion] = useState<"inicio" | "fin" | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Funciones de cámara
  const iniciarCamara = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" }, // Cámara frontal
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error("Error accediendo a la cámara:", error);
      throw new Error("No se pudo acceder a la cámara. Verifica los permisos.");
    }
  };

  const cerrarCamara = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setMostrarCamara(false);
    setTipoAccion(null);
  };

  const capturarFotoDesdeCamara = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const context = canvas.getContext("2d");

    if (!context) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", 0.8);
  };

  // Obtener usuario autenticado
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return () => unsubscribe();
  }, []);

  // Obtener datos del empleado y jornada activa
  useEffect(() => {
    if (!user) return;

    const cargarDatos = async () => {
      try {
        // Obtener datos del empleado
        const empleadoRef = doc(db, "usuarios", user.uid);
        const empleadoSnap = await getDoc(empleadoRef);
        if (empleadoSnap.exists()) {
          setEmpleado(empleadoSnap.data() as Empleado);
        }

        // Obtener jornada activa
        const jornada = await obtenerJornadaActiva(user.uid);
        if (jornada) {
          setJornadaActiva(jornada);
          setEstado("activa");
        }

        // Obtener turno del día
        const hoy = new Date();
        const fechaId = `${hoy.getFullYear()}_${String(
          hoy.getMonth() + 1
        ).padStart(2, "0")}_${String(hoy.getDate()).padStart(2, "0")}`;
        const turnoRef = doc(
          db,
          "usuarios",
          user.uid,
          "malla",
          `${hoy.getFullYear()}_${String(hoy.getMonth() + 1).padStart(2, "0")}`,
          "dias",
          String(hoy.getDate()).padStart(2, "0")
        );
        const turnoSnap = await getDoc(turnoRef);
        if (turnoSnap.exists()) {
          const turnoData = turnoSnap.data();
          setTurnoId(turnoData?.turno || "");
        }
      } catch (error) {
        console.error("Error cargando datos:", error);
        setMensaje("Error al cargar los datos");
        setEstado("error");
      }
    };

    cargarDatos();
  }, [user]);

  const manejarInicioJornada = async () => {
    if (!user || !empleado || !turnoId) {
      setMensaje("Datos incompletos para iniciar jornada");
      return;
    }

    try {
      // Verificar permisos de ubicación primero
      await obtenerUbicacionActual();

      // Mostrar cámara para captura de foto
      setTipoAccion("inicio");
      setMostrarCamara(true);
      await iniciarCamara();
    } catch (error) {
      console.error("Error preparando inicio de jornada:", error);
      setMensaje(error instanceof Error ? error.message : "Error desconocido");
    }
  };

  const manejarFinJornada = async () => {
    if (!jornadaActiva) {
      setMensaje("No hay jornada activa para finalizar");
      return;
    }

    try {
      // Verificar permisos de ubicación primero
      await obtenerUbicacionActual();

      // Mostrar cámara para captura de foto
      setTipoAccion("fin");
      setMostrarCamara(true);
      await iniciarCamara();
    } catch (error) {
      console.error("Error preparando fin de jornada:", error);
      setMensaje(error instanceof Error ? error.message : "Error desconocido");
    }
  };

  const procederConAccion = async (fotoDataURL: string) => {
    if (!user || !empleado || !turnoId) return;

    setCargando(true);
    setMostrarCamara(false);

    if (tipoAccion === "inicio") {
      setEstado("iniciando");
      setMensaje("");

      try {
        // Iniciar jornada
        const jornadaId = await iniciarJornada(empleado, turnoId, fotoDataURL);

        // Actualizar estado
        const jornada = await obtenerJornadaActiva(user.uid);
        setJornadaActiva(jornada);
        setEstado("activa");
        setMensaje("Jornada iniciada exitosamente");
      } catch (error) {
        console.error("Error iniciando jornada:", error);
        setMensaje(
          error instanceof Error ? error.message : "Error desconocido"
        );
        setEstado("error");
      }
    } else if (tipoAccion === "fin" && jornadaActiva) {
      setEstado("finalizando");
      setMensaje("");

      try {
        // Finalizar jornada
        await finalizarJornada(jornadaActiva.id, fotoDataURL);

        setEstado("finalizada");
        setJornadaActiva(null);
        setMensaje("Jornada finalizada exitosamente");
      } catch (error) {
        console.error("Error finalizando jornada:", error);
        setMensaje(
          error instanceof Error ? error.message : "Error desconocido"
        );
        setEstado("error");
      }
    }

    setCargando(false);
    setTipoAccion(null);
  };

  const formatearHora = (fecha: Date | any) => {
    if (!fecha) return "--:--";
    const d = fecha.toDate ? fecha.toDate() : new Date(fecha);
    return d.toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-center">
        Control de Jornada
      </h1>

      {/* Estado actual */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Estado Actual
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Estado:</span>
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  estado === "activa"
                    ? "bg-green-100 text-green-800"
                    : estado === "finalizada"
                    ? "bg-blue-100 text-blue-800"
                    : estado === "error"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                {estado === "activa"
                  ? "En Progreso"
                  : estado === "finalizada"
                  ? "Finalizada"
                  : estado === "no_iniciada"
                  ? "No Iniciada"
                  : estado === "iniciando"
                  ? "Iniciando..."
                  : estado === "finalizando"
                  ? "Finalizando..."
                  : "Error"}
              </span>
            </div>

            {jornadaActiva && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Inicio:</span>
                  <span className="text-sm">
                    {formatearHora(jornadaActiva.horaInicio)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ubicación:</span>
                  <span className="text-sm flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {jornadaActiva.ubicacionInicio
                      ? `${jornadaActiva.ubicacionInicio.lat.toFixed(
                          4
                        )}, ${jornadaActiva.ubicacionInicio.lng.toFixed(4)}`
                      : "No disponible"}
                  </span>
                </div>
              </>
            )}

            {turnoId && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Turno:</span>
                <span className="text-sm">{turnoId}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mensajes */}
      {mensaje && (
        <AlertDialog open={!!mensaje} onOpenChange={() => setMensaje("")}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {estado === "error" ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                )}
                {estado === "error" ? "Error" : "Éxito"}
              </AlertDialogTitle>
              <AlertDialogDescription>{mensaje}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setMensaje("")}>
                Aceptar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Diálogo de cámara */}
      <AlertDialog open={mostrarCamara} onOpenChange={cerrarCamara}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Camera className="w-5 h-5" />
              Tomar Foto
            </AlertDialogTitle>
            <AlertDialogDescription>
              Posiciónate frente a la cámara y toma tu foto para{" "}
              {tipoAccion === "inicio" ? "iniciar" : "finalizar"} la jornada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col items-center space-y-4">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-w-sm rounded-lg border"
            />
            <canvas ref={canvasRef} className="hidden" />
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={cerrarCamara}>
              Cancelar
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                const fotoDataURL = capturarFotoDesdeCamara();
                if (fotoDataURL) {
                  cerrarCamara();
                  procederConAccion(fotoDataURL);
                }
              }}
              className="flex items-center gap-2"
            >
              <Camera className="w-4 h-4" />
              Tomar Foto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Botones de acción */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === "no_iniciada" && (
            <Button
              onClick={manejarInicioJornada}
              disabled={cargando || !turnoId}
              className="w-full flex items-center gap-2 h-12"
            >
              <Camera className="w-5 h-5" />
              {cargando ? "Iniciando..." : "Iniciar Jornada"}
            </Button>
          )}

          {estado === "activa" && (
            <Button
              onClick={manejarFinJornada}
              disabled={cargando}
              variant="destructive"
              className="w-full flex items-center gap-2 h-12"
            >
              <Camera className="w-5 h-5" />
              {cargando ? "Finalizando..." : "Finalizar Jornada"}
            </Button>
          )}

          {estado === "finalizada" && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
              <p className="text-green-700 font-medium">Jornada completada</p>
              <p className="text-sm text-gray-600">
                Puedes iniciar una nueva jornada mañana
              </p>
            </div>
          )}

          {!turnoId && estado === "no_iniciada" && (
            <div className="text-center py-4">
              <XCircle className="w-12 h-12 text-orange-500 mx-auto mb-2" />
              <p className="text-orange-700 font-medium">
                No tienes turno asignado para hoy
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Información adicional */}
      <div className="mt-6 text-center text-sm text-gray-600">
        <p>
          Al iniciar/finalizar jornada se capturará automáticamente tu ubicación
          y foto
        </p>
        <p>Asegúrate de tener permisos de cámara y ubicación activados</p>
      </div>
    </div>
  );
}
