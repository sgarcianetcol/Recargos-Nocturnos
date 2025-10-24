import * as React from "react";
import { Empleado } from "@/models/usuarios.model";
import { TurnoBase, RecargosConfig, JornadaRules } from "@/models/config.model";
import { EmpleadoService } from "@/services/usuariosService";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { esFestivoColombia } from "@/services/festivos.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { crearJornadaCalculada } from "@/services/jornada.service";
import { FaUser, FaClock, FaCalendarAlt } from "react-icons/fa";

// Librerías premium para selects y calendario
import Select from "react-select";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

export default function CalcularJornadaPage() {
  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [turnos, setTurnos] = React.useState<TurnoBase[]>([]);
  const [nominaCfg, setNominaCfg] = React.useState<{ horasLaboralesMes: number } | null>(null);
  const [recargos, setRecargos] = React.useState<RecargosConfig | null>(null);
  const [rules, setRules] = React.useState<JornadaRules | null>(null);

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
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Calcular jornada</h1>

      {/* Filtros / Entradas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

 {/* Empleado */}
<div className="relative">
  <label className="block text-sm font-semibold mb-1 text-gray-700">Empleado</label>
  <div className="relative">
    <Select
      options={empleados.map(e => ({
        value: e.id,
        label: `${e.nombre} — ${e.empresa}`
      }))}
      value={empleados.find(e => e.id === userId) ? {
        value: userId,
        label: `${empleados.find(e => e.id === userId)?.nombre} — ${empleados.find(e => e.id === userId)?.empresa}`
      } : null}
      onChange={(selected) => setUserId(selected ? selected.value : "")}
      placeholder="Seleccione empleado…"
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: 40,
          height: 40,
          borderRadius: 14,
          border: "2px solid transparent",
          background: state.isFocused ? "linear-gradient(90deg, #eef2ff, #e0e7ff)" : "#f9fafb",
          boxShadow: state.isFocused
            ? "0 4px 18px rgba(99,102,241,0.35)"
            : "0 1px 6px rgba(0,0,0,0.08)",
          transition: "all 0.3s",
          padding: "0 40px 0 12px",
          cursor: "pointer",
          fontSize: 14,
        }),
        menu: (base) => ({
          ...base,
          borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#6366f1" : "white",
          color: state.isFocused ? "white" : "#1f2937",
          cursor: "pointer",
          padding: "8px 12px",
          fontSize: 14,
          transition: "all 0.2s",
        }),
        placeholder: (base) => ({
          ...base,
          color: "#9ca3af",
          fontStyle: "italic",
        }),
      }}
    />
    <FaUser className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
  </div>
</div>

{/* Fecha */}
<div className="relative flex flex-col">
  <label className="block text-sm font-semibold mb-2 text-gray-700 text-center">Fecha</label>
  <div className="flex justify-center">
    <DatePicker
      selected={fecha ? new Date(fecha) : null}
      onChange={(date: Date | null) => setFecha(date ? date.toISOString().split("T")[0] : "")}
      className="w-full max-w-xs p-2 rounded-2xl border border-gray-300 shadow-md text-gray-800 font-medium cursor-pointer hover:shadow-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-center"
      placeholderText="Seleccione una fecha…"
      dateFormat="yyyy-MM-dd"
      calendarClassName="shadow-xl rounded-xl border border-gray-200 bg-white"
      dayClassName={() => "hover:bg-indigo-50 transition rounded-full text-center cursor-pointer"}
    />
  </div>
</div>


