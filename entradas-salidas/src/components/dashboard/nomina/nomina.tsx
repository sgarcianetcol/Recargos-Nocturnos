"use client";
import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDetalleEmpleado } from "@/services/nomina.service";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";

import { db } from "@/lib/firebase";
import {
  collection,
  Timestamp,
  collectionGroup,
  getDocs,
  orderBy,
  query,
  where,
  getDoc,
  doc,
} from "firebase/firestore";
import { Empresa, JornadaDoc, NominaRow } from "@/models/jornada.model";
import { periodoActual } from "@/utils/periodo";

export default function NominaResumen() {
  const { inicioISO, finISO } = periodoActual();
  const [fechaInicio, setFechaInicio] = React.useState(inicioISO);
  const [fechaFin, setFechaFin] = React.useState(finISO);
  const [empresa, setEmpresa] = React.useState<Empresa | "TODAS">("TODAS");
  const [busqueda, setBusqueda] = React.useState("");
  const [rows, setRows] = React.useState<NominaRow[]>([]);

  // mapear jornadas por usuario
  const clean = (n: number) => (n % 1 === 0 ? Math.round(n) : n);

  const [jornadasPorEmpleado, setJornadasPorEmpleado] = React.useState<
    Record<string, JornadaDoc[]>
  >({});

  const [loading, setLoading] = React.useState(false);
  const [nombres, setNombres] = React.useState<Record<string, string>>({});
  const [detalleEmpleado, setDetalleEmpleado] = React.useState<{
    id: string;
    nombre: string;
  } | null>(null);

  const [modalJornadas, setModalJornadas] = React.useState<JornadaDoc[]>([]);

  //HORAS NORMALES SIN DECIMALES
  function formatHoras(horas: number | undefined) {
    if (horas == null) return "0";
    return Number.isInteger(horas) ? horas.toString() : horas.toFixed(2);
  }

  // Precarga nombres
  React.useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "usuarios"));
      const map: Record<string, string> = {};
      snap.forEach((d) => {
        map[d.id] = (d.data() as any).nombre ?? d.id;
      });
      setNombres(map);
      console.log(`🔹 ${snap.size} usuarios cargados`);
    })();
  }, []);

  // 🔍 Cargar jornadas del empleado seleccionado (modal de detalle)
  React.useEffect(() => {
    if (!detalleEmpleado?.id) return;

    const cargarJornadas = async () => {
      try {
        console.log(
          `⏳ Cargando jornadas de ${detalleEmpleado.nombre} desde ${fechaInicio} hasta ${fechaFin}...`
        );

        const resultado = await getDetalleEmpleado({
          userId: detalleEmpleado.id,
          desdeISO: fechaInicio,
          hastaISO: fechaFin,
        });

        console.log(`✅ ${resultado.length} jornadas encontradas`);

        // 👉 No vuelvas a modificar 'detalleEmpleado' completo, solo guarda las jornadas aparte
        setModalJornadas(resultado);
      } catch (err) {
        console.error("❌ Error cargando jornadas:", err);
      }
    };

    cargarJornadas();
  }, [detalleEmpleado?.id]); // 👈 solo el id, no el objeto entero

  // dentro de tu componente
  const cargar = React.useCallback(async () => {
    setLoading(true);
    try {
      console.log("🔹 Iniciando carga de jornadas/resumen...");
      console.log(`📅 Filtrando de: ${fechaInicio} a ${fechaFin}`);

      const base: any[] = [
        where("fecha", ">=", fechaInicio),
        where("fecha", "<=", fechaFin),
        orderBy("fecha", "asc"),
      ];

      const q =
        empresa === "TODAS"
          ? query(collectionGroup(db, "jornadas"), ...base)
          : query(
              collectionGroup(db, "jornadas"),
              where("empresa", "==", empresa),
              ...base
            );

      const snap = await getDocs(q);
      console.log(`🔹 Total documentos encontrados: ${snap.docs.length}`);

      const list: JornadaDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as JornadaDoc),
      }));

      console.log("📄 Primeras 3 jornadas desde Firestore:", list.slice(0, 3));

      // 🔹 Cargar datos de empleados (para salario y valorHora)
      const empleadosSnap = await getDocs(collection(db, "usuarios"));
      const empleados: Record<string, any> = {};
      empleadosSnap.forEach((doc) => {
        empleados[doc.id] = doc.data();
      });

      console.log("👥 Empleados cargados:", Object.keys(empleados).length);
      console.log("📋 Ejemplo empleado:", Object.entries(empleados)[0]);

      // 🔹 Verificar si algún empleado tiene recargosActivos = false y ajustar jornadas
      for (const jornada of list) {
        const empleado = empleados[jornada.userId];
        if (empleado && empleado.recargosActivos === false) {
          // Si el empleado tiene extras desactivados, forzar extras a 0
          jornada.extrasDiurnas = 0;
          jornada.extrasNocturnas = 0;
          jornada.extrasDiurnasDominical = 0;
          jornada.extrasNocturnasDominical = 0;
          jornada.horasExtras = 0;
          jornada.valorExtrasDiurnas = 0;
          jornada.valorExtrasNocturnas = 0;
          jornada.valorExtrasDiurnasDominical = 0;
          jornada.valorExtrasNocturnasDominical = 0;
          // Recalcular valorTotalDia restando los valores de extras
          jornada.valorTotalDia =
            (jornada.valorTotalDia || 0) -
            (jornada.valorExtrasDiurnas || 0) -
            (jornada.valorExtrasNocturnas || 0) -
            (jornada.valorExtrasDiurnasDominical || 0) -
            (jornada.valorExtrasNocturnasDominical || 0);
        }
      }

      // 🔹 Agrupar por usuario
      const map = new Map<string, NominaRow>();

      for (const j of list) {
        if (!j.userId) {
          console.warn("⚠️ Jornada sin userId:", j);
          continue;
        }

        const empleado = empleados[j.userId];
        const salarioBase = empleado?.salarioBaseMensual ?? 0;
        const valorHora = salarioBase ? salarioBase / 220 : 0;

        let r = map.get(j.userId);
        if (!r) {
          r = {
            userId: j.userId,
            nombre: empleado?.nombre ?? nombres[j.userId] ?? j.userId,
            salarioBaseMensual: salarioBase,
            valorHora: valorHora,
            hNormales: 0,
            hExtras: 0,
            hExtrasDiurnas: 0,
            hExtrasNocturnas: 0,
            hDominicales: 0,
            recargosH: 0,
            total$: 0,
            recargoNocturnoOrdinario: 0,
            recargoFestivoDiurno: 0,
            recargoFestivoNocturno: 0,
            extrasDiurnas: 0,
            extrasNocturnas: 0,
            extrasDiurnasDominical: 0,
            extrasNocturnasDominical: 0,
            totalHoras: 0,
          };
          map.set(j.userId, r);
        }

        r.hNormales += isNaN(j.horasNormales) ? 0 : j.horasNormales ?? 0;
        r.hExtras +=
          (isNaN(j.extrasDiurnas) ? 0 : j.extrasDiurnas ?? 0) +
          (isNaN(j.extrasNocturnas) ? 0 : j.extrasNocturnas ?? 0) +
          (isNaN(j.extrasDiurnasDominical)
            ? 0
            : j.extrasDiurnasDominical ?? 0) +
          (isNaN(j.extrasNocturnasDominical)
            ? 0
            : j.extrasNocturnasDominical ?? 0);

        r.hExtrasDiurnas =
          (r.hExtrasDiurnas ?? 0) +
          (isNaN(j.extrasDiurnas) ? 0 : j.extrasDiurnas ?? 0) +
          (isNaN(j.extrasDiurnasDominical) ? 0 : j.extrasDiurnasDominical ?? 0);
        r.hExtrasNocturnas =
          (r.hExtrasNocturnas ?? 0) +
          (isNaN(j.extrasNocturnas) ? 0 : j.extrasNocturnas ?? 0) +
          (isNaN(j.extrasNocturnasDominical)
            ? 0
            : j.extrasNocturnasDominical ?? 0);
        r.hDominicales =
          (r.hDominicales ?? 0) +
          (isNaN(j.extrasDiurnasDominical)
            ? 0
            : j.extrasDiurnasDominical ?? 0) +
          (isNaN(j.extrasNocturnasDominical)
            ? 0
            : j.extrasNocturnasDominical ?? 0);

        r.recargosH +=
          (isNaN(j.recargoNocturnoOrdinario)
            ? 0
            : j.recargoNocturnoOrdinario ?? 0) +
          (isNaN(j.recargoFestivoDiurno) ? 0 : j.recargoFestivoDiurno ?? 0) +
          (isNaN(j.recargoFestivoNocturno) ? 0 : j.recargoFestivoNocturno ?? 0);

        r.recargoNocturnoOrdinario += isNaN(j.recargoNocturnoOrdinario)
          ? 0
          : j.recargoNocturnoOrdinario ?? 0;
        r.recargoFestivoDiurno += isNaN(j.recargoFestivoDiurno)
          ? 0
          : j.recargoFestivoDiurno ?? 0;
        r.recargoFestivoNocturno += isNaN(j.recargoFestivoNocturno)
          ? 0
          : j.recargoFestivoNocturno ?? 0;
        r.extrasDiurnas += isNaN(j.extrasDiurnas) ? 0 : j.extrasDiurnas ?? 0;
        r.extrasNocturnas += isNaN(j.extrasNocturnas)
          ? 0
          : j.extrasNocturnas ?? 0;
        r.extrasDiurnasDominical += isNaN(j.extrasDiurnasDominical)
          ? 0
          : j.extrasDiurnasDominical ?? 0;
        r.extrasNocturnasDominical += isNaN(j.extrasNocturnasDominical)
          ? 0
          : j.extrasNocturnasDominical ?? 0;

        r.total$ += isNaN(j.valorTotalDia) ? 0 : j.valorTotalDia ?? 0;
        r.totalHoras += Number(j.totalHoras) || 0;
      }

      const rowsFinal = [...map.values()];
      console.log(
        "📊 Resultado final NominaRow (primeros 3):",
        rowsFinal.slice(0, 3)
      );

      setRows(rowsFinal);
      console.log(`✅ Resumen generado con ${rowsFinal.length} empleados`);
    } catch (error) {
      console.error("❌ Error al cargar jornadas:", error);
    } finally {
      setLoading(false);
    }
  }, [empresa, fechaInicio, fechaFin, nombres]);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = rows.filter((r) =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const exportar = async () => {
    const XLSX = await import("xlsx-js-style");

    // 🔹 Cargar empleados
    const empleadosSnap = await getDocs(collection(db, "usuarios"));
    const empleados: Record<string, any> = {};
    empleadosSnap.forEach((doc) => {
      empleados[doc.id] = doc.data();
    });

    // 🔹 Definir tipo para las filas de datos (ELIMINAMOS MES REPORTADO)
    type DataRow = {
      [key: string]: string | number;
      "MES CAUSADO": string;
      NOMBRE: string;
      CEDULA: any;
      SALARIO: number;
      "HORA ORDINARIA (NO MODIFICAR)": number;
      FECHA: string;
      PROYECTO: string;
      "CANTIDAD HORA EXTRA DIURNA": number;
      "CANTIDAD HORA EXTRA NOCTURNA": number;
      "CANTIDAD HORA EXTRA DIURNA FESTIVA": number;
      "CANTIDAD HORA EXTRA FESTIVA NOCTURNA": number;
      "CANTIDAD RECARGO DIURNO FESTIVO": number;
      "CANTIDAD RECARGO NOCTURNO": number;
      "CANTIDAD RECARGO FESTIVO NOCTURNO": number;
      "CANTIDAD RECARGO FESTIVO DIURNO": number;
      "CANTIDAD HDD SIN COM": number;
      "CANTIDAD HDD CON COMPENSATORIO": number;
      "HORA EXTRA DIURNA (1.25)": number;
      "HORA EXTRA NOCTURNA (1.75)": number;
      "HORA EXTRA DIURNA FESTIVA (2.05)": number;
      "HORA EXTRA FESTIVA NOCTURNA (2.55)": number;
      "RECARGO NOCTURNO (0.35)": number;
      "RECARGO DIURNO FESTIVO (0.80)": number;
      "RECARGO FESTIVO NOCTURNO (1.15)": number;
      "HDD SIN COMPENSATORIO (1.80)": number;
      "HDD CON COMPESATORÍO (0,80)": number;
      TOTAL: number;
    };

    // 🔹 OBTENER MES CAUSADO CON FORMATO NOV-DIC
    const mesCausado = obtenerMesCausadoFormato(fechaInicio, fechaFin);
    const fechaActual = new Date().toISOString().split("T")[0];

    // 🔹 Construir datos con información REAL del cálculo masivo
    const data: DataRow[] = filtrados.map((r) => {
      const empleado = empleados[r.userId];
      const salario = r.salarioBaseMensual ?? 0;

      // 🔹 USAR DATOS REALES del cálculo masivo
      const hExtraDiurna = r.hExtrasDiurnas ?? 0;
      const hExtraNocturna = r.hExtrasNocturnas ?? 0;
      const hExtraDiurnaFestiva = r.extrasDiurnasDominical ?? 0;
      const hExtraFestivaNocturna = r.extrasNocturnasDominical ?? 0;
      const recargoDiurnoFestivo = r.recargoFestivoDiurno ?? 0;
      const recargoNocturno = r.recargoNocturnoOrdinario ?? 0;
      const recargoFestivoNocturno = r.recargoFestivoNocturno ?? 0;
      const recargoFestivoDiurno = r.recargoFestivoDiurno ?? 0;

      // Si no tienes estos campos, déjalos en 0
      const hddSinCom = 0;
      const hddConCompensatorio = 0;

      // Calcular valores (sin decimales) usando las fórmulas del Excel
      const horaBase = salario / 220;
      const valorHoraExtraDiurna = Math.round(horaBase * 1.25 * hExtraDiurna);
      const valorHoraExtraNocturna = Math.round(
        horaBase * 1.75 * hExtraNocturna
      );
      const valorHoraExtraDiurnaFestiva = Math.round(
        horaBase * 2.05 * hExtraDiurnaFestiva
      );
      const valorHoraExtraFestivaNocturna = Math.round(
        horaBase * 2.55 * hExtraFestivaNocturna
      );
      const valorRecargoNocturno = Math.round(
        horaBase * 0.35 * recargoNocturno
      );
      const valorRecargoDiurnoFestivo = Math.round(
        horaBase * 0.8 * recargoDiurnoFestivo
      );
      const valorRecargoFestivoNocturno = Math.round(
        horaBase * 1.15 * recargoFestivoNocturno
      );
      const valorHddSinCom = Math.round(horaBase * 1.8 * hddSinCom);
      const valorHddConCompensatorio = Math.round(
        horaBase * 0.8 * hddConCompensatorio
      );

      const total =
        valorHoraExtraDiurna +
        valorHoraExtraNocturna +
        valorHoraExtraDiurnaFestiva +
        valorHoraExtraFestivaNocturna +
        valorRecargoNocturno +
        valorRecargoDiurnoFestivo +
        valorRecargoFestivoNocturno +
        valorHddSinCom +
        valorHddConCompensatorio;

      return {
        // ELIMINAMOS "MES REPORTADO" completamente
        "MES CAUSADO": mesCausado, // ← USAMOS EL FORMATO NOV-DIC
        NOMBRE: r.nombre,
        CEDULA: empleado?.documento ?? "",
        SALARIO: Math.round(salario),
        "HORA ORDINARIA (NO MODIFICAR)": Math.round(salario / 184),
        FECHA: fechaActual,
        PROYECTO: empleado?.proyecto ?? "",
        "CANTIDAD HORA EXTRA DIURNA": hExtraDiurna,
        "CANTIDAD HORA EXTRA NOCTURNA": hExtraNocturna,
        "CANTIDAD HORA EXTRA DIURNA FESTIVA": hExtraDiurnaFestiva,
        "CANTIDAD HORA EXTRA FESTIVA NOCTURNA": hExtraFestivaNocturna,
        "CANTIDAD RECARGO DIURNO FESTIVO": recargoDiurnoFestivo,
        "CANTIDAD RECARGO NOCTURNO": recargoNocturno,
        "CANTIDAD RECARGO FESTIVO NOCTURNO": recargoFestivoNocturno,
        "CANTIDAD RECARGO FESTIVO DIURNO": recargoFestivoDiurno,
        "CANTIDAD HDD SIN COM": hddSinCom,
        "CANTIDAD HDD CON COMPENSATORIO": hddConCompensatorio,
        "HORA EXTRA DIURNA (1.25)": valorHoraExtraDiurna,
        "HORA EXTRA NOCTURNA (1.75)": valorHoraExtraNocturna,
        "HORA EXTRA DIURNA FESTIVA (2.05)": valorHoraExtraDiurnaFestiva,
        "HORA EXTRA FESTIVA NOCTURNA (2.55)": valorHoraExtraFestivaNocturna,
        "RECARGO NOCTURNO (0.35)": valorRecargoNocturno,
        "RECARGO DIURNO FESTIVO (0.80)": valorRecargoDiurnoFestivo,
        "RECARGO FESTIVO NOCTURNO (1.15)": valorRecargoFestivoNocturno,
        "HDD SIN COMPENSATORIO (1.80)": valorHddSinCom,
        "HDD CON COMPESATORÍO (0,80)": valorHddConCompensatorio,
        TOTAL: total,
      };
    });

    // 🔹 Calcular TOTALES REALES (no fórmulas)
    const calcularTotal = (campo: string) => {
      return data.reduce((sum, row) => sum + (Number(row[campo]) || 0), 0);
    };

    const totalRow: DataRow = {
      "MES CAUSADO": "TOTAL",
      NOMBRE: "",
      CEDULA: "",
      SALARIO: 0,
      "HORA ORDINARIA (NO MODIFICAR)": Math.round(
        calcularTotal("SALARIO") / 184
      ),
      FECHA: "",
      PROYECTO: "",
      "CANTIDAD HORA EXTRA DIURNA": calcularTotal("CANTIDAD HORA EXTRA DIURNA"),
      "CANTIDAD HORA EXTRA NOCTURNA": calcularTotal(
        "CANTIDAD HORA EXTRA NOCTURNA"
      ),
      "CANTIDAD HORA EXTRA DIURNA FESTIVA": calcularTotal(
        "CANTIDAD HORA EXTRA DIURNA FESTIVA"
      ),
      "CANTIDAD HORA EXTRA FESTIVA NOCTURNA": calcularTotal(
        "CANTIDAD HORA EXTRA FESTIVA NOCTURNA"
      ),
      "CANTIDAD RECARGO DIURNO FESTIVO": calcularTotal(
        "CANTIDAD RECARGO DIURNO FESTIVO"
      ),
      "CANTIDAD RECARGO NOCTURNO": calcularTotal("CANTIDAD RECARGO NOCTURNO"),
      "CANTIDAD RECARGO FESTIVO NOCTURNO": calcularTotal(
        "CANTIDAD RECARGO FESTIVO NOCTURNO"
      ),
      "CANTIDAD RECARGO FESTIVO DIURNO": calcularTotal(
        "CANTIDAD RECARGO FESTIVO DIURNO"
      ),
      "CANTIDAD HDD SIN COM": calcularTotal("CANTIDAD HDD SIN COM"),
      "CANTIDAD HDD CON COMPENSATORIO": calcularTotal(
        "CANTIDAD HDD CON COMPENSATORIO"
      ),
      "HORA EXTRA DIURNA (1.25)": calcularTotal("HORA EXTRA DIURNA (1.25)"),
      "HORA EXTRA NOCTURNA (1.75)": calcularTotal("HORA EXTRA NOCTURNA (1.75)"),
      "HORA EXTRA DIURNA FESTIVA (2.05)": calcularTotal(
        "HORA EXTRA DIURNA FESTIVA (2.05)"
      ),
      "HORA EXTRA FESTIVA NOCTURNA (2.55)": calcularTotal(
        "HORA EXTRA FESTIVA NOCTURNA (2.55)"
      ),
      "RECARGO NOCTURNO (0.35)": calcularTotal("RECARGO NOCTURNO (0.35)"),
      "RECARGO DIURNO FESTIVO (0.80)": calcularTotal(
        "RECARGO DIURNO FESTIVO (0.80)"
      ),
      "RECARGO FESTIVO NOCTURNO (1.15)": calcularTotal(
        "RECARGO FESTIVO NOCTURNO (1.15)"
      ),
      "HDD SIN COMPENSATORIO (1.80)": calcularTotal(
        "HDD SIN COMPENSATORIO (1.80)"
      ),
      "HDD CON COMPESATORÍO (0,80)": calcularTotal(
        "HDD CON COMPESATORÍO (0,80)"
      ),
      TOTAL: calcularTotal("TOTAL"),
    };

    data.push(totalRow);

    // 🔹 Crear hoja
    const ws = XLSX.utils.json_to_sheet(data);

    // 🔹 CONFIGURACIÓN DE COLORES ESPECÍFICA
    // 🔹 CONFIGURACIÓN DE COLORES ESPECÍFICA
    const COLORES = {
      HEADER_PRINCIPAL: "9BC2E6", // Azul claro para todos los headers
      COLUMNAS_DESTACADAS: "FFFF00", // Amarillo para columnas específicas
      TOTAL_FILA: "000000", // Negro para TODA LA FILA TOTAL
      TEXTO_BLANCO: "FFFFFF", // Blanco para texto
      FONDO_BLANCO: "FFFFFF", // Blanco para fondo normal
    };

    // 🔹 Lista de columnas que deben ser AMARILLAS (FFFF00)
    const columnasAmarillas = [
      "NOMBRE",
      "HORA ORDINARIA (NO MODIFICAR)",
      "HORA EXTRA DIURNA (1.25)",
      "HORA EXTRA NOCTURNA (1.75)",
      "HORA EXTRA DIURNA FESTIVA (2.05)",
      "HORA EXTRA FESTIVA NOCTURNA (2.55)",
      "RECARGO NOCTURNO (0.35)",
      "RECARGO DIURNO FESTIVO (0.80)",
      "RECARGO FESTIVO NOCTURNO (1.15)",
      "HDD SIN COMPENSATORIO (1.80)",
      "HDD CON COMPESATORÍO (0,80)",
      "TOTAL",
    ];

    // 🔹 Aplicar estilos con COLORES ESPECÍFICOS
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    const headers = Object.keys(data[0]); // Obtener nombres de columnas
    const ultimaFila = data.length - 1; // Índice de la última fila (TOTAL)

    // 🔹 Encontrar el índice de la columna "MES CAUSADO"
    const columnaMesCausadoIndex = headers.indexOf("MES CAUSADO");

    for (let R = range.s.r; R <= range.e.r; ++R) {
      // 🔹 Verificar si esta fila es la fila TOTAL (viendo la celda de MES CAUSADO)
      const celdaMesCausado =
        ws[XLSX.utils.encode_cell({ r: R, c: columnaMesCausadoIndex })];
      const esFilaTotal = celdaMesCausado && celdaMesCausado.v === "TOTAL";

      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];
        if (!cell) continue;

        const isHeader = R === 0;
        const nombreColumna = headers[C];
        const esColumnaAmarilla = columnasAmarillas.includes(nombreColumna);

        // Formatear números sin decimales
        if (typeof cell.v === "number") {
          cell.v = cell.v;
          cell.z = "#,##0";
        }

        // 🔹 ASIGNAR COLORES SEGÚN LAS ESPECIFICACIONES
        let colorFondo = COLORES.FONDO_BLANCO;
        let colorTexto = "000000"; // Negro por defecto

        if (isHeader) {
          // TODOS los headers con fondo azul #9BC2E6
          colorFondo = COLORES.HEADER_PRINCIPAL;
        } else if (esFilaTotal) {
          // 🔥 TODA LA FILA QUE DICE "TOTAL" en MES CAUSADO: fondo negro, texto blanco
          colorFondo = COLORES.TOTAL_FILA;
          colorTexto = COLORES.TEXTO_BLANCO;
        } else if (esColumnaAmarilla && !isHeader) {
          // Columnas específicas AMARILLAS (solo en filas de datos, no en header)
          colorFondo = COLORES.COLUMNAS_DESTACADAS;
        } else {
          // Todo lo demás BLANCO
          colorFondo = COLORES.FONDO_BLANCO;
        }

        cell.s = {
          font: {
            name: "Calibri",
            sz: 10,
            bold: isHeader || esFilaTotal,
            color: { rgb: colorTexto },
          },
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
          fill: {
            fgColor: { rgb: colorFondo },
          },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }
    // 🔹 Ajustar ancho columnas (una columna menos porque eliminamos MES REPORTADO)
    const columnWidths = [
      10, 25, 15, 12, 25, 12, 15, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
      12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12,
    ];
    ws["!cols"] = columnWidths.map((wch) => ({ wch }));

    // 🔹 Crear libro y guardar con nombre basado en el filtro
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Hoja1");

    // Nombre del archivo basado en el mes causado del filtro
    const nombreArchivo = `HORAS_EXTRAS_${mesCausado}_${fechaActual}.xlsx`;
    XLSX.writeFile(wb, nombreArchivo);
  };

  // 🔹 FUNCIÓN AUXILIAR PARA OBTENER EL MES CAUSADO EN FORMATO NOV-DIC
  function obtenerMesCausadoFormato(
    fechaInicio: string,
    fechaFin: string
  ): string {
    const fechaIni = new Date(fechaInicio);
    const fechaFinObj = new Date(fechaFin);

    const mesesAbreviados = [
      "ENE",
      "FEB",
      "MAR",
      "ABR",
      "MAY",
      "JUN",
      "JUL",
      "AGO",
      "SEP",
      "OCT",
      "NOV",
      "DIC",
    ];

    const mesInicio = mesesAbreviados[fechaIni.getMonth()];
    const mesFin = mesesAbreviados[fechaFinObj.getMonth()];

    // Si es el mismo mes, devolver solo un mes, sino dos meses
    if (mesInicio === mesFin) {
      return mesInicio;
    } else {
      return `${mesInicio}-${mesFin}`;
    }
  }

  // Nueva función para exportar detalle del empleado
  const exportarDetalleEmpleado = async () => {
    if (!detalleEmpleado || !modalJornadas.length) return;

    const XLSX = await import("xlsx-js-style");

    // Construir datos detallados
    const data = modalJornadas.map((j) => {
      const esAutomatica = !!j.historial;
      const inicio = esAutomatica
        ? j.horaInicioReal?.toDate?.().toLocaleTimeString("es-CO", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }) || j.historial?.find((h: any) => h.accion === "inicio")?.hora
        : j.horaEntrada;
      const fin = esAutomatica
        ? j.horaFinReal?.toDate?.().toLocaleTimeString("es-CO", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
          }) || j.historial?.find((h: any) => h.accion === "fin")?.hora
        : j.horaSalida;

      return {
        Fecha: j.fecha,
        "Tipo Jornada": esAutomatica
          ? "Automática (Real)"
          : "Manual (Programada)",
        Turno: j.turnoId || "N/A",
        "Hora Entrada": inicio || "N/A",
        "Hora Salida": fin || "N/A",
        "Horas Normales": j.horasNormales ?? 0,
        "Recargo Nocturno Ordinario": j.recargoNocturnoOrdinario ?? 0,
        "Recargo Festivo Diurno": j.recargoFestivoDiurno ?? 0,
        "Recargo Festivo Nocturno": j.recargoFestivoNocturno ?? 0,
        "Extras Diurnas": j.extrasDiurnas ?? 0,
        "Extras Nocturnas": j.extrasNocturnas ?? 0,
        "Extras Diurnas Dominical": j.extrasDiurnasDominical ?? 0,
        "Extras Nocturnas Dominical": j.extrasNocturnasDominical ?? 0,
        "Total Horas": j.totalHoras ?? 0,
        "Valor Total Día": j.valorTotalDia ?? 0,
        Estado: j.estado,
        "Creado En": j.creadoEn?.toDate?.().toLocaleString() || "N/A",
      };
    });

    // Crear hoja
    const ws = XLSX.utils.json_to_sheet(data);

    // Estilos
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];
        if (!cell) continue;

        const isHeader = R === 0;

        cell.s = {
          font: {
            name: "Calibri",
            sz: 10,
            bold: isHeader,
          },
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
          fill: isHeader ? { fgColor: { rgb: "E9ECEF" } } : undefined,
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }

    // Ajustar ancho columnas
    ws["!cols"] = Object.keys(data[0]).map((k) => ({
      wch: Math.max(15, k.length + 2),
    }));

    // Crear libro y guardar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle_Jornadas");
    XLSX.writeFile(
      wb,
      `detalle_${detalleEmpleado.nombre.replace(/\s+/g, "_")}.xlsx`
    );
  };

  return (
    <div className="p-6 space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-center">
          NÓMINA DEL {formatear(fechaInicio)} – {formatear(fechaFin)}
        </h1>
      </header>

      <div className="flex flex-wrap gap-3 items-center">
        <Input
          type="date"
          value={fechaInicio}
          onChange={(e) => setFechaInicio(e.target.value)}
          className="w-36"
        />
        <Input
          type="date"
          value={fechaFin}
          onChange={(e) => setFechaFin(e.target.value)}
          className="w-36"
        />
        <Input
          placeholder="Buscar empleado…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-60"
        />
        <Select value={empresa} onValueChange={(v) => setEmpresa(v as any)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas</SelectItem>
            <SelectItem value="NETCOL">NETCOL</SelectItem>
            <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
            <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={cargar} disabled={loading}>
          {loading ? "Cargando…" : "Actualizar"}
        </Button>
        <Button variant="outline" onClick={exportar}>
          Exportar Excel
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-4">
        <span className="font-semibold">RN</span>: Recargo Nocturno &nbsp; |
        &nbsp;
        <span className="font-semibold">RFD</span>: Recargo Festivo Diurno
        &nbsp; | &nbsp;
        <span className="font-semibold">RFN</span>: Recargo Festivo Nocturno
        &nbsp; | &nbsp;
        <span className="font-semibold">ED</span>: Extras Diurnas &nbsp; |
        &nbsp;
        <span className="font-semibold">EN</span>: Extras Nocturnas &nbsp; |
        &nbsp;
        <span className="font-semibold">EDD</span>: Extras Diurnas Dominical
        &nbsp; | &nbsp;
        <span className="font-semibold">END</span>: Extras Nocturnas Dominical
      </p>

      <div className="border rounded-md overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 flex justify-center items-center z-10">
            <div className="loader border-t-4 border-blue-500 rounded-full w-12 h-12 animate-spin"></div>
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empleado</TableHead>
              <TableHead className="text-right">Salario Base</TableHead>
              <TableHead className="text-right">Valor Hora</TableHead>
              <TableHead className="text-right">Total Horas</TableHead>
              <TableHead className="text-right">RN</TableHead>
              <TableHead className="text-right">RFD</TableHead>
              <TableHead className="text-right">RFN</TableHead>
              <TableHead className="text-right">ED</TableHead>
              <TableHead className="text-right">EN</TableHead>
              <TableHead className="text-right">EDD</TableHead>
              <TableHead className="text-right">END</TableHead>
              <TableHead className="text-right">Total Neto</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {filtrados.map((r) => (
              <TableRow key={r.userId}>
                <TableCell className="font-medium">{r.nombre}</TableCell>
                <TableCell className="text-right">
                  {money(r.salarioBaseMensual ?? 0)}
                </TableCell>
                <TableCell className="text-right">
                  {money(r.valorHora ?? 0)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.totalHoras)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.recargoNocturnoOrdinario)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.recargoFestivoDiurno)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.recargoFestivoNocturno)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.extrasDiurnas)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.extrasNocturnas)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.extrasDiurnasDominical)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.extrasNocturnasDominical)}
                </TableCell>
                <TableCell className="text-right font-semibold text-blue-700">
                  {money(r.total$ ?? 0)}
                </TableCell>
                <TableCell>
                  <Button
                    onClick={() =>
                      setDetalleEmpleado({
                        id: r.userId,
                        nombre: r.nombre,
                      })
                    }
                  >
                    Detalle
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {filtrados.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={13}
                  className="text-center py-10 text-muted-foreground"
                >
                  Sin resultados para este periodo/filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={!!detalleEmpleado}
        onOpenChange={() => setDetalleEmpleado(null)}
      >
        <DialogContent className="max-w-4xl bg-white text-black rounded-2xl shadow-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Detalle del empleado: {detalleEmpleado?.nombre}
            </DialogTitle>
            <DialogDescription>
              Jornadas registradas, tanto manuales como automáticas. Incluye
              información detallada de cálculo de nómina.
            </DialogDescription>
            {modalJornadas.length > 0 && (
              <Button
                onClick={exportarDetalleEmpleado}
                className="self-end flex items-center gap-2"
                variant="outline"
              >
                <Download className="w-4 h-4" />
                Exportar Excel Detallado
              </Button>
            )}
          </DialogHeader>

          {detalleEmpleado ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium">
                  {detalleEmpleado.nombre}
                </h3>
                <p className="text-sm text-gray-600">
                  Total jornadas: {modalJornadas?.length || 0}
                </p>
              </div>

              <div className="grid gap-3">
                {modalJornadas && modalJornadas.length > 0 ? (
                  modalJornadas.map((j: any, i: number) => {
                    const esAutomatica = !!j.historial; // tiene array historial
                    const inicio = esAutomatica
                      ? j.horaInicioReal
                          ?.toDate?.()
                          .toLocaleTimeString("es-CO", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                          }) ||
                        j.historial?.find((h: any) => h.accion === "inicio")
                          ?.hora
                      : j.horaEntrada;
                    const fin = esAutomatica
                      ? j.horaFinReal?.toDate?.().toLocaleTimeString("es-CO", {
                          hour12: false,
                          hour: "2-digit",
                          minute: "2-digit",
                        }) ||
                        j.historial?.find((h: any) => h.accion === "fin")?.hora
                      : j.horaSalida;

                    const ubicacionInicio = esAutomatica
                      ? j.ubicacionInicio ||
                        j.historial?.find((h: any) => h.accion === "inicio")
                          ?.ubicacion
                      : null;

                    const ubicacionFin = esAutomatica
                      ? j.ubicacionFin ||
                        j.historial?.find((h: any) => h.accion === "fin")
                          ?.ubicacion
                      : null;

                    return (
                      <div
                        key={i}
                        className="border rounded-xl p-4 bg-gray-50 hover:bg-gray-100 transition-all"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-semibold">📅 {j.fecha}</span>
                          <span className="text-sm text-gray-600">
                            Turno: {j.turnoId || "N/A"}
                          </span>
                        </div>

                        <div className="text-sm space-y-1">
                          <p>
                            <strong>Tipo:</strong>{" "}
                            {esAutomatica
                              ? "Automática (Real)"
                              : "Manual (Programada)"}
                          </p>
                          <p>🕐 Entrada: {inicio || "N/A"}</p>
                          <p>🕒 Salida: {fin || "N/A"}</p>

                          {esAutomatica ? (
                            <>
                              {ubicacionInicio && (
                                <p>
                                  📍 Inicio:{" "}
                                  <a
                                    href={`https://maps.google.com/?q=${ubicacionInicio.lat},${ubicacionInicio.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline text-blue-600"
                                  >
                                    Ver en mapa
                                  </a>
                                </p>
                              )}
                              {ubicacionFin && (
                                <p>
                                  📍 Fin:{" "}
                                  <a
                                    href={`https://maps.google.com/?q=${ubicacionFin.lat},${ubicacionFin.lng}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline text-blue-600"
                                  >
                                    Ver en mapa
                                  </a>
                                </p>
                              )}
                            </>
                          ) : (
                            <>
                              <p>💼 Estado: {j.estado}</p>
                            </>
                          )}

                          {/* Detalles de cálculo */}
                          <div className="mt-3 p-3 bg-white rounded-lg border">
                            <h4 className="font-medium text-gray-800 mb-2">
                              💰 Cálculo de Nómina
                            </h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>Horas Normales: {j.horasNormales ?? 0}</div>
                              <div>
                                Recargo Nocturno:{" "}
                                {j.recargoNocturnoOrdinario ?? 0}
                              </div>
                              <div>
                                Recargo Festivo Diurno:{" "}
                                {j.recargoFestivoDiurno ?? 0}
                              </div>
                              <div>
                                Recargo Festivo Nocturno:{" "}
                                {j.recargoFestivoNocturno ?? 0}
                              </div>
                              <div>Extras Diurnas: {j.extrasDiurnas ?? 0}</div>
                              <div>
                                Extras Nocturnas: {j.extrasNocturnas ?? 0}
                              </div>
                              <div>
                                Extras Diurnas Dominical:{" "}
                                {j.extrasDiurnasDominical ?? 0}
                              </div>
                              <div>
                                Extras Nocturnas Dominical:{" "}
                                {j.extrasNocturnasDominical ?? 0}
                              </div>
                              <div className="col-span-2 font-semibold">
                                Total Horas: {j.totalHoras ?? 0}
                              </div>
                              <div className="col-span-2 font-semibold text-green-600">
                                Valor Total Día: $
                                {j.valorTotalDia?.toLocaleString() || 0}
                              </div>
                            </div>
                          </div>

                          <p className="text-gray-500 text-xs">
                            Creado:{" "}
                            {j.creadoEn?.toDate
                              ? j.creadoEn.toDate().toLocaleString()
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-center text-gray-500 text-sm">
                    No hay jornadas registradas.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500">Cargando detalles...</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ——— Helpers
function round(n: number, d = 2) {
  return Number(n || 0).toFixed(d);
}
function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
function formatear(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString("es-CO", { day: "2-digit", month: "short" })
    .replace(".", "");
}
