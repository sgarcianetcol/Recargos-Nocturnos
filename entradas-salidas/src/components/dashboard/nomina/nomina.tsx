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
    id: string;
    nombre: string;
  } | null>(null);

  const [modalJornadas, setModalJornadas] = React.useState<JornadaDoc[]>([]);

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
        console.log(`⏳ Cargando jornadas de ${detalleEmpleado.nombre}...`);
        const hoy = new Date().toISOString().split("T")[0];

        const resultado = await getDetalleEmpleado({
          userId: detalleEmpleado.id,
          desdeISO: "2025-01-01",
          hastaISO: hoy,
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
      console.log(`📅 Filtrando de: ${inicioISO} a ${finISO}`);

      const inicioTS = Timestamp.fromDate(new Date(inicioISO));
      const finTS = Timestamp.fromDate(new Date(finISO));

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
        const valorHora = salarioBase ? salarioBase / 240 : 0;

        let r = map.get(j.userId);
        if (!r) {
          r = {
            userId: j.userId,
            nombre: empleado?.nombre ?? nombres[j.userId] ?? j.userId,
            salarioBaseMensual: salarioBase,
            valorHora,
            hNormales: 0,
            hExtras: 0,
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
  }, [empresa, inicioISO, finISO, nombres]);

  React.useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = rows.filter((r) =>
    r.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

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
              <TableHead className="text-right">Salario Base</TableHead>
              <TableHead className="text-right">Valor Hora</TableHead>
              <TableHead className="text-right">H. Normales</TableHead>
              <TableHead className="text-right">H. Extra Diurnas</TableHead>
              <TableHead className="text-right">H. Extra Nocturnas</TableHead>
              <TableHead className="text-right">H. Dominicales</TableHead>
              <TableHead className="text-right">Recargos (h)</TableHead>
              <TableHead className="text-right">Total Neto</TableHead>
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
                  {r.hNormales?.toFixed(2) ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  {r.hExtrasDiurnas?.toFixed(2) ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  {r.hExtrasNocturnas?.toFixed(2) ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  {r.hDominicales?.toFixed(2) ?? 0}
                </TableCell>
                <TableCell className="text-right">
                  {r.recargosH?.toFixed(2) ?? 0}
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

      <p className="text-xs text-muted-foreground">
        *H. Normales = sumatoria horas base. *H. Extras = todas las horas extra
        (diurna/nocturna/dominical). *Recargos = horas normales con recargo
        (nocturnas/festivas/dominicales).
      </p>

      <Dialog
        open={!!detalleEmpleado}
        onOpenChange={() => setDetalleEmpleado(null)}
      >
        <DialogContent className="max-w-2xl bg-white text-black rounded-2xl shadow-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold">
              Detalle del empleado
            </DialogTitle>
            <DialogDescription>
              Jornadas registradas, tanto manuales como automáticas.
            </DialogDescription>
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
                      ? j.horaInicioReal?.toDate?.().toLocaleTimeString() ||
                        j.historial?.find((h: any) => h.accion === "inicio")
                          ?.hora
                      : j.horaEntrada;
                    const fin = esAutomatica
                      ? j.horaFinReal?.toDate?.().toLocaleTimeString() ||
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
                              <p>
                                💰 Valor Día: $
                                {j.valorTotalDia?.toLocaleString() || 0}
                              </p>
                            </>
                          )}

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
