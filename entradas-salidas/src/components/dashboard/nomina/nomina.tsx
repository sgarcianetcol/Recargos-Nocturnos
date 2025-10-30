"use client";
import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";

import { db } from "@/lib/firebase";
import { collection,Timestamp, collectionGroup, getDocs, orderBy, query, where } from "firebase/firestore";
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

const [jornadasPorEmpleado, setJornadasPorEmpleado] = React.useState<Record<string, JornadaDoc[]>>({});

  const [loading, setLoading] = React.useState(false);
  const [nombres, setNombres] = React.useState<Record<string, string>>({});
  const [detalleEmpleado, setDetalleEmpleado] = React.useState<{ nombre: string; jornadas: JornadaDoc[] } | null>(null);

  // Precarga nombres
  React.useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, "usuarios"));
      const map: Record<string, string> = {};
      snap.forEach(d => { map[d.id] = (d.data() as any).nombre ?? d.id; });
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

       



        const q = empresa === "TODAS"
            ? query(collectionGroup(db, "jornadas"), ...base)
            : query(collectionGroup(db, "jornadas"), where("empresa", "==", empresa), ...base);

        const snap = await getDocs(q);
        console.log(`🔹 Total documentos encontrados en Firestore: ${snap.docs.length}`);
        console.log("📄 Documentos crudos:", snap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Filtrar solo jornadas válidas si quieres (opcional)
        const list: JornadaDoc[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as JornadaDoc) }));

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
                total$: 0
            };

            r.hNormales += j.horasNormales ?? 0;
            r.hExtras += (j.extrasDiurnas + j.extrasNocturnas + j.extrasDiurnasDominical + j.extrasNocturnasDominical);
            r.recargosH += (j.recargoNocturnoOrdinario + j.recargoFestivoDiurno + j.recargoFestivoNocturno);
            r.total$ += j.valorTotalDia ?? 0;

            map.set(j.userId, r);
        }

        console.log(`✅ Jornadas por empleado cargadas para ${map.size} usuarios`);

        setRows([...map.values()]);
        console.log(`✅ Resumen generado con ${map.size} empleados con jornadas`);
        console.log("🔹 Carga finalizada");
    } catch (error) {
        console.error("❌ Error al cargar jornadas:", error);
    } finally {
        setLoading(false);
    }
}, [empresa, inicioISO, finISO, nombres]);




  React.useEffect(() => { cargar(); }, [cargar]);

  const filtrados = rows.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const data = filtrados.map(r => ({
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
        <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="w-36"/>
        <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="w-36"/>
        <Input placeholder="Buscar empleado…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-60"/>
        <Select value={empresa} onValueChange={(v) => setEmpresa(v as any)}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Empresa"/></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas</SelectItem>
            <SelectItem value="NETCOL">NETCOL</SelectItem>
            <SelectItem value="TRIANGULUM">TRIANGULUM</SelectItem>
            <SelectItem value="INTEEGRA">INTEEGRA</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={cargar} disabled={loading}>{loading ? "Cargando…" : "Actualizar"}</Button>
        <Button variant="outline" onClick={exportar}>Exportar Excel</Button>
      </div>

      <div className="border rounded-md overflow-hidden relative">
        {loading && <div className="absolute inset-0 bg-white/50 flex justify-center items-center z-10">
          <div className="loader border-t-4 border-blue-500 rounded-full w-12 h-12 animate-spin"></div>
        </div>}
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
            {filtrados.map(r => (
              <TableRow key={r.userId}>
                <TableCell>{r.nombre}</TableCell>
                <TableCell className="text-right">{Math.round(r.hNormales)}</TableCell>
<TableCell className="text-right">{Math.round(r.hExtras)}</TableCell>
<TableCell className="text-right">{Math.round(r.recargosH)}</TableCell>
<TableCell className="text-right">{money(r.total$)}</TableCell>

                <TableCell>
<Button
  onClick={() => setDetalleEmpleado({
    nombre: r.nombre,
    jornadas: jornadasPorEmpleado[r.userId] ?? []
  })}
>
  Detalle
</Button>

                </TableCell>
              </TableRow>
            ))}
            {filtrados.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Sin resultados para este periodo/filtros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        *H. Normales = sumatoria horas base. *H. Extras = todas las horas extra (diurna/nocturna/dominical). *Recargos = horas normales con recargo (nocturnas/festivas/dominicales).
      </p>

      <Dialog open={!!detalleEmpleado} onOpenChange={() => setDetalleEmpleado(null)}>
        <DialogContent className="max-w-3xl w-full rounded-xl shadow-lg p-6">
          <DialogHeader className="mb-4">
            <DialogTitle>DETALLE: {detalleEmpleado?.nombre}</DialogTitle>
            <DialogClose />
          </DialogHeader>
          <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <table className="w-full text-sm border-collapse">
              <thead>
                  <tr className="border-b bg-gray-100">
                    <th className="px-4 py-2 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-2 text-left font-semibold">Turno</th>

                    <th className="px-4 py-2 text-right font-semibold">Horas Normales</th>
                    <th className="px-4 py-2 text-right font-semibold">Extras</th>
                    <th className="px-4 py-2 text-right font-semibold">Recargos</th>
                    <th className="px-4 py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>

              <tbody>
                {detalleEmpleado?.jornadas.map(j => (
                  <tr key={j.id} className="border-b">
                    <td className="px-2 py-1">{formatear(j.fecha)}</td>
                    <td className="px-2 py-1">{j.turnoId}</td>

                    <td className="px-2 py-1 text-right">{clean(j.horasNormales)}</td>
<td className="px-2 py-1 text-right">{clean(j.extrasDiurnas + j.extrasNocturnas + j.extrasDiurnasDominical + j.extrasNocturnasDominical)}</td>
<td className="px-2 py-1 text-right">{clean(j.recargoNocturnoOrdinario + j.recargoFestivoDiurno + j.recargoFestivoNocturno)}</td>
<td className="px-2 py-1 text-right">{money(j.valorTotalDia)}</td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ——— Helpers
function round(n: number, d = 2) { return Number(n || 0).toFixed(d); }
function money(n: number) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}
function formatear(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}
