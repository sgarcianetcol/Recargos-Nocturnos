import { db, storage } from "@/lib/firebase";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  collection,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getStorage } from "firebase/storage";
import type { Empleado } from "@/models/usuarios.model";

export interface JornadaActiva {
  id: string;
  userId: string;
  fecha: string;
  turnoId: string;
  horaInicio: Date | null;
  ubicacionInicio?: { lat: number; lng: number };
  fotoInicioUrl?: string;
  estado: "activa" | "finalizada";
  horaFin?: Date | null;
  ubicacionFin?: { lat: number; lng: number };
  fotoFinUrl?: string;
}

/**
 * Obtiene la ubicación actual del dispositivo
 */
export async function obtenerUbicacionActual(): Promise<{
  lat: number;
  lng: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalización no soportada"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        reject(new Error(`Error obteniendo ubicación: ${error.message}`));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutos
      }
    );
  });
}

/**
 * Convierte archivo de imagen a blob
 */
export function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Captura foto desde la cámara
 */
export async function capturarFoto(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment"; // Usa cámara trasera si está disponible

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error("No se seleccionó ninguna imagen"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => reject(new Error("Error leyendo la imagen"));
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

/**
 * Sube imagen a Firebase Storage
 */
export async function subirImagenAFirebase(
  dataURL: string,
  userId: string,
  tipo: "inicio" | "fin",
  fecha: string
): Promise<string> {
  const blob = dataURLToBlob(dataURL);
  const timestamp = Date.now();
  const fileName = `jornadas/${userId}/${fecha}_${tipo}_${timestamp}.jpg`;
  const storageRef = ref(storage, fileName);

  await uploadBytes(storageRef, blob);
  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}

/**
 * Inicia una jornada laboral con foto y ubicación
 */
export async function iniciarJornada(
  empleado: Empleado,
  turnoId: string,
  fotoDataURL: string
): Promise<string> {
  try {
    // Verificar si ya hay una jornada activa
    const jornadaActiva = await obtenerJornadaActiva(empleado.id);
    if (jornadaActiva) {
      throw new Error("Ya tienes una jornada activa");
    }

    // Verificar si ya hay una jornada para el día actual (activa o finalizada)
    const fechaHoy = new Date().toISOString().split("T")[0];
    const jornadasRef = collection(db, "jornadas_activas");
    const querySnapshot = await getDocs(jornadasRef);

    for (const doc of querySnapshot.docs) {
      const jornada = doc.data() as JornadaActiva;
      if (jornada.userId === empleado.id && jornada.fecha === fechaHoy) {
        throw new Error("Ya has iniciado una jornada para hoy");
      }
    }

    // Obtener ubicación
    const ubicacion = await obtenerUbicacionActual();

    // Subir foto a Firebase Storage
    const fotoUrl = await subirImagenAFirebase(
      fotoDataURL,
      empleado.id,
      "inicio",
      fechaHoy
    );

    // Crear documento de jornada
    const jornadaId = `${empleado.id}_${fechaHoy}_${Date.now()}`;
    const jornadaRef = doc(db, "jornadas_activas", jornadaId);

    const jornadaData: JornadaActiva = {
      id: jornadaId,
      userId: empleado.id,
      fecha: fechaHoy,
      turnoId,
      horaInicio: new Date(),
      ubicacionInicio: ubicacion,
      fotoInicioUrl: fotoUrl,
      estado: "activa",
    };

    await setDoc(jornadaRef, {
      ...jornadaData,
      horaInicio: serverTimestamp(),
    });

    return jornadaId;
  } catch (error) {
    console.error("Error iniciando jornada:", error);
    throw error;
  }
}

/**
 * Finaliza una jornada laboral con foto y ubicación
 */
export async function finalizarJornada(
  jornadaId: string,
  fotoDataURL: string
): Promise<void> {
  try {
    const jornadaRef = doc(db, "jornadas_activas", jornadaId);
    const jornadaSnap = await getDoc(jornadaRef);

    if (!jornadaSnap.exists()) {
      throw new Error("Jornada no encontrada");
    }

    const jornada = jornadaSnap.data() as JornadaActiva;
    if (jornada.estado === "finalizada") {
      throw new Error("La jornada ya está finalizada");
    }

    // Obtener ubicación final
    const ubicacionFin = await obtenerUbicacionActual();

    // Subir foto final
    const fotoFinUrl = await subirImagenAFirebase(
      fotoDataURL,
      jornada.userId,
      "fin",
      jornada.fecha
    );

    // Actualizar jornada activa
    await updateDoc(jornadaRef, {
      estado: "finalizada",
      horaFin: serverTimestamp(),
      ubicacionFin,
      fotoFinUrl,
    });

    // Crear jornada calculada en Firestore (usando el servicio existente)
    // Esto se hará después de actualizar el servicio jornada.service.ts
  } catch (error) {
    console.error("Error finalizando jornada:", error);
    throw error;
  }
}

/**
 * Obtiene la jornada activa de un usuario
 */
export async function obtenerJornadaActiva(
  userId: string
): Promise<JornadaActiva | null> {
  try {
    const jornadasRef = collection(db, "jornadas_activas");
    // Nota: En una implementación real, usaríamos una query con where
    // Por simplicidad, asumimos que solo hay una jornada activa por usuario
    const querySnapshot = await getDocs(jornadasRef);

    for (const doc of querySnapshot.docs) {
      const jornada = doc.data() as JornadaActiva;
      if (jornada.userId === userId && jornada.estado === "activa") {
        return jornada;
      }
    }

    return null;
  } catch (error) {
    console.error("Error obteniendo jornada activa:", error);
    return null;
  }
}

/**
 * Lista todas las jornadas activas (para admin)
 */
export async function listarJornadasActivas(): Promise<JornadaActiva[]> {
  try {
    const jornadasRef = collection(db, "jornadas_activas");
    const querySnapshot = await getDocs(jornadasRef);

    const jornadas: JornadaActiva[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;

      if (data.estado === "activa") {
        jornadas.push({
          ...data,
          horaInicio: data.horaInicio?.toDate() ?? null,
          horaFin: data.horaFin?.toDate() ?? null,
        });
      }
    });

    return jornadas;
  } catch (error) {
    console.error("Error listando jornadas activas:", error);
    return [];
  }
}

/**
 * Lista todas las jornadas (activas y finalizadas) para historial
 */
export async function listarTodasLasJornadas(): Promise<JornadaActiva[]> {
  try {
    const jornadasRef = collection(db, "jornadas_activas");
    const querySnapshot = await getDocs(jornadasRef);

    const jornadas: JornadaActiva[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data() as any;

      jornadas.push({
        ...data,
        horaInicio: data.horaInicio?.toDate() ?? null,
        horaFin: data.horaFin?.toDate() ?? null,
      });
    });

    // Ordenar por fecha descendente (más recientes primero)
    return jornadas.sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );
  } catch (error) {
    console.error("Error listando todas las jornadas:", error);
    return [];
  }
}
