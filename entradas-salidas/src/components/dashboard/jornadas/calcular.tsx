import * as React from "react";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Empleado } from "@/models/usuarios.model";
import { TurnoBase, RecargosConfig, JornadaRules } from "@/models/config.model";
import { EmpleadoService } from "@/services/usuariosService";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { crearJornadaCalculada } from "@/services/jornada.service";
import { FaUser, FaClock } from "react-icons/fa";
import { Calendar } from "@/components/ui/calendar";
import { esDominicalOFestivo } from "@/services/festivos.service";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";

export default function CalcularJornadaPage() {
  const [empleados, setEmpleados] = React.useState<Empleado[]>([]);
  const [turnos, setTurnos] = React.useState<TurnoBase[]>([]);
  const [nominaCfg, setNominaCfg] = React.useState<{
    horasLaboralesMes: number;
  } | null>(null);
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
    const filteredHoras = Object.fromEntries(
      Object.entries(preview.horas).filter(
        ([k]) => k !== "Hora laboral ordinaria"
      )
    );
    const filteredValores = Object.fromEntries(
      Object.entries(preview.valores).filter(
        ([k]) => k !== "Valor Hora laboral ordinaria"
      )
    );
    const headers = [
      "Empleado",
      "Fecha",
      "Turno",
      ...Object.keys(filteredHoras),
      ...Object.keys(filteredValores),
    ];

    sheet.addRow(headers);

    // 🟢 Datos en la segunda fila
    const data = [
      preview.empleado.nombre,
      fecha?.toLocaleDateString("es-CO"),
      `${preview.turno.id} (${preview.turno.horaEntrada}–${preview.turno.horaSalida})`,
      ...Object.values(filteredHoras),
      ...Object.values(filteredValores),
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
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(
      blob,
      `Jornada_${preview.empleado.nombre}_${fecha?.toLocaleDateString(
        "es-CO"
      )}.xlsx`
    );
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
      if (!nominaCfg || !recargos || !rules || !userId || !fecha) return;

      try {
        console.log("🟦 Iniciando cálculo de jornada...");
        console.log("➡ userId:", userId);
        console.log("➡ Fecha seleccionada:", fecha);

        const emp = empleados.find((e) => e.id === userId);
        if (!emp) {
          console.warn("⚠ No se encontró empleado con ese userId");
          setPreview(null);
          return;
        }
        console.log("👤 Empleado encontrado:", emp.nombre);

        // Convertimos la fecha a formato para buscar en Firestore
        const year = fecha.getFullYear();
        const monthIndex = fecha.getMonth(); // 0..11
        const day = String(fecha.getDate()).padStart(2, "0");
        const mm = String(monthIndex + 1).padStart(2, "0");

        const monthId = `${year}_${mm}`;
        const dayId = day;

        console.log(
          `🗓 Buscando malla -> usuarios/${userId}/malla/${monthId}/dias/${dayId}`
        );

        // 🟢 Traer turno desde Firestore
        const ref = doc(
          db,
          "usuarios",
          userId,
          "malla",
          monthId,
          "dias",
          dayId
        );
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          console.warn(
            "⚠ No se encontró turno asignado para ese día en Firestore"
          );
          setPreview(null);
          return;
        }

        const data = snap.data();
        console.log("📄 Datos obtenidos desde Firestore:", data);

        const turnoAsignado = data.turno;
        console.log("🕓 Turno asignado (Firestore):", turnoAsignado);

        if (!turnoAsignado) {
          console.warn("⚠ El día no tiene turno definido en la malla");
          setPreview(null);
          return;
        }

        console.log("🔍 Lista completa de turnos disponibles:", turnos);
        console.log(
          "🔍 Lista de IDs de turnos:",
          turnos.map((t) => t.id)
        );
        console.log(
          "🔍 Lista de nombres de turnos:",
          turnos.map((t) => t.nombre)
        );

        // Intentamos buscar por ID o por nombre
        const trn = turnos.find(
          (t) => t.id === turnoAsignado || t.nombre === turnoAsignado
        );

        if (!trn) {
          console.warn("⚠ El turno asignado no existe en la lista de turnos");
          console.log("🔎 Valor buscado:", turnoAsignado);
          setPreview(null);
          return;
        }

        console.log("✅ Turno encontrado:", trn);

        // Set turnoId for saving
        setTurnoId(trn.id);

        // Revisamos si es domingo o festivo
        const fechaStr = fecha.toISOString().split("T")[0];
        const esDF = await esDominicalOFestivo(fechaStr);
        console.log("📅 Domingo/Festivo:", esDF);

        // 🟣 Ahora sí calcular
        const calc = calcularDiaBasico(
          emp.salarioBaseMensual,
          nominaCfg,
          recargos,
          rules,
          {
            fecha: fechaStr,
            horaEntrada: trn.horaEntrada,
            horaSalida: trn.horaSalida,
            esDominicalFestivo: esDF,
            recargosActivos: emp.recargosActivos ?? true,
          }
        );

        console.log("🧮 Resultado del cálculo:", calc);

        // Actualizamos el preview
        setPreview({
          empleado: emp,
          turno: trn,
          esDF,
          tarifa: calc.tarifaHoraAplicada,
          horas: calc.horas,
          valores: calc.valores,
        });

        console.log("✅ Preview actualizado correctamente");
      } catch (error) {
        console.error("❌ Error al obtener turno de Firestore:", error);
        setPreview(null);
      }
    })();
  }, [userId, fecha, empleados, turnos, nominaCfg, recargos, rules]);

  const guardar = async () => {
    const emp = empleados.find((e) => e.id === userId);
    if (!emp || !fecha || !turnoId) return alert("Completa los campos.");
    const fechaStr = fecha.toISOString().split("T")[0];

    // Verificar si ya existe una jornada para esta fecha
    const jornadasRef = collection(db, "usuarios", userId, "jornadas");
    const q = query(jornadasRef, where("fecha", "==", fechaStr));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      alert(
        "Ya existe una jornada creada para esta fecha. No se pueden crear duplicados."
      );
      return;
    }

    const id = await crearJornadaCalculada({
      empleado: emp,
      fecha: fechaStr,
      turnoId,
    });
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
                {fecha
                  ? fecha.toLocaleDateString("es-CO")
                  : "Seleccione fecha…"}
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
            <FaClock className="text-gray-500" /> Turno
          </label>

          <div className="w-full max-w-sm">
            <div
              className={`w-full h-10 px-3 flex items-center justify-center border rounded-xl text-sm font-medium ${
                preview?.turno
                  ? "bg-white text-gray-800 border-gray-300"
                  : "bg-gray-100 text-gray-400 border-gray-200 italic"
              }`}
            >
              {preview?.turno
                ? `${preview.turno.id} — ${preview.turno.horaEntrada} a ${preview.turno.horaSalida}`
                : "Sin turno asignado para esta fecha"}
            </div>
          </div>
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
            <h2 className="font-semibold mb-3 text-gray-800">
              Parámetros aplicados
            </h2>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>
                <b>Empleado:</b> {preview.empleado.nombre}
              </li>
              <li>
                <b>Fecha:</b> {fecha?.toLocaleDateString("es-CO")}{" "}
                {preview.esDF && "— Dominical/Festivo"}
              </li>
              <li>
                <b>Turno:</b> {preview.turno.id} ({preview.turno.horaEntrada}–
                {preview.turno.horaSalida})
              </li>

              <li>
                <b>Horas base/día:</b> {rules?.baseDailyHours}
              </li>
            </ul>
          </section>

          {/* Total día */}
          <section className="p-4 rounded-2xl shadow-lg  from-indigo-50 to-indigo-100 flex flex-col justify-center items-center">
            <h2 className="text-lg font-semibold mb-2 text-indigo-700">
              Total Día $
            </h2>
            <div className="text-3xl font-bold text-indigo-800">
              $
              {preview?.valores?.["Valor Total Día"]?.toLocaleString("es-CO") ??
                "0"}
            </div>

            <p className="text-xs mt-1 text-indigo-600 text-center">
              Suma de normales, recargos y extras.
            </p>
          </section>

          {/* Horas */}
          <section className="p-4 rounded-2xl shadow-lg bg-white">
            <h3 className="font-semibold mb-2 text-gray-700">Horas</h3>
            <table className="w-full text-sm">
              <tbody className="[&>tr>td]:py-1">
                {Object.entries(preview.horas)
                  .filter(([k]) => k !== "Hora laboral ordinaria")
                  .map(([k, v]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="text-right">{String(v)}</td>
                    </tr>
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
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="text-right">
                      ${Number(v).toLocaleString("es-CO")}
                    </td>
                  </tr>
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
