 import { db } from "@/lib/firebase";
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  limit,
  getDoc,
  doc,
} from "firebase/firestore";
import type { Empleado } from "@/models/usuarios.model";

export interface DashboardStats {
  empleadosActivos: number;
  horasProgramadasHoy: number;
  turnosAsignadosHoy: number;
  empleadosConTurnoHoy: number;
  turnosNocturnosHoy: number;
  capacidadSistema: number;
  cumplimientoProgramacion: number;
}

/**
 * Obtiene estadísticas del dashboard basadas en la programación de mallas
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    // 1. Empleados activos
    const empleadosQuery = query(
      collection(db, "usuarios"),
      where("activo", "==", true)
    );
    const empleadosSnap = await getDocs(empleadosQuery);
    const empleados = empleadosSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as Empleado)
    );
    const empleadosActivos = empleados.length;

    let horasProgramadasHoy = 0;
    let turnosAsignadosHoy = 0;
    let empleadosConTurnoHoy = 0;
    let turnosNocturnosHoy = 0;

    // 2. Procesar mallas de hoy para cada empleado
    for (const empleado of empleados) {
      try {
        const [yyyy, mm, dd] = hoy.split("-");
        const mallaRef = doc(
          db,
          "usuarios",
          empleado.id,
          "malla",
          `${yyyy}_${mm}`,
          "dias",
          dd
        );

        const mallaSnap = await getDoc(mallaRef);
        if (mallaSnap.exists()) {
          const mallaData = mallaSnap.data();
          const turnoId = mallaData?.turno;

          if (turnoId) {
            empleadosConTurnoHoy++;
            turnosAsignadosHoy++;

            // Obtener detalles del turno
            const turnoRef = doc(db, "turnos", turnoId);
            const turnoSnap = await getDoc(turnoRef);

            if (turnoSnap.exists()) {
              const turno = turnoSnap.data();

              // Calcular horas del turno
              const horaEntrada = turno.horaEntrada || "08:00";
              const horaSalida = turno.horaSalida || "17:00";

              const [entradaHoras, entradaMin] = horaEntrada
                .split(":")
                .map(Number);
              const [salidaHoras, salidaMin] = horaSalida
                .split(":")
                .map(Number);

              let horasTurno =
                salidaHoras - entradaHoras + (salidaMin - entradaMin) / 60;

              // Si cruza medianoche, ajustar cálculo
              if (
                turno.horaSalida &&
                turno.horaEntrada &&
                turno.horaSalida <= turno.horaEntrada
              ) {
                horasTurno =
                  24 -
                  entradaHoras +
                  salidaHoras +
                  (salidaMin - entradaMin) / 60;
              }

              horasProgramadasHoy += horasTurno;

              // Verificar si es turno nocturno (basado en configuración)
              // Por defecto, turnos que empiecen después de las 6 PM o terminen después de medianoche
              const horaInicio = entradaHoras + entradaMin / 60;
              const horaFin = salidaHoras + salidaMin / 60;

              if (
                horaInicio >= 18 ||
                horaFin >= 24 ||
                turno.horaSalida <= turno.horaEntrada
              ) {
                turnosNocturnosHoy++;
              }
            }
          }
        }
      } catch (error) {
        console.warn(
          `Error procesando malla para empleado ${empleado.id}:`,
          error
        );
      }
    }

    // 3. Calcular métricas adicionales
    const capacidadSistema =
      empleadosActivos > 0
        ? (empleadosConTurnoHoy / empleadosActivos) * 100
        : 0;
    const cumplimientoProgramacion = turnosAsignadosHoy > 0 ? 100 : 0; // Asumimos 100% si hay turnos asignados

    return {
      empleadosActivos,
      horasProgramadasHoy: Math.round(horasProgramadasHoy * 100) / 100,
      turnosAsignadosHoy,
      empleadosConTurnoHoy,
      turnosNocturnosHoy,
      capacidadSistema: Math.round(capacidadSistema * 100) / 100,
      cumplimientoProgramacion:
        Math.round(cumplimientoProgramacion * 100) / 100,
    };
  } catch (error) {
    console.error("Error obteniendo estadísticas del dashboard:", error);
    // Valores por defecto en caso de error
    return {
      empleadosActivos: 0,
      horasProgramadasHoy: 0,
      turnosAsignadosHoy: 0,
      empleadosConTurnoHoy: 0,
      turnosNocturnosHoy: 0,
      capacidadSistema: 0,
      cumplimientoProgramacion: 0,
    };
  }
}

/**
 * Obtiene actividad reciente del sistema (empleados que han registrado entradas hoy)
 */
export async function getActividadReciente(limite: number = 5): Promise<any[]> {
  try {
    const hoy = new Date().toISOString().slice(0, 10);

    // Buscar jornadas de hoy sin ordenar para evitar índice compuesto
    const jornadasQuery = query(
      collectionGroup(db, "jornadas"),
      where("fecha", "==", hoy),
      limit(limite * 3) // obtener más para procesar
    );

    const snap = await getDocs(jornadasQuery);
    const actividades: any[] = [];

    // Obtener nombres de usuarios
    const userIds = new Set<string>();
    snap.forEach((doc) => {
      const jornada = doc.data();
      userIds.add(jornada.userId);
    });

    const nombresMap: Record<string, string> = {};
    for (const userId of userIds) {
      try {
        const userDoc = await getDoc(doc(db, "usuarios", userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          nombresMap[userId] = userData?.nombre || userId;
        }
      } catch (err) {
        console.warn(`No se pudo obtener nombre para usuario ${userId}:`, err);
        nombresMap[userId] = userId;
      }
    }

    snap.forEach((doc) => {
      const jornada = doc.data();
      const nombre = nombresMap[jornada.userId] || jornada.userId;

      actividades.push({
        id: doc.id,
        tipo: "jornada_iniciada",
        mensaje: `${nombre} registró entrada`,
        timestamp: jornada.creadoEn,
        userId: jornada.userId,
      });

      // Si tiene finalizadoEn, agregar salida
      if (jornada.finalizadoEn) {
        actividades.push({
          id: `${doc.id}_fin`,
          tipo: "jornada_finalizada",
          mensaje: `${nombre} completó turno`,
          timestamp: jornada.finalizadoEn,
          userId: jornada.userId,
        });
      }
    });

    // Ordenar por timestamp descendente y limitar
    return actividades
      .sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp);
        const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp);
        return timeB.getTime() - timeA.getTime();
      })
      .slice(0, limite);
  } catch (error) {
    console.error("Error obteniendo actividad reciente:", error);
    return [];
  }
}
