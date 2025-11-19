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
            valorHora,
            hNormales: 0,
            hExtras: 0,
            hExtrasDiurnas: 0,
            hExtrasNocturnas: 0,
            hDominicales: 0,
            recargosH: 0,
            total$: 0,
          };
          map.set(j.userId, r);
        }

        r.hNormales += j.horasNormales ?? 0;
        r.hExtras +=
          (j.extrasDiurnas ?? 0) +
          (j.extrasNocturnas ?? 0) +
          (j.extrasDiurnasDominical ?? 0) +
          (j.extrasNocturnasDominical ?? 0);

        r.hExtrasDiurnas =
          (r.hExtrasDiurnas ?? 0) +
          (j.extrasDiurnas ?? 0) +
          (j.extrasDiurnasDominical ?? 0);
        r.hExtrasNocturnas =
          (r.hExtrasNocturnas ?? 0) +
          (j.extrasNocturnas ?? 0) +
          (j.extrasNocturnasDominical ?? 0);
        r.hDominicales =
          (r.hDominicales ?? 0) +
          (j.extrasDiurnasDominical ?? 0) +
          (j.extrasNocturnasDominical ?? 0);

        r.recargosH +=
          (j.recargoNocturnoOrdinario ?? 0) +
          (j.recargoFestivoDiurno ?? 0) +
          (j.recargoFestivoNocturno ?? 0);

        r.total$ += j.valorTotalDia ?? 0;
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

    // 🔹 Cargar configuración de recargos
    const recargosSnap = await getDoc(doc(db, "config", "recargos"));
    const recargosCfg = recargosSnap.exists()
      ? (recargosSnap.data() as any)
      : {
          recargo_nocturno_ordinario: 0.35,
          recargo_festivo_diurno: 0.8,
          recargo_festivo_nocturno: 1.15,
          extra_diurna: 0.25,
          extra_nocturna: 0.75,
          extra_diurna_dominical: 1.05,
          extra_nocturna_dominical: 1.55,
        };

    // 🔹 Construir datos
    const data = filtrados.map((r) => {
      const empleado = empleados[r.userId];
      return {
        "MES CAUSADO": new Date()
          .toLocaleString("default", { month: "long" })
          .toUpperCase(),
        NOMBRE: r.nombre,
        CEDULA: empleado?.documento ?? "",
        EMPRESA: empleado?.empresa ?? "",
        FECHA: new Date().toISOString().split("T")[0],
        SALARIO: r.salarioBaseMensual ?? 0,
        "HORA ORDINARIA (NO MODIFICAR)": r.hNormales ?? 0,
        "CANTIDAD HORA EXTRA DIURNA": r.hExtrasDiurnas ?? 0,
        "CANTIDAD HORA EXTRA NOCTURNA": r.hExtrasNocturnas ?? 0,
        "CANTIDAD HORA EXTRA DIURNA FESTIVA": 0,
        "CANTIDAD HORA EXTRA FESTIVA NOCTURNA": 0,
        "CANTIDAD RECARGO DIURNO FESTIVO": 0,
        "CANTIDAD RECARGO NOCTURNO": 0,
        "CANTIDAD RECARGO FESTIVO NOCTURNO": 0,
        "CANTIDAD RECARGO FESTIVO DIURNO": 0,
        "HORA EXTRA DIURNA (0.25)":
          (r.hExtrasDiurnas ?? 0) * recargosCfg.extra_diurna,
        "HORA EXTRA NOCTURNA (0.75)":
          (r.hExtrasNocturnas ?? 0) * recargosCfg.extra_nocturna,
        "HORA EXTRA DIURNA FESTIVA (1.05)": 0,
        "HORA EXTRA FESTIVA NOCTURNA (1.55)": 0,
        "RECARGO NOCTURNO (0.35)":
          (r.recargosH ?? 0) * recargosCfg.recargo_nocturno_ordinario,
        "RECARGO DIURNO FESTIVO (0.80)": 0,
        "RECARGO FESTIVO NOCTURNO (1.15)": 0,
        TOTAL: r.total$ ?? 0,
      };
    });

    // 🔹 Calcular total general
    const numericKeys = Object.keys(data[0]).filter(
      (k) => typeof (data[0] as any)[k] === "number"
    );

    const totalRow = data.reduce((acc: any, curr: any) => {
      numericKeys.forEach((key) => {
        acc[key] = (acc[key] || 0) + (curr[key] ?? 0);
      });
      return acc;
    }, {});

    totalRow["FECHA"] = "TOTAL GENERAL";
    data.push(totalRow);

    // 🔹 Crear hoja
    const ws = XLSX.utils.json_to_sheet(data);

    // 🔹 Formatear números con separadores tipo Colombia
    const formatoColombiano = (valor: number) =>
      valor.toLocaleString("es-CO").replace(/,/g, ".").replace(/\./, "'");

    const range = XLSX.utils.decode_range(ws["!ref"]!);
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellAddress];
        if (!cell) continue;

        const isHeader = R === 0;
        const isTotal = cell.v === "TOTAL GENERAL";

        // 🔹 Formatear valores numéricos
        if (typeof cell.v === "number") {
          const valor = cell.v as number;
          cell.v = valor; // mantenemos número
          cell.z = "#,##0"; // formato miles estándar (2.350.000)
        }

        // 🔹 Estilos generales
        cell.s = {
          font: {
            name: "Calibri",
            sz: 10,
            bold: isHeader || isTotal,
          },
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
          fill: isHeader
            ? { fgColor: { rgb: "E9ECEF" } }
            : isTotal
            ? { fgColor: { rgb: "D6EAF8" } }
            : undefined,
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }

    // 🔹 Ajustar ancho columnas
    ws["!cols"] = Object.keys(data[0]).map((k) => ({
      wch: Math.max(15, k.length + 2),
    }));

    // 🔹 Crear libro y guardar
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Nomina");
    XLSX.writeFile(wb, `nomina_${fechaInicio}_a_${fechaFin}.xlsx`);
  };

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
              <TableHead className="text-right">H. Normales</TableHead>
              <TableHead className="text-right">H. Extra Diurnas</TableHead>
              <TableHead className="text-right">H. Extra Nocturnas</TableHead>
              <TableHead className="text-right">H. Dominicales</TableHead>
              <TableHead className="text-right">Recargos (h)</TableHead>
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
                  {formatHoras(r.hNormales)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.hExtrasDiurnas)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.hExtrasNocturnas)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.hDominicales)}
                </TableCell>
                <TableCell className="text-right">
                  {formatHoras(r.recargosH)}
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
                  colSpan={10}
                  className="text-center py-10 text-muted-foreground"
                >
                  Sin resultados para este periodo/filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        *H. Normales = sumatoria horas base. *H. Extras = todas las horas extra
        (diurna/nocturna/dominical). *Recargos = horas normales con recargo
        (nocturnas/festivas/dominicales).
      </p>

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
