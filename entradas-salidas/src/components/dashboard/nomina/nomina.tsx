import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { periodoActual } from "@/utils/periodo";

import { db } from "@/lib/firebase";
import { collectionGroup, getDocs, orderBy, query, where } from "firebase/firestore";
import { Empresa, JornadaDoc, NominaRow } from "@/models/jornada.model";

export default function NominaResumen() {
    const { inicioISO, finISO } = React.useMemo(() => periodoActual(), []);
    const [empresa, setEmpresa] = React.useState<Empresa | "TODAS">("TODAS");
    const [busqueda, setBusqueda] = React.useState("");
    const [rows, setRows] = React.useState<NominaRow[]>([]);
    const [loading, setLoading] = React.useState(false);

    // Mapa id->nombre (si en tu doc jornada ya guardas nombre, puedes omitir esta parte y usarlo directo)
    const [nombres, setNombres] = React.useState<Record<string, string>>({});

    React.useEffect(() => {
        (async () => {
            // opcional: precarga nombres desde /usuarios para mostrar en la tabla
            const { getDocs, collection } = await import("firebase/firestore"); // dynamic import para evitar ssr issues
            const snap = await getDocs(collection(db, "usuarios"));
            const map: Record<string, string> = {};
            snap.forEach(d => { map[d.id] = (d.data() as any).nombre ?? d.id; });
            setNombres(map);
        })();
    }, []);

    const cargar = React.useCallback(async () => {
        setLoading(true);
        try {
            // construye query a collectionGroup("jornadas")
            const base = [
                where("fecha", ">=", inicioISO),
                where("fecha", "<=", finISO),
                orderBy("fecha", "asc"),
            ];
            const q = empresa === "TODAS"
                ? query(collectionGroup(db, "jornadas"), ...base)
                : query(collectionGroup(db, "jornadas"), where("empresa", "==", empresa), ...base);

            const snap = await getDocs(q);
            const list: JornadaDoc[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as JornadaDoc) }));

            // agrupar por userId
            const map = new Map<string, NominaRow>();
            for (const j of list) {
                const r = map.get(j.userId) ?? {
                    userId: j.userId,
                    nombre: nombres[j.userId] ?? j.userId,
                    hNormales: 0, hExtras: 0, recargosH: 0, total$: 0
                };

                r.hNormales += j.horasNormales ?? 0;
                r.hExtras += (j.extrasDiurnas + j.extrasNocturnas + j.extrasDiurnasDominical + j.extrasNocturnasDominical);
                r.recargosH += (j.recargoNocturnoOrdinario + j.recargoFestivoDiurno + j.recargoFestivoNocturno);
                r.total$ += j.valorTotalDia ?? 0;

                map.set(j.userId, r);
            }
            setRows([...map.values()]);
        } finally {
            setLoading(false);
        }
    }, [empresa, inicioISO, finISO, nombres]);

    React.useEffect(() => { cargar(); }, [cargar]);

    const filtrados = rows.filter(r =>
        r.nombre.toLowerCase().includes(busqueda.toLowerCase())
    );

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
        XLSX.writeFile(wb, `nomina_${inicioISO}_a_${finISO}.xlsx`);
    };

    return (
        <div className="p-6 space-y-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold text-center">
                    NÓMINA DEL {formatear(inicioISO)} – {formatear(finISO)}
                </h1>
            </header>

            <div className="flex flex-wrap gap-3 items-center">
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
                <Button variant="outline" onClick={exportar}>Exportar Excel</Button>
            </div>

            <div className="border rounded-md overflow-hidden">
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
                                <TableCell className="text-right">{round(r.hNormales)}</TableCell>
                                <TableCell className="text-right">{round(r.hExtras)}</TableCell>
                                <TableCell className="text-right">{round(r.recargosH)}</TableCell>
                                <TableCell className="text-right">{money(r.total$)}</TableCell>
                                <TableCell>
                                    <Button>Detalle</Button>
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
        </div>
    );
}

// ——— Helpers de formato
function round(n: number, d = 2) { return Number(n || 0).toFixed(d); }
function money(n: number) {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n || 0);
}
function formatear(iso: string) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }).replace(".", "");
}