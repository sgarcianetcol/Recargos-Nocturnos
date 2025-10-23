import * as React from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { Empleado } from "@/models/usuarios.model";
import { TurnoBase } from "@/models/config.model";
import { EmpleadoService } from "@/services/usuariosService";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { esFestivoColombia } from "@/services/festivos.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { crearJornadaCalculada } from "@/services/jornada.service";

export default function CalcularJornadaPage() {
    const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
    const [turnos, setTurnos] = React.useState<TurnoBase[]>([]);
    const [nominaCfg, setNominaCfg] = React.useState<{ horasLaboralesMes: number } | null>(null);
    const [recargos, setRecargos] = React.useState<any>(null);
    const [rules, setRules] = React.useState<any>(null);

    const [userId, setUserId] = React.useState("");
    const [fecha, setFecha] = React.useState("");
    const [turnoId, setTurnoId] = React.useState("");

    const [preview, setPreview] = React.useState<null | {
        empleado: Empleado;
        turno: TurnoBase;
        esDF: boolean;
        tarifa: number;
        horas: any;
        valores: any;
    }>(null);

    React.useEffect(() => {
        (async () => {
            const [emps, trn, nom, rec, rls] = await Promise.all([
                EmpleadoService.listar(),
                TurnosService.listar(),
                ConfigNominaService.getNomina(),
                ConfigNominaService.getRecargos(),
                ConfigNominaService.getRules(),
            ]);
            setEmpleados(emps);
            setTurnos(trn);
            setNominaCfg(nom);
            setRecargos(rec);
            setRules(rls);
        })();
    }, []);

    // Calcula en vivo cada vez que cambian entradas
    React.useEffect(() => {
        (async () => {
            if (!nominaCfg || !recargos || !rules) return;
            const emp = empleados.find(e => e.id === userId);
            const trn = turnos.find(t => t.id === turnoId);
            if (!emp || !trn || !fecha) { setPreview(null); return; }

            const d = new Date(`${fecha}T00:00:00`);
            const esDomingo = d.getDay() === 0;
            const esFestivo = await esFestivoColombia(fecha);
            const esDF = esDomingo || esFestivo;

            const calc = calcularDiaBasico(
                emp.salarioBaseMensual,
                nominaCfg,
                recargos,
                rules,
                { fecha, horaEntrada: trn.horaEntrada, horaSalida: trn.horaSalida, esDominicalFestivo: esDF }
            );

            setPreview({
                empleado: emp,
                turno: trn,
                esDF,
                tarifa: calc.tarifaHoraAplicada,
                horas: calc.horas,
                valores: calc.valores,
            });
        })();
    }, [userId, fecha, turnoId, empleados, turnos, nominaCfg, recargos, rules]);

    const guardar = async () => {
        const emp = empleados.find(e => e.id === userId);
        if (!emp || !fecha || !turnoId) return alert("Completa los campos.");
        const id = await crearJornadaCalculada({ empleado: emp, fecha, turnoId });
        alert(`Jornada guardada: ${id}`);
    };

    return (

        <div className="max-w-4xl space-y-6">
            <h1 className="text-2xl font-semibold">Calcular jornada</h1>

            {/* Filtros / Entradas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-sm mb-1">Empleado</label>
                    <select className="w-full border p-2 rounded"
                        value={userId} onChange={(e) => setUserId(e.target.value)}>
                        <option value="">Seleccione…</option>
                        {empleados.map(e => <option key={e.id} value={e.id}>{e.nombre} — {e.empresa}</option>)}
                    </select>
                </div>

                <div>
                    <label className="block text-sm mb-1">Fecha</label>
                    <input type="date" className="w-full border p-2 rounded"
                        value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </div>

                <div>
                    <label className="block text-sm mb-1">Turno</label>
                    <select className="w-full border p-2 rounded"
                        value={turnoId} onChange={(e) => setTurnoId(e.target.value)}>
                        <option value="">Seleccione…</option>
                        {turnos.map(t => <option key={t.id} value={t.id}>{t.id} — {t.horaEntrada} a {t.horaSalida}</option>)}
                    </select>
                </div>
            </div>

            {/* Vista previa */}
            {!preview && (
                <div className="text-sm text-gray-500">Completa los campos para ver el cálculo…</div>
            )}

            {preview && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section className="p-4 border rounded-lg">
                        <h2 className="font-semibold mb-3">Parámetros aplicados</h2>
                        <ul className="text-sm space-y-1">
                            <li><b>Empleado:</b> {preview.empleado.nombre}</li>
                            <li><b>Fecha:</b> {fecha} {preview.esDF ? "— Dominical/Festivo" : ""}</li>
                            <li><b>Turno:</b> {preview.turno.id} ({preview.turno.horaEntrada}–{preview.turno.horaSalida})</li>
                            <li><b>Tarifa hora:</b> ${preview.tarifa.toLocaleString("es-CO")}</li>
                            <li><b>Horas base/día:</b> {rules?.baseDailyHours}</li>
                        </ul>
                    </section>

                    <section className="p-4 border rounded-lg">
                        <h2 className="font-semibold mb-3">Totales $</h2>
                        <div className="text-3xl font-bold">
                            ${preview.valores.valorTotalDia.toLocaleString("es-CO")}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Suma de normales, recargos y extras.
                        </p>
                    </section>

                    <section className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-2">Horas</h3>
                        <table className="w-full text-sm">
                            <tbody className="[&>tr>td]:py-1">
                                <tr><td>Normales</td><td className="text-right">{preview.horas.horasNormales}</td></tr>
                                <tr><td>Rec. Nocturno Ordinario</td><td className="text-right">{preview.horas.recargoNocturnoOrdinario}</td></tr>
                                <tr><td>Rec. Festivo Diurno</td><td className="text-right">{preview.horas.recargoFestivoDiurno}</td></tr>
                                <tr><td>Rec. Festivo Nocturno</td><td className="text-right">{preview.horas.recargoFestivoNocturno}</td></tr>
                                <tr><td>Extras Diurnas</td><td className="text-right">{preview.horas.extrasDiurnas}</td></tr>
                                <tr><td>Extras Nocturnas</td><td className="text-right">{preview.horas.extrasNocturnas}</td></tr>
                                <tr><td>Extras Diurnas Dominical</td><td className="text-right">{preview.horas.extrasDiurnasDominical}</td></tr>
                                <tr><td>Extras Nocturnas Dominical</td><td className="text-right">{preview.horas.extrasNocturnasDominical}</td></tr>
                                <tr className="font-semibold border-t"><td>Total horas</td><td className="text-right">{preview.horas.totalHoras}</td></tr>
                            </tbody>
                        </table>
                    </section>

                    <section className="p-4 border rounded-lg">
                        <h3 className="font-semibold mb-2">Valores ($)</h3>
                        <table className="w-full text-sm">
                            <tbody className="[&>tr>td]:py-1">
                                <tr><td>Horas Normales</td><td className="text-right">${preview.valores.valorHorasNormales.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Rec. Noct. Ordinario</td><td className="text-right">${preview.valores.valorRecargoNocturnoOrdinario.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Rec. Festivo Diurno</td><td className="text-right">${preview.valores.valorRecargoFestivoDiurno.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Rec. Festivo Nocturno</td><td className="text-right">${preview.valores.valorRecargoFestivoNocturno.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Extras Diurnas</td><td className="text-right">${preview.valores.valorExtrasDiurnas.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Extras Nocturnas</td><td className="text-right">${preview.valores.valorExtrasNocturnas.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Extras Diurnas Dominical</td><td className="text-right">${preview.valores.valorExtrasDiurnasDominical.toLocaleString("es-CO")}</td></tr>
                                <tr><td>Extras Nocturnas Dominical</td><td className="text-right">${preview.valores.valorExtrasNocturnasDominical.toLocaleString("es-CO")}</td></tr>
                                <tr className="font-semibold border-t"><td>Total</td><td className="text-right">${preview.valores.valorTotalDia.toLocaleString("es-CO")}</td></tr>
                            </tbody>
                        </table>
                    </section>
                </div>
            )}

            <div className="flex gap-3">
                <button
                    className="px-4 py-2 bg-black text-white rounded disabled:opacity-50"
                    disabled={!preview}
                    onClick={guardar}
                >
                    Guardar jornada
                </button>
                <span className="text-xs text-gray-500 self-center">
                    (Al guardar, se persiste el desglose y el total en /jornadas)
                </span>
            </div>
        </div>
    );
}
