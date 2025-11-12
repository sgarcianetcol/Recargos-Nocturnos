// src/services/empleados.service.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { crearJornadaCalculada } from "@/services/jornada.service";
import type { Empleado } from "@/models/usuarios.model";

/**
 * Helper para fecha ISO
 */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Intento de obtener ubicación usando Geolocation API en cliente.
 * Retorna "lat,lng" o null si no se pudo obtener.
 */
async function obtenerUbicacionFrontend(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    console.log(
      "[ubicacion] ❌ Geolocation no está disponible en este navegador"
    );
    return null;
  }

  console.log("[ubicacion] ✅ Solicitando permisos de ubicación...");

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        console.log("[ubicacion] ✅ Permiso concedido");
        console.log("[ubicacion] Coordenadas recibidas:", pos.coords);

        const { latitude, longitude } = pos.coords;
        resolve(`${latitude},${longitude}`);
      },
      (err) => {
        console.warn(
          "[ubicacion] ❌ Permiso denegado o error al obtener ubicación:",
          err
        );
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

/**
 * Obtener empleado (normaliza y evita duplicar el id en spread)
 */
export async function obtenerEmpleado(
  userId: string
): Promise<Empleado | null> {
  const ref = doc(db, "usuarios", userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as any;
  // Evitamos advertencia por duplicar id: aplicamos spread de datos y luego id
  return { ...(data as Empleado), id: snap.id } as Empleado;
}

export async function iniciarJornadaConUbicacion(
  userId: string,
  fechaISO?: string
) {
  const fecha = fechaISO ?? hoyISO();

  // 1) Obtener empleado
  const empRef = doc(db, "usuarios", userId);
  const empSnap = await getDoc(empRef);
  if (!empSnap.exists()) {
    console.log("[empleados.service] empleado no existe:", userId);
    return { ok: false, error: "empleado_no_existe" };
  }
  const empleado = {
    ...(empSnap.data() as Empleado),
    id: empSnap.id,
  } as Empleado;

  // 2) Leer malla del día: usuarios/{id}/malla/{YYYY_MM}/dias/{DD}
  const [yyyy, mm, dd] = fecha.split("-");
  const mallaRef = doc(
    db,
    "usuarios",
    userId,
    "malla",
    `${yyyy}_${mm}`,
    "dias",
    dd
  );
  const mallaSnap = await getDoc(mallaRef);
  if (!mallaSnap.exists()) {
    console.log("[empleados.service] sin malla para el dia:", fecha);
    return { ok: false, sinTurno: true };
  }
  const mallaData = mallaSnap.data() as any;
  const turnoId = mallaData?.turno;
  if (!turnoId) {
    console.log("[empleados.service] malla no tiene turnoId:", mallaData);
    return { ok: false, sinTurno: true };
  }

  // 3) Verificar si ya existe jornada hoy: buscamos en usuarios/{userId}/jornadas con docId = fecha (si usan ese esquema)
  // En tu implementación usar addDoc -> autoId, por seguridad checamos por consulta por campo fecha.
  // Para simplificar y evitar consultas grandes, intentamos leer doc con id=fecha (si se usa ese patrón),
  // si no existe, se creará un nuevo doc por crearJornadaCalculada.
  // (Ajusta si tu sistema usa autoId siempre)
  try {
    const posibleRef = doc(db, "usuarios", userId, "jornadas", fecha);
    const posibleSnap = await getDoc(posibleRef);
    if (posibleSnap.exists()) {
      console.log("[empleados.service] ya existe jornada con id=fecha:", fecha);
      return {
        ok: false,
        yaIniciada: true,
        jornadaId: posibleSnap.id,
        data: posibleSnap.data(),
      };
    }
  } catch (err) {
    // si falla por permisos o no usas docId=fecha, no bloqueamos; seguiremos y dejar crearJornadaCalculada ocuparse.
    console.warn(
      "[empleados.service] check jornada por fecha pudo fallar (se ignora):",
      err
    );
  }

  // 4) Intentar obtener ubicacion en frontend
  // 4) Intentar obtener ubicacion en frontend
  console.log("[empleados.service] Obteniendo ubicación del frontend...");

  const ubicacion = await obtenerUbicacionFrontend();

  console.log("[empleados.service] Resultado de ubicación:", ubicacion);

  if (!ubicacion) {
    console.log(
      "[empleados.service] ❌ No se obtuvo ubicación (el usuario no dio permisos o falló)"
    );
    return { ok: false, requiereUbicacion: true };
  }

  // 5) Crear jornada (llamamos tu función que calcula y guarda la jornada)
  // crearJornadaCalculada espera { empleado, fecha, turnoId } — NO le pasamos ubicacion
  try {
    const jornadaId = await crearJornadaCalculada({
      empleado,
      fecha,
      turnoId,
    });

    console.log("[empleados.service] jornada creada, id:", jornadaId);
    console.log(
      "[empleados.service] ✅ Jornada creada con ubicación:",
      ubicacion
    );

    // 6) Actualizar el documento para añadir 'ubicacion'
    // Ruta: usuarios/{userId}/jornadas/{jornadaId} (crearJornadaCalculada usa addDoc en subcolección)
    try {
      const jornadaRef = doc(db, "usuarios", userId, "jornadas", jornadaId);
      await updateDoc(jornadaRef, { ubicacion });
      console.log(
        "[empleados.service] ubicacion guardada en jornada:",
        ubicacion
      );
    } catch (err) {
      console.error(
        "[empleados.service] no se pudo guardar ubicacion en jornada:",
        err
      );
      // No consideramos esto fatal: la jornada quedó creada, pero sin ubicacion.
      return { ok: true, jornadaId, warning: "ubicacion_no_guardada" };
    }

    return { ok: true, jornadaId };
  } catch (err) {
    console.error("[empleados.service] crearJornadaCalculada error:", err);
    return { ok: false, error: "crear_fallo", detail: err };
  }
}
