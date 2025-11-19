import { db } from "@/lib/firebase";
import {
  writeBatch,
  doc,
  Timestamp,
  setDoc,
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { getDoc } from "firebase/firestore";
import { EmpleadoService } from "@/services/usuariosService";
import { crearJornadaCalculada } from "@/services/jornada.service";

export interface PreviewCell {
  day: number;
  turno: string | null;
  turnoId: string;
  changed?: boolean;
}

export interface PreviewRow {
  idx: number;
  nombre: string;
  documento?: string;
  uid: string | null;
  cells: PreviewCell[];
  estado: "pendiente" | "listo" | "sin-usuario" | "corregido";
  hasChanges?: boolean;
}

export class MallaService {
  static async getTurnoDelDia(userId: string, fecha: Date) {
    if (!userId || !fecha) return null;

    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, "0");
    const day = String(fecha.getDate()).padStart(2, "0");

    const ref = doc(
      db,
      "usuarios",
      userId,
      "malla",
      `${year}_${month}`,
      "dias",
      day
    );
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      console.warn(
        `⚠ No se encontró malla para ${userId} en ${year}-${month}-${day}`
      );
      return null;
    }

    const data = snap.data();
    return {
      turno: data.turno || null,
      fecha: data.fecha,
      nombre: data.nombre,
    };
  }
  /**
   * Guarda un mes específico para todos los empleados que tengan UID asignado
   */
  static async saveMonth(params: {
    previewRows: PreviewRow[];
    year: number;
    monthIndex: number;
  }) {
    const { previewRows, year, monthIndex } = params;

    if (!previewRows || previewRows.length === 0) {
      throw new Error("No hay datos para guardar.");
    }

    let totalWrites = 0;
    let batch = writeBatch(db);
    let ops = 0;

    for (const row of previewRows) {
      if (!row.uid) continue;

      for (const cell of row.cells) {
        if (!cell.turno && !cell.turnoId) continue;

        const mm = String(monthIndex + 1).padStart(2, "0");
        const dd = String(cell.day).padStart(2, "0");

        const monthId = `${year}_${mm}`;
        const dayId = dd;

        const ref = doc(
          db,
          "usuarios",
          row.uid,
          "malla",
          monthId,
          "dias",
          dayId
        );

        batch.set(
          ref,
          {
            turno: cell.turnoId ?? cell.turno,
            fecha: `${year}-${mm}-${dd}`,
            fuente: "import_excel",
            nombre: row.nombre,
            documento: row.documento ?? null,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        ops++;
        totalWrites++;

        if (ops >= 450) {
          await batch.commit();
          console.log(`✅ Batch parcial ejecutado (${ops} operaciones)`);
          batch = writeBatch(db);
          ops = 0;
        }
      }
    }

    if (ops > 0) {
      await batch.commit();
      console.log(`✅ Último batch ejecutado (${ops} operaciones)`);
    }

    console.log(`📌 Total de escrituras realizadas: ${totalWrites}`);
    return totalWrites;
  }

  /**
   * Guarda solo los días cambiados de una fila específica
   */
  static async saveDay(params: {
    row: PreviewRow;
    year: number;
    monthIndex: number;
  }) {
    const { row, year, monthIndex } = params;

    if (!row.uid) {
      throw new Error("La fila no tiene UID asignado.");
    }

    const changedCells = row.cells.filter((c) => c.changed);

    if (changedCells.length === 0) {
      throw new Error("No hay cambios para guardar.");
    }

    let totalWrites = 0;
    let batch = writeBatch(db);
    let ops = 0;

    for (const cell of changedCells) {
      const mm = String(monthIndex + 1).padStart(2, "0");
      const dd = String(cell.day).padStart(2, "0");

      const monthId = `${year}_${mm}`;
      const dayId = dd;

      const ref = doc(db, "usuarios", row.uid, "malla", monthId, "dias", dayId);

      batch.set(
        ref,
        {
          turno: cell.turnoId ?? cell.turno,
          fecha: `${year}-${mm}-${dd}`,
          fuente: "manual_edit",
          nombre: row.nombre,
          documento: row.documento ?? null,
          updatedAt: Timestamp.now(),
        },
        { merge: true }
      );

      ops++;
      totalWrites++;

      if (ops >= 450) {
        await batch.commit();
        console.log(`✅ Batch parcial ejecutado (${ops} operaciones)`);
        batch = writeBatch(db);
        ops = 0;
      }
    }

    if (ops > 0) {
      await batch.commit();
      console.log(`✅ Último batch ejecutado (${ops} operaciones)`);
    }

    console.log(
      `📌 Total de escrituras realizadas para el día: ${totalWrites}`
    );
    return totalWrites;
  }

  /**
   * Guarda un día específico de una fila
   */
  static async saveSingleDay(params: {
    row: PreviewRow;
    year: number;
    monthIndex: number;
    day: number;
  }) {
    const { row, year, monthIndex, day } = params;

    if (!row.uid) {
      throw new Error("La fila no tiene UID asignado.");
    }

    const cell = row.cells.find((c) => c.day === day);
    if (!cell) {
      throw new Error("Día no encontrado en la fila.");
    }

    const mm = String(monthIndex + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");

    const monthId = `${year}_${mm}`;
    const dayId = dd;

    const ref = doc(db, "usuarios", row.uid, "malla", monthId, "dias", dayId);

    await setDoc(
      ref,
      {
        turno: cell.turnoId ?? cell.turno,
        fecha: `${year}-${mm}-${dd}`,
        fuente: "manual_edit",
        nombre: row.nombre,
        documento: row.documento ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    console.log(`📌 Día ${day} guardado para ${row.nombre}`);
    return 1;
  }

  /**
   * Obtiene la malla mensual para un usuario específico
   */
  static async getMallaMensual(uid: string, year: number, month: number) {
    if (!uid) {
      throw new Error("UID es requerido");
    }

    const mm = String(month + 1).padStart(2, "0");
    const monthId = `${year}_${mm}`;

    const diasRef = collection(db, "usuarios", uid, "malla", monthId, "dias");

    const snapshot = await getDocs(diasRef);

    const malla: { dia: number; turno: string | null }[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      const dia = parseInt(doc.id);
      malla.push({
        dia,
        turno: data.turno || null,
      });
    });

    // Ordenar por día
    malla.sort((a, b) => a.dia - b.dia);

    return malla;
  }

  /**
   * Calcula jornadas para un mes específico
   */
  static async calculateJornadasForMonth(params: {
    previewRows: PreviewRow[];
    year: number;
    monthIndex: number;
  }) {
    const { previewRows, year, monthIndex } = params;

    console.log(`🧮 Calculando jornadas para mes ${monthIndex + 1}...`);

    let totalJornadas = 0;

    for (const row of previewRows) {
      if (!row.uid) continue;

      // Obtener datos del empleado
      const empleado = await EmpleadoService.obtener(row.uid);
      if (!empleado) {
        console.warn(`⚠️ Empleado ${row.uid} no encontrado`);
        continue;
      }

      for (const cell of row.cells) {
        if (!cell.turno || cell.turno === "D") continue; // Solo calcular si hay turno asignado

        // Construir fecha
        const fecha = `${year}-${String(monthIndex + 1).padStart(
          2,
          "0"
        )}-${String(cell.day).padStart(2, "0")}`;

        // Verificar si jornada ya existe
        const jornadaQuery = query(
          collection(db, "usuarios", row.uid, "jornadas"),
          where("fecha", "==", fecha)
        );
        const jornadaSnap = await getDocs(jornadaQuery);

        if (!jornadaSnap.empty) {
          console.log(`⏭️ Jornada ya existe para ${row.nombre} en ${fecha}`);
          continue;
        }

        try {
          // Crear jornada calculada
          await crearJornadaCalculada({
            empleado,
            fecha,
            turnoId: cell.turno,
          });
          totalJornadas++;
          console.log(`✅ Jornada creada para ${row.nombre} en ${fecha}`);
        } catch (error) {
          console.error(
            `❌ Error creando jornada para ${row.nombre} en ${fecha}:`,
            error
          );
        }
      }
    }

    console.log(
      `🎉 Cálculo de jornadas completado: ${totalJornadas} jornadas creadas`
    );
    return totalJornadas;
  }

  /**
   * Guarda los 12 meses del año completo
   * Se le pasa un builder que retorna los rows para cada mes
   */
  static async saveAllMonths(params: {
    year: number;
    buildRowsForMonth: (monthIndex: number) => Promise<PreviewRow[]>;
  }) {
    const { year, buildRowsForMonth } = params;

    let total = 0;

    for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
      console.log(`📌 Procesando mes ${monthIndex + 1} ...`);

      const previewRows = await buildRowsForMonth(monthIndex);
      if (!previewRows.length) {
        console.warn(`⚠ Mes ${monthIndex + 1}: no hay datos.`);
        continue;
      }

      const ops = await MallaService.saveMonth({
        previewRows,
        year,
        monthIndex,
      });
      console.log(`✅ Mes ${monthIndex + 1} guardado: ${ops} operaciones`);

      // Calcular jornadas después de guardar malla
      await MallaService.calculateJornadasForMonth({
        previewRows,
        year,
        monthIndex,
      });

      total += ops;
    }

    console.log(`🎉 Guardado TOTAL completado: ${total} operaciones`);
    return total;
  }
}
