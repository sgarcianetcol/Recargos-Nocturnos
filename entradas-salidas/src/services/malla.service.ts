import { db } from "@/lib/firebase";
import { writeBatch, doc, Timestamp } from "firebase/firestore";

export interface PreviewCell {
  day: number;
  turno: string | null;
}

export interface PreviewRow {
  idx: number;
  nombre: string;
  documento?: string;
  uid: string | null;
  cells: PreviewCell[];
}

export class MallaService {
  /**
   * Guarda un mes específico para todos los empleados que tengan UID asignado
   */
  static async saveMonth(params: {
    previewRows: PreviewRow[];
    year: number;
    monthIndex: number; // 0..11
  }) {
    const { previewRows, year, monthIndex } = params;

    if (!previewRows || previewRows.length === 0) {
      throw new Error("No hay datos para guardar.");
    }

    let totalWrites = 0;
    let batch = writeBatch(db);
    let ops = 0;

    for (const row of previewRows) {
      if (!row.uid) continue; // sin usuario => no se guarda nada

      for (const cell of row.cells) {
        if (!cell.turno) continue;

        const mm = String(monthIndex + 1).padStart(2, "0");
        const dd = String(cell.day).padStart(2, "0");

        const monthId = `${year}_${mm}`; // ej: 2025_03
        const dayId = dd; // ej: 01..31

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
            turno: cell.turno,
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
      total += ops;
    }

    console.log(`🎉 Guardado TOTAL completado: ${total} operaciones`);
    return total;
  }
}
