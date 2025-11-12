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
} from "@/components/ui/dialog";

import { db } from "@/lib/firebase";
import {
  collection,
  Timestamp,
  collectionGroup,
  getDocs,
  orderBy,
  query,
  where,
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
    nombre: string;
    jornadas: JornadaDoc[];
  } | null>(null);

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

  // dentro de tu componente
  const cargar = React.useCallback(async () => {
    setLoading(true);
    try {
      console.log("🔹 Iniciando carga de jornadas/resumen...");
      console.log(`📅 Filtrando de: ${inicioISO} a ${finISO}`);

      // Convertir fechas ISO a Timestamps de Firestore
      const inicioTS = Timestamp.fromDate(new Date(inicioISO));
      const finTS = Timestamp.fromDate(new Date(finISO));

      // Construir query
      const base: any[] = [
        where("creadoEn", ">=", inicioTS),
        where("creadoEn", "<=", finTS),
        orderBy("creadoEn", "asc"),
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
      console.log(
        `🔹 Total documentos encontrados en Firestore: ${snap.docs.length}`
      );
      console.log(
        "📄 Documentos crudos:",
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );

      // Filtrar solo jornadas válidas si quieres (opcional)
      const list: JornadaDoc[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as JornadaDoc),
      }));

      // Agrupar todas las jornadas por usuario
      const mapJornadas: Record<string, JornadaDoc[]> = {};
      for (const j of list) {
        if (!j.userId) continue;
        if (!mapJornadas[j.userId]) mapJornadas[j.userId] = [];
        mapJornadas[j.userId].push(j);
      }

      setJornadasPorEmpleado(mapJornadas); // 🔹 guardamos aquí las jornadas completas

      // Agrupar por usuario
      const map = new Map<string, NominaRow>();
      for (const j of list) {
        if (!j.userId) {
          console.warn("⚠️ Jornada sin userId:", j);
          continue;
        }

        const r = map.get(j.userId) ?? {
          userId: j.userId,
          nombre: nombres[j.userId] ?? j.userId,
          hNormales: 0,
          hExtras: 0,
          recargosH: 0,
          total$: 0,
        };

        r.hNormales += j.horasNormales ?? 0;
        r.hExtras +=
          j.extrasDiurnas +
          j.extrasNocturnas +
          j.extrasDiurnasDominical +
          j.extrasNocturnasDominical;
        r.recargosH +=
          j.recargoNocturnoOrdinario +
          j.recargoFestivoDiurno +
          j.recargoFestivoNocturno;
        r.total$ += j.valorTotalDia ?? 0;

        map.set(j.userId, r);
      }

      console.log(
        `✅ Jornadas por empleado cargadas para ${map.size} usuarios`
      );

      setRows([...map.values()]);
      console.log(`✅ Resumen generado con ${map.size} empleados con jornadas`);
      console.log("🔹 Carga finalizada");
    } catch (error) {
      console.error("❌ Error al cargar jornadas:", error);
    } finally {
      setLoading(false);
    }
  }, [empresa, inicioISO, finISO, nombres]);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = rows.filter((r) =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const handleDescargarExcel = async () => {
    if (!detalleEmpleado) return;

    try {
      const XLSX = await import("xlsx");

      const data = detalleEmpleado.jornadas.map((j) => ({
        Fecha: formatear(j.fecha),
        Turno: j.turnoId,
        "H. Normales": clean(j.horasNormales),
        "H. Extras": clean(
          j.extrasDiurnas +
            j.extrasNocturnas +
            j.extrasDiurnasDominical +
            j.extrasNocturnasDominical
        ),
        "Recargos (h)": clean(
          j.recargoNocturnoOrdinario +
            j.recargoFestivoDiurno +
            j.recargoFestivoNocturno
        ),
        "Total $": money(j.valorTotalDia),
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, `Detalle_${detalleEmpleado.nombre}`);

      // Formatear fecha para el nombre del archivo
      const fechaHoy = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `detalle_${detalleEmpleado.nombre}_${fechaHoy}.xlsx`);
    } catch (error) {
      console.error("Error al exportar Excel:", error);
      alert("Error al exportar el archivo Excel");
    }
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const data = filtrados.map((r) => ({
      Empleado: r.nombre,
      "H. Normales": r.hNormales,
      "H. Extras": r.hExtras,
      "Recargos (h)": r.recargosH,
      "Total $": r.total$,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Nomina");
    XLSX.writeFile(wb, `nomina_${fechaInicio}_a_${fechaFin}.xlsx`);
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
              <TableHead className="text-right">H. Normales</TableHead>
              <TableHead className="text-right">H. Extras</TableHead>
              <TableHead className="text-right">Recargos (h)</TableHead>
              <TableHead className="text-right">Total $</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((r) => (
              <TableRow key={r.userId}>
                <TableCell>{r.nombre}</TableCell>
                <TableCell className="text-right">
                  {Math.round(r.hNormales)}
                </TableCell>
                <TableCell className="text-right">
                  {Math.round(r.hExtras)}
                </TableCell>
                <TableCell className="text-right">
                  {Math.round(r.recargosH)}
                </TableCell>
                <TableCell className="text-right">{money(r.total$)}</TableCell>

                <TableCell>
                  <Button
                    onClick={() =>
                      setDetalleEmpleado({
                        nombre: r.nombre,
                        jornadas: jornadasPorEmpleado[r.userId] ?? [],
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
                  colSpan={6}
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
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] rounded-2xl shadow-2xl p-0 overflow-hidden bg-white flex flex-col">
          <DialogHeader className="px-6 py-4 bg-gradient-to-r from-gray-900 to-black text-white shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                DETALLE: {detalleEmpleado?.nombre}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDescargarExcel}
                  variant="outline"
                  className="bg-white/20 hover:bg-white/30 text-white border-white/30 hover:border-white/50 transition-all duration-200 flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Exportar Excel
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDetalleEmpleado(null)}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 flex flex-col p-6 overflow-hidden">
            {/* Resumen rápido */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-xl shrink-0">
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">Total Horas</p>
                <p className="text-lg font-bold text-gray-900">
                  {Math.round(
                    detalleEmpleado?.jornadas.reduce(
                      (sum, j) => sum + j.horasNormales,
                      0
                    ) || 0
                  )}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">
                  Total Extras
                </p>
                <p className="text-lg font-bold text-orange-600">
                  {Math.round(
                    detalleEmpleado?.jornadas.reduce(
                      (sum, j) =>
                        sum +
                        j.extrasDiurnas +
                        j.extrasNocturnas +
                        j.extrasDiurnasDominical +
                        j.extrasNocturnasDominical,
                      0
                    ) || 0
                  )}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">
                  Total Recargos
                </p>
                <p className="text-lg font-bold text-purple-600">
                  {Math.round(
                    detalleEmpleado?.jornadas.reduce(
                      (sum, j) =>
                        sum +
                        j.recargoNocturnoOrdinario +
                        j.recargoFestivoDiurno +
                        j.recargoFestivoNocturno,
                      0
                    ) || 0
                  )}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 font-medium">Valor Total</p>
                <p className="text-lg font-bold text-green-600">
                  {money(
                    detalleEmpleado?.jornadas.reduce(
                      (sum, j) => sum + j.valorTotalDia,
                      0
                    ) || 0
                  )}
                </p>
              </div>
            </div>

            {/* Tabla con scroll */}
            <div className="flex-1 overflow-hidden rounded-xl border border-gray-200/60 bg-white">
              <div className="h-full overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-50">
                <table className="w-full text-sm min-w-[600px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-gradient-to-r from-gray-50 to-gray-100/80 border-b border-gray-200">
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Fecha
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Turno
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Normales
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Extras
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Recargos
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700 text-xs uppercase tracking-wider">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200/60">
                    {detalleEmpleado?.jornadas.map((j, index) => (
                      <tr
                        key={j.id}
                        className={`hover:bg-gray-50/50 transition-colors duration-150 ${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {formatear(j.fecha)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {j.turnoId}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-900">
                          {Math.round(j.horasNormales)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-orange-600 font-medium">
                          {Math.round(
                            j.extrasDiurnas +
                              j.extrasNocturnas +
                              j.extrasDiurnasDominical +
                              j.extrasNocturnasDominical
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-purple-600 font-medium">
                          {Math.round(
                            j.recargoNocturnoOrdinario +
                              j.recargoFestivoDiurno +
                              j.recargoFestivoNocturno
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-green-600 font-semibold">
                          {money(j.valorTotalDia)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
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
