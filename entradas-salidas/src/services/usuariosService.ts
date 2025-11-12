// src/services/usuariosService.ts
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  DocumentData,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import type { Empleado } from "@/models/usuarios.model";

/* ===========================
   Utils
=========================== */
function omitUndefined<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function mapDocToEmpleado(d: DocumentData, id: string): Empleado {
  return {
    id,
    nombre: d.nombre ?? "",
    correo: d.correo ?? "",
    rol: d.rol ?? "empleado",
    activo: Boolean(d.activo),
    salarioBaseMensual: Number(d.salarioBaseMensual ?? 0),
    documento: d.documento ?? undefined,
    area: d.area ?? undefined,
    empresa: d.empresa ?? "NETCOL",
    proyectos: Array.isArray(d.proyectos)
      ? (d.proyectos as string[])
      : undefined,
    creadoEn: d.creadoEn?.toDate
      ? d.creadoEn.toDate()
      : d.creadoEn ?? new Date(),
  };
}

/* ===========================
   Firestore Ref
=========================== */
const colRef = collection(db, "usuarios");

/* ===========================
   NUEVO: Crear empleado con acceso y envío de correo
=========================== */
export async function crearEmpleadoConAcceso(
  data: Omit<Empleado, "id" | "creadoEn">
) {
  const auth = getAuth();

  if (!data.correo || !data.nombre) {
    throw new Error("Faltan campos obligatorios: nombre / correo.");
  }
  if (!data.salarioBaseMensual || Number(data.salarioBaseMensual) <= 0) {
    throw new Error("El salario debe ser mayor a 0.");
  }

  // 🔐 Contraseña temporal aleatoria
  const tempPassword = Math.random().toString(36).slice(-12);

  // 1. Crear usuario en Firebase Auth
  const userCred = await createUserWithEmailAndPassword(
    auth,
    data.correo,
    tempPassword
  );
  const uid = userCred.user.uid;

  // 2. Guardar en Firestore con mismo UID
  await setDoc(doc(db, "usuarios", uid), {
    ...data,
    activo: true,
    creadoEn: serverTimestamp(),
  });

  // 3. Enviar correo para que defina su propia contraseña
  await sendPasswordResetEmail(auth, data.correo);

  return uid;
}

/* ===========================
   Obtener datos del usuario logueado (para login)
=========================== */
export async function getUserData(uid: string): Promise<Empleado | null> {
  const snap = await getDoc(doc(colRef, uid));
  if (!snap.exists()) return null;
  return mapDocToEmpleado(snap.data(), snap.id);
}

export async function getUsuarios(): Promise<Empleado[]> {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => mapDocToEmpleado(d.data(), d.id));
}

export async function toggleRecargos(userId: string, activo: boolean) {
  const ref = doc(db, "usuarios", userId);
  await updateDoc(ref, { recargosActivos: activo });
}

/* ===========================
   CRUD original
=========================== */
export const EmpleadoService = {
  async listar(opts?: {
    empresa?: Empleado["empresa"];
    soloActivos?: boolean;
    limite?: number;
    ordenarPorNombre?: boolean;
  }): Promise<Empleado[]> {
    const clauses = [];
    if (opts?.empresa) clauses.push(where("empresa", "==", opts.empresa));
    if (opts?.soloActivos) clauses.push(where("activo", "==", true));
    if (opts?.ordenarPorNombre) clauses.push(orderBy("nombre"));
    if (opts?.limite) clauses.push(limit(opts.limite));

    const snap = clauses.length
      ? await getDocs(query(colRef, ...clauses))
      : await getDocs(colRef);

    return snap.docs.map((docSnap) =>
      mapDocToEmpleado(docSnap.data(), docSnap.id)
    );
  },

  async obtener(id: string): Promise<Empleado | null> {
    const snap = await getDoc(doc(colRef, id));
    if (!snap.exists()) return null;
    return mapDocToEmpleado(snap.data(), snap.id);
  },

  async crear(data: Omit<Empleado, "id" | "creadoEn">): Promise<string> {
    if (
      data.salarioBaseMensual == null ||
      Number(data.salarioBaseMensual) <= 0
    ) {
      throw new Error("salarioBaseMensual debe ser un número > 0");
    }
    if (!data.nombre || !data.correo) {
      throw new Error("Faltan campos obligatorios: nombre/correo.");
    }

    const ref = doc(colRef);
    const payload = omitUndefined({
      ...data,
      salarioBaseMensual: Number(data.salarioBaseMensual),
      activo: data.activo ?? true,
      creadoEn: serverTimestamp(),
    });
    await setDoc(ref, payload);
    return ref.id;
  },

  async actualizar(id: string, parciales: Partial<Empleado>): Promise<void> {
    const payload: Record<string, any> = { ...parciales };

    if ("salarioBaseMensual" in payload) {
      const raw = payload.salarioBaseMensual as any;
      if (raw === "" || raw === null || raw === undefined) {
        delete payload.salarioBaseMensual;
      } else {
        const v = Number(raw);
        if (!Number.isFinite(v) || v <= 0) {
          delete payload.salarioBaseMensual;
        } else {
          payload.salarioBaseMensual = v;
        }
      }
    }

    Object.keys(payload).forEach(
      (k) => payload[k] === undefined && delete payload[k]
    );
    await setDoc(doc(colRef, id), payload, { merge: true });
  },

  async eliminar(id: string): Promise<void> {
    await deleteDoc(doc(colRef, id));
  },

  async activar(id: string, activo: boolean): Promise<void> {
    await setDoc(doc(colRef, id), { activo }, { merge: true });
  },

  async setRol(id: string, rol: Empleado["rol"]): Promise<void> {
    await setDoc(doc(colRef, id), { rol }, { merge: true });
  },
  // 🟢 Nueva función para evitar duplicados por documento
  async existePorDocumento(documento: string): Promise<boolean> {
    try {
      const empleadosRef = collection(db, "usuarios");
      const q = query(empleadosRef, where("documento", "==", documento));
      const snapshot = await getDocs(q);
      return !snapshot.empty;
    } catch (error) {
      console.error("Error verificando documento:", error);
      return false;
    }
  },
};