{/* Turno */}
<div className="relative">
  <label className="block text-sm font-semibold mb-1 text-gray-700">Turno</label>
  <div className="relative">
    <Select
      options={turnos.map(t => ({
        value: t.id,
        label: `${t.id} — ${t.horaEntrada} a ${t.horaSalida}`
      }))}
      value={turnos.find(t => t.id === turnoId) ? {
        value: turnoId,
        label: `${turnos.find(t => t.id === turnoId)?.id} — ${turnos.find(t => t.id === turnoId)?.horaEntrada} a ${turnos.find(t => t.id === turnoId)?.horaSalida}`
      } : null}
      onChange={(selected) => setTurnoId(selected ? selected.value : "")}
      placeholder="Seleccione turno…"
      styles={{
        control: (base, state) => ({
          ...base,
          minHeight: 40,
          height: 40,
          borderRadius: 14,
          border: "2px solid transparent",
          background: state.isFocused ? "linear-gradient(90deg, #eef2ff, #e0e7ff)" : "#f9fafb",
          boxShadow: state.isFocused
            ? "0 4px 18px rgba(99,102,241,0.35)"
            : "0 1px 6px rgba(0,0,0,0.08)",
          transition: "all 0.3s",
          padding: "0 40px 0 12px",
          cursor: "pointer",
          fontSize: 14,
        }),
        menu: (base) => ({
          ...base,
          borderRadius: 12,
          boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }),
        option: (base, state) => ({
          ...base,
          backgroundColor: state.isFocused ? "#6366f1" : "white",
          color: state.isFocused ? "white" : "#1f2937",
          cursor: "pointer",
          padding: "8px 12px",
          fontSize: 14,
          transition: "all 0.2s",
        }),
        placeholder: (base) => ({
          ...base,
          color: "#9ca3af",
          fontStyle: "italic",
        }),
      }}
    />
    <FaClock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
  </div>
</div>
</div>

      {/* Vista previa */}
      {!preview && (
        <div className="text-sm text-gray-500 italic">Completa los campos para ver el cálculo…</div>
      )}

      {preview && (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Tarjeta parámetros */}
      <section className="p-4 rounded-2xl shadow-lg bg-gradient-to-tr from-gray-50 to-gray-100 hover:shadow-2xl transition">
        <h2 className="font-semibold mb-3 text-gray-800">Parámetros aplicados</h2>
        <ul className="text-sm space-y-1 text-gray-700">
          <li><b>Empleado:</b> {preview.empleado.nombre}</li>
          <li><b>Fecha:</b> {fecha} {preview.esDF && "— Dominical/Festivo"}</li>
          <li><b>Turno:</b> {preview.turno.id} ({preview.turno.horaEntrada}–{preview.turno.horaSalida})</li>
          <li><b>Tarifa hora:</b> ${preview.tarifa.toLocaleString("es-CO")}</li>
          <li><b>Horas base/día:</b> {rules?.baseDailyHours}</li>
        </ul>
      </section>

      {/* Tarjeta totales */}
      <section className="p-4 rounded-2xl shadow-lg bg-gradient-to-tr from-indigo-50 to-indigo-100 hover:shadow-2xl transition flex flex-col justify-center items-center">
        <h2 className="text-lg font-semibold mb-2 text-indigo-700">Total Día $</h2>
        <div className="text-3xl font-bold text-indigo-800">
          ${preview.valores.valorTotalDia.toLocaleString("es-CO")}
        </div>
        <p className="text-xs mt-1 text-indigo-600 text-center">Suma de normales, recargos y extras.</p>
      </section>

      {/* Horas */}
      <section className="p-4 rounded-2xl shadow-lg bg-white hover:shadow-2xl transition">
        <h3 className="font-semibold mb-2 text-gray-700">Horas</h3>
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

      {/* Valores */}
      <section className="p-4 rounded-2xl shadow-lg bg-white hover:shadow-2xl transition">
        <h3 className="font-semibold mb-2 text-gray-700">Valores ($)</h3>
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

      {/* Botón guardar */}
      <div className="flex gap-3 mt-4">
        <button
          className="px-4 py-2 bg-indigo-700 text-white font-semibold rounded-xl shadow-md hover:bg-indigo-800 transition disabled:opacity-50"
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
