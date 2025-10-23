// src/services/jornada.service.ts
import { db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { esFestivoColombia } from "@/services/festivos.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import type { Empleado } from "@/models/usuarios.model";

export async function crearJornadaCalculada(opts: {
    empleado: Empleado;
    fecha: string;    // "YYYY-MM-DD"
    turnoId: string;  // "M8" | "T8" | ...
}) {
    const { empleado, fecha, turnoId } = opts;

    // Config, turno, reglas
    const [turno, nominaCfg, recargosCfg, rules] = await Promise.all([
        TurnosService.obtener(turnoId),
        ConfigNominaService.getNomina(),
        ConfigNominaService.getRecargos(),
        ConfigNominaService.getRules(),
    ]);
    if (!turno) throw new Error("Turno no encontrado");

    // Dominical/Festivo
    const d = new Date(`${fecha}T00:00:00`);
    const esDomingo = d.getDay() === 0;
    const esFestivo = await esFestivoColombia(fecha);
    const esDF = esDomingo || esFestivo;

    // Cálculo
    const calc = calcularDiaBasico(
        empleado.salarioBaseMensual,
        nominaCfg,
        recargosCfg,
        rules,
        { fecha, horaEntrada: turno.horaEntrada, horaSalida: turno.horaSalida, esDominicalFestivo: esDF }
    );

    // Armar documento listo para auditoría
    const docData = {
        userId: empleado.id,
        fecha,
        turnoId,
        horaEntrada: turno.horaEntrada,
        horaSalida: turno.horaSalida,
        cruzoMedianoche: turno.horaSalida <= turno.horaEntrada,
        esDominicalFestivo: esDF,

        salarioBaseAplicado: empleado.salarioBaseMensual,
        horasLaboralesMesAplicadas: nominaCfg.horasLaboralesMes,
        tarifaHoraAplicada: calc.tarifaHoraAplicada,
        rulesAplicadas: rules,
        recargosAplicados: recargosCfg,

        // horas
        horasNormales: calc.horas.horasNormales,
        recargoNocturnoOrdinario: calc.horas.recargoNocturnoOrdinario,
        recargoFestivoDiurno: calc.horas.recargoFestivoDiurno,
        recargoFestivoNocturno: calc.horas.recargoFestivoNocturno,
        extrasDiurnas: calc.horas.extrasDiurnas,
        extrasNocturnas: calc.horas.extrasNocturnas,
        extrasDiurnasDominical: calc.horas.extrasDiurnasDominical,
        extrasNocturnasDominical: calc.horas.extrasNocturnasDominical,
        totalHoras: calc.horas.totalHoras,

        // valores
        valorHorasNormales: calc.valores.valorHorasNormales,
        valorRecargoNocturnoOrdinario: calc.valores.valorRecargoNocturnoOrdinario,
        valorRecargoFestivoDiurno: calc.valores.valorRecargoFestivoDiurno,
        valorRecargoFestivoNocturno: calc.valores.valorRecargoFestivoNocturno,
        valorExtrasDiurnas: calc.valores.valorExtrasDiurnas,
        valorExtrasNocturnas: calc.valores.valorExtrasNocturnas,
        valorExtrasDiurnasDominical: calc.valores.valorExtrasDiurnasDominical,
        valorExtrasNocturnasDominical: calc.valores.valorExtrasNocturnasDominical,
        valorTotalDia: calc.valores.valorTotalDia,

        creadoEn: serverTimestamp(),
        estado: "calculado" as const,
    };

    const ref = await addDoc(collection(db, "jornadas"), docData);
    return ref.id;
}
