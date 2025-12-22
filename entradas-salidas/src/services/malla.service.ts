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
import {
  crearJornadaCalculada,
  eliminarJornada,
  calcularExtrasSemanales,
  } from "@/services/jornada.service";
import { TurnosService } from "@/services/turnos.service";
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

  static async getMallaRango(
    userId: string,
    fechaInicio: string,
    fechaFin: string
  ) {
    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    const startYear = inicio.getFullYear();
    const startMonth = inicio.getMonth();
    const endYear = fin.getFullYear();
    const endMonth = fin.getMonth();

    const results: unknown[] = [];

    for (let year = startYear; year <= endYear; year++) {
      const monthStart = year === startYear ? startMonth : 0;
      const monthEnd = year === endYear ? endMonth : 11;

      for (let month = monthStart; month <= monthEnd; month++) {
        const mm = String(month + 1).padStart(2, "0");
        const monthId = `${year}_${mm}`;

        const diasRef = collection(
          db,
          "usuarios",
          userId,
          "malla",
          monthId,
          "dias"
        );
        const snapshot = await getDocs(diasRef);

        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.fecha >= fechaInicio && data.fecha <= fechaFin) {
            results.push({ id: doc.id, ...data });
          }
        });
      }
    }

    return results;
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
            userId: row.uid,
            updatedAt: Timestamp.now(),
          },
          { merge: true }
        );

        ops++;
        totalWrites++;

        if (ops >= 500) {
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

      if (ops >= 500) {
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

    // Recalcular jornadas para los días cambiados
    for (const cell of changedCells) {
      const fecha = `${year}-${String(monthIndex + 1).padStart(
        2,
        "0"
      )}-${String(cell.day).padStart(2, "0")}`;
      await MallaService.recalculateJornadaForDay(
        row.uid,
        fecha,
        cell.turnoId ?? cell.turno
      );
    }

    console.log(
      `📌 Total de escrituras realizadas para el día: ${totalWrites}`
    );
    return totalWrites;
  }

  /**
   * Guarda un día específico de un empleado (para edición individual)
   */
  static async saveEmployeeDay(params: {
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
        fuente: "individual_edit",
        nombre: row.nombre,
        documento: row.documento ?? null,
        userId: row.uid,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Recalcular jornada para este día
    await MallaService.recalculateJornadaForDay(
      row.uid,
      `${year}-${mm}-${dd}`,
      cell.turnoId ?? cell.turno
    );

    console.log(`📌 Día ${day} guardado para ${row.nombre}`);
    return 1;
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
        userId: row.uid,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    // Recalcular jornada para este día
    await MallaService.recalculateJornadaForDay(
      row.uid,
      `${year}-${mm}-${dd}`,
      cell.turnoId ?? cell.turno
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

    // ✅ CALCULAR EXTRAS SEMANALES PRIMERO
    const extrasMap = await calcularExtrasSemanales(
      empleado,
      year,
      monthIndex,
      row.cells
    );

    for (const cell of row.cells) {
      if (!cell.turno) continue;

      // Construir fecha
      const fecha = `${year}-${String(monthIndex + 1).padStart(
        2,
        "0"
      )}-${String(cell.day).padStart(2, "0")}`;

      // Eliminar jornada existente si hay
      const jornadaQuery = query(
        collection(db, "usuarios", row.uid, "jornadas"),
        where("fecha", "==", fecha)
      );
      const jornadaSnap = await getDocs(jornadaQuery);

      if (!jornadaSnap.empty) {
        for (const docSnap of jornadaSnap.docs) {
          await eliminarJornada(row.uid, docSnap.id);
        }
      }

      try {
        // ✅ OBTENER TURNO Y CALCULAR HORA DE SALIDA CON EXTRAS
        const turno = await TurnosService.obtener(cell.turno);
        let horaSalida = turno?.horaSalida || "17:00";

        // Si hay extras para este día, ajustar hora de salida
        const horasExtras = extrasMap[fecha] || 0;
        if (horasExtras > 0) {
          const [hora, min] = horaSalida.split(":").map(Number);
          const totalMin = hora * 60 + min + horasExtras * 60;
          const nuevaHora = Math.floor(totalMin / 60) % 24;
          const nuevoMin = totalMin % 60;
          horaSalida = `${String(nuevaHora).padStart(2, "0")}:${String(
            nuevoMin
          ).padStart(2, "0")}`;
        }

        // ✅ CREAR JORNADA CON HORA DE SALIDA AJUSTADA
        await crearJornadaCalculada({
          empleado,
          fecha,
          turnoId: cell.turno === "D" ? "D" : cell.turno,
          jornadaReal: horasExtras > 0 ? {
            horaSalida: new Date(`${fecha}T${horaSalida}`)
          } : undefined
        });

        totalJornadas++;
        console.log(`✅ Jornada creada para ${row.nombre} en ${fecha}${horasExtras > 0 ? ` (con ${horasExtras}h extras)` : ""}`);
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

  /**
   * Recalcula la jornada para un día específico de un empleado
   */
  static async recalculateJornadaForDay(
    userId: string,
    fecha: string,
    turnoId: string
  ) {
    try {
      // Primero eliminar TODAS las jornadas existentes para esa fecha
      const jornadaQuery = query(
        collection(db, "usuarios", userId, "jornadas"),
        where("fecha", "==", fecha)
      );
      const jornadaSnap = await getDocs(jornadaQuery);

      if (!jornadaSnap.empty) {
        for (const docSnap of jornadaSnap.docs) {
          await eliminarJornada(userId, docSnap.id);
        }
        console.log(
          `🗑️ ${jornadaSnap.docs.length} jornadas eliminadas para ${userId} en ${fecha}`
        );
      }

      // Obtener datos del empleado
      const empleado = await EmpleadoService.obtener(userId);
      if (!empleado) {
        console.warn(`⚠️ Empleado ${userId} no encontrado`);
        return;
      }

      // Crear nueva jornada con el turno actualizado
      await crearJornadaCalculada({
        empleado,
        fecha,
        turnoId,
      });

      console.log(
        `✅ Jornada recalculada para ${userId} en ${fecha} con turno ${turnoId}`
      );
    } catch (error) {
      console.error(
        `❌ Error recalculando jornada para ${userId} en ${fecha}:`,
        error
      );
    }
  }
}
