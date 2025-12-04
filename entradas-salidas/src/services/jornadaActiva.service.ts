// src/services/jornadas.service.ts

import { db, storage } from "@/lib/firebase";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  collection,
  Timestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import type { Empleado } from "@/models/usuarios.model";

/* ---------------------------------------------
 *  INTERFACES 100% TIPADAS PARA EVITAR "any"
 * --------------------------------------------- */

export interface JornadaFirestore {
  id?: string;
  userId: string;
  fecha: string;
  turnoId: string;
  horaInicio?: Timestamp | null;
  horaFin?: Timestamp | null;
  estado: "activa" | "finalizada";
  ubicacionInicio?: { lat: number; lng: number };
  ubicacionFin?: { lat: number; lng: number };
  fotoInicioUrl?: string;
  fotoFinUrl?: string;
}

export interface JornadaActiva extends JornadaFirestore {
  id: string;
}

/* ---------------------------------------------
 * OBTENER UBICACIÓN ACTUAL
 * --------------------------------------------- */

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
        maximumAge: 300000,
      }
    );
  });
}

/* ---------------------------------------------
 * DATA URL → Blob
 * --------------------------------------------- */
export function dataURLToBlob(dataURL: string): Blob {
  const arr = dataURL.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/jpeg";
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);

  for (let i = 0; i < bstr.length; i++) {
    u8arr[i] = bstr.charCodeAt(i);
  }

  return new Blob([u8arr], { type: mime });
}

/* ---------------------------------------------
 * CAPTURAR FOTO
 * --------------------------------------------- */
export async function capturarFoto(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error("No se seleccionó ninguna imagen"));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Error leyendo la imagen"));
      reader.readAsDataURL(file);
    };

    input.click();
  });
}

/* ---------------------------------------------
 * SUBIR IMAGEN A FIREBASE
 * --------------------------------------------- */
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

  return await getDownloadURL(storageRef);
}

/* ---------------------------------------------
 * INICIAR JORNADA
 * --------------------------------------------- */
export async function iniciarJornada(
  empleado: Empleado,
  turnoId: string,
  fotoDataURL: string
): Promise<string> {
  try {
    // 1. Verificar jornada activa
    const jornadaActiva = await obtenerJornadaActiva(empleado.id);
    if (jornadaActiva) {
      throw new Error("Ya tienes una jornada activa");
    }

    // 2. Verificar si ya hizo jornada hoy
    const hoy = new Date().toISOString().split("T")[0];

    const jornadasRef = collection(db, "jornadas_activas");
    const snap = await getDocs(jornadasRef);

    for (const d of snap.docs) {
      const jornada = d.data() as JornadaFirestore;
      if (jornada.userId === empleado.id && jornada.fecha === hoy) {
        throw new Error("Ya has iniciado una jornada para hoy");
      }
    }

    // 3. Ubicación
    const ubicacion = await obtenerUbicacionActual();

    // 4. Subir foto
    const fotoUrl = await subirImagenAFirebase(
      fotoDataURL,
      empleado.id,
      "inicio",
      hoy
    );

    // 5. Crear registro
    const jornadaId = `${empleado.id}_${hoy}_${Date.now()}`;
    const jornadaRef = doc(db, "jornadas_activas", jornadaId);

    const data: JornadaFirestore = {
      id: jornadaId,
      userId: empleado.id,
      fecha: hoy,
      turnoId,
      estado: "activa",
      ubicacionInicio: ubicacion,
      fotoInicioUrl: fotoUrl,
    };

    await setDoc(jornadaRef, {
      ...data,
      horaInicio: serverTimestamp(),
    });

    return jornadaId;
  } catch (error) {
    console.error("Error iniciando jornada:", error);
    throw error;
  }
}

/* ---------------------------------------------
 * FINALIZAR JORNADA
 * --------------------------------------------- */
export async function finalizarJornada(
  jornadaId: string,
  fotoDataURL: string
): Promise<void> {
  const jornadaRef = doc(db, "jornadas_activas", jornadaId);
  const snap = await getDoc(jornadaRef);

  if (!snap.exists()) throw new Error("Jornada no encontrada");

  const data = snap.data() as JornadaFirestore;

  if (data.estado === "finalizada") {
    throw new Error("La jornada ya está finalizada");
  }

  const ubicacionFin = await obtenerUbicacionActual();

  const fotoFinUrl = await subirImagenAFirebase(
    fotoDataURL,
    data.userId,
    "fin",
    data.fecha
  );

  await updateDoc(jornadaRef, {
    estado: "finalizada",
    horaFin: serverTimestamp(),
    ubicacionFin,
    fotoFinUrl,
  });
}

/* ---------------------------------------------
 * OBTENER JORNADA ACTIVA DE UN USUARIO
 * --------------------------------------------- */
export async function obtenerJornadaActiva(
  userId: string
): Promise<JornadaActiva | null> {
  const refCol = collection(db, "jornadas_activas");
  const snap = await getDocs(refCol);

  for (const d of snap.docs) {
    const data = d.data() as JornadaFirestore;

    if (data.userId === userId && data.estado === "activa") {
      return {
        ...data,
        id: d.id,
      } as JornadaActiva;
    }
  }

  return null;
}

/* ---------------------------------------------
 * LISTAR SOLO JORNADAS ACTIVAS (ADMIN)
 * --------------------------------------------- */
export async function listarJornadasActivas(): Promise<JornadaActiva[]> {
  const refCol = collection(db, "jornadas_activas");
  const snap = await getDocs(refCol);

  const list: JornadaActiva[] = [];

  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as JornadaFirestore;

    if (data.estado === "activa") {
      list.push({
        ...data,
        id: docSnap.id,
        horaInicio: data.horaInicio ?? null,
        horaFin: data.horaFin ?? null,
      });
    }
  });

  return list;
}

/* ---------------------------------------------
 * LISTAR TODAS LAS JORNADAS (HISTORIAL)
 * --------------------------------------------- */
export async function listarTodasLasJornadas(): Promise<JornadaActiva[]> {
  const refCol = collection(db, "jornadas_activas");
  const snap = await getDocs(refCol);

  const list: JornadaActiva[] = [];

  snap.docs.forEach((d) => {
    const data = d.data() as JornadaFirestore;

    list.push({
      ...data,
      id: d.id,
      horaInicio: data.horaInicio ?? null,
      horaFin: data.horaFin ?? null,
    });
  });

  return list.sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}
