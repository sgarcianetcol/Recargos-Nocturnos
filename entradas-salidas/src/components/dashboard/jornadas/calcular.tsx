import * as React from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { Empleado } from "@/models/usuarios.model";
import { TurnoBase, RecargosConfig, JornadaRules } from "@/models/config.model";
import { EmpleadoService } from "@/services/usuariosService";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { esFestivoColombia } from "@/services/festivos.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { crearJornadaCalculada } from "@/services/jornada.service";
import { FaUser, FaClock } from "react-icons/fa";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

export default function CalcularJornadaPage() {
  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [turnos, setTurnos] = React.useState<TurnoBase[]>([]);
  const [nominaCfg, setNominaCfg] = React.useState<{ horasLaboralesMes: number } | null>(null);
  const [recargos, setRecargos] = React.useState<RecargosConfig | null>(null);
  const [rules, setRules] = React.useState<JornadaRules | null>(null);

  const [userId, setUserId] = React.useState("");
  const [fecha, setFecha] = React.useState<Date | undefined>();
  const [turnoId, setTurnoId] = React.useState("");

  const [preview, setPreview] = React.useState<null | {
    empleado: Empleado;
    turno: TurnoBase;
    esDF: boolean;
    tarifa: number;
    horas: any;
    valores: any;
  }>(null);


  const exportarExcel = async () => {
    if (!preview) return;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Jornada");

    // 🟢 Títulos en la primera fila
    const headers = [
      "Empleado",
      "Fecha",
      "Turno",
      "Tarifa hora",
      ...Object.keys(preview.horas),
      ...Object.keys(preview.valores)
    ];

    sheet.addRow(headers);

    // 🟢 Datos en la segunda fila
    const data = [
      preview.empleado.nombre,
      fecha?.toLocaleDateString("es-CO"),
      `${preview.turno.id} (${preview.turno.horaEntrada}–${preview.turno.horaSalida})`,
      preview.tarifa.toLocaleString("es-CO"),
      ...Object.values(preview.horas),
      ...Object.values(preview.valores)
    ];

    sheet.addRow(data);

    // 🎨 Formato de títulos
    headers.forEach((_, i) => {
      const cell = sheet.getCell(1, i + 1);
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.getColumn(i + 1).width = 18; // ajusta el ancho de columnas
    });

    // 📦 Exportar
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `Jornada_${preview.empleado.nombre}_${fecha?.toLocaleDateString("es-CO")}.xlsx`);
  };

  // ✅ Cargar última búsqueda al montar el componente
  React.useEffect(() => {
    const savedData = localStorage.getItem("ultimaBusqueda");
    if (savedData) {
      const { userId, turnoId, fecha, preview } = JSON.parse(savedData);
      if (userId) setUserId(userId);
      if (turnoId) setTurnoId(turnoId);
      if (fecha) setFecha(new Date(fecha));
      if (preview) setPreview(preview);
    }
  }, []);

  // ✅ Guardar cada vez que cambien los datos
  React.useEffect(() => {
    if (userId || turnoId || fecha || preview) {
      const data = {
        userId,
        turnoId,
        fecha: fecha ? fecha.toISOString() : null,
        preview,
      };
      localStorage.setItem("ultimaBusqueda", JSON.stringify(data));
    }
  }, [userId, turnoId, fecha, preview]);


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

      const fechaStr = fecha.toISOString().split("T")[0];
      const esDomingo = fecha.getDay() === 0;
      const esFestivo = await esFestivoColombia(fechaStr);
      const esDF = esDomingo || esFestivo;

      const calc = calcularDiaBasico(
        emp.salarioBaseMensual,
        nominaCfg,
        recargos,
        rules,
        { fecha: fechaStr, horaEntrada: trn.horaEntrada, horaSalida: trn.horaSalida, esDominicalFestivo: esDF }
      );
      console.log("Resultado del cálculo:", calc);

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
    const fechaStr = fecha.toISOString().split("T")[0];
    const id = await crearJornadaCalculada({ empleado: emp, fecha: fechaStr, turnoId });
    alert(`✅ Jornada guardada correctamente (ID: ${id})`);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Calcular jornada</h1>

      {/* Sección de filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">

        {/* Empleado */}
        <div className="space-y-2 flex flex-col items-center">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <FaUser className="text-gray-500" /> Empleado
          </label>
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="w-full max-w-sm rounded-xl">
              <SelectValue placeholder="Seleccione empleado…" />
            </SelectTrigger>
            <SelectContent className="w-full max-w-sm">
              {empleados.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nombre} — {e.empresa}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Fecha */}
        <div className="space-y-2 flex flex-col items-center">
          <label className="text-sm font-semibold text-gray-700 flex justify-center items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-700" />
            Fecha
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-full max-w-sm justify-center rounded-xl border-gray-300"
              >
                {fecha ? fecha.toLocaleDateString("es-CO") : "Seleccione fecha…"}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="center" className="p-2 rounded-xl">
              <Calendar
                mode="single"
                selected={fecha}
                onSelect={setFecha}
                className="rounded-xl"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Turno */}
        <div className="space-y-2 flex flex-col items-center">
          <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <FaClock className="text-gray-500" /> Turnos
          </label>
          <Select value={turnoId} onValueChange={setTurnoId}>
            <SelectTrigger className="w-full max-w-sm rounded-xl">
              <SelectValue placeholder="Seleccione turno…" />
            </SelectTrigger>
            <SelectContent className="w-full max-w-sm">
              {turnos.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.id} — {t.horaEntrada} a {t.horaSalida}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      {/* Vista previa */}
      {!preview && (
        <div className="text-sm text-gray-500 italic text-center mt-4">
          Completa los campos para ver el cálculo…
        </div>
      )}

      {preview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Parámetros */}
          <section className="p-4 rounded-2xl shadow-lg  from-gray-50 to-gray-100">
            <h2 className="font-semibold mb-3 text-gray-800">Parámetros aplicados</h2>
            <ul className="text-sm space-y-1 text-gray-700">
              <li><b>Empleado:</b> {preview.empleado.nombre}</li>
              <li><b>Fecha:</b> {fecha?.toLocaleDateString("es-CO")} {preview.esDF && "— Dominical/Festivo"}</li>
              <li><b>Turno:</b> {preview.turno.id} ({preview.turno.horaEntrada}–{preview.turno.horaSalida})</li>
              <li><b>Tarifa hora:</b> ${preview.tarifa.toLocaleString("es-CO")}</li>
              <li><b>Horas base/día:</b> {rules?.baseDailyHours}</li>
            </ul>
          </section>

          {/* Total día */}
          <section className="p-4 rounded-2xl shadow-lg  from-indigo-50 to-indigo-100 flex flex-col justify-center items-center">
            <h2 className="text-lg font-semibold mb-2 text-indigo-700">Total Día $</h2>
            <div className="text-3xl font-bold text-indigo-800">
              ${preview?.valores?.["Valor Total Día"]?.toLocaleString("es-CO") ?? "0"}
            </div>
            <p className="text-xs mt-1 text-indigo-600 text-center">Suma de normales, recargos y extras.</p>
          </section>

          {/* Horas */}
          <section className="p-4 rounded-2xl shadow-lg bg-white">
            <h3 className="font-semibold mb-2 text-gray-700">Horas</h3>
            <table className="w-full text-sm">
              <tbody className="[&>tr>td]:py-1">
                {Object.entries(preview.horas).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="text-right">{String(v)}</td></tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Valores */}
          <section className="p-4 rounded-2xl shadow-lg bg-white">
            <h3 className="font-semibold mb-2 text-gray-700">Valores ($)</h3>
            <table className="w-full text-sm">
              <tbody className="[&>tr>td]:py-1">
                {Object.entries(preview.valores).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="text-right">${Number(v).toLocaleString("es-CO")}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex flex-wrap gap-3 mt-4">
        <Button
          onClick={guardar}
          disabled={!preview}
          className="bg-indigo-700 hover:bg-indigo-800 text-white font-semibold rounded-xl"
        >
          Guardar jornada
        </Button>

        <Button
          onClick={exportarExcel}
          disabled={!preview}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl"
        >
          Exportar Excel
        </Button>
        <span className="text-xs text-gray-500 self-center">
          (Puedes guardar o exportar la jornada)
        </span>
      </div>

    </div>
  );
}
