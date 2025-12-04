"use client";

import React, { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { TURNOS_PREDETERMINADOS } from "@/models/turnos.defaults";

import type {
  TurnoBase,
  RecargosConfig,
  JornadaRules,
} from "@/models/config.model";

import { EmpleadoService } from "@/services/usuariosService";
import { TurnosService } from "@/services/turnos.service";
import { ConfigNominaService } from "@/services/config.service";
import { calcularDiaBasico } from "@/services/calculoBasico.service";
import { esDominicalOFestivo } from "@/services/festivos.service";
import type { Empleado } from "@/models/usuarios.model";

// Tipo seguro para la vista previa
interface PreviewData {
  empleado: Empleado;
  turno: TurnoBase;
  esDF: boolean;
  tarifa: number;
  horas: Record<string, unknown>;
  valores: Record<string, number>;
}

export default function DashboardEmpleado({
}: {
  usuarioId: string;
}) {
  // 🔹 Usuario autenticado
  const [user, setUser] = useState<User | null>(null);

  // 🔹 Turno actual
  const [turno, setTurno] = useState<{ turno: string; [key: string]: unknown } | null>(null);
  const [detalleTurno, setDetalleTurno] = useState<TurnoBase | null>(null);

  // 🔹 Estados de carga
  const [loading, setLoading] = useState(true);

  // 🔹 Datos base
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [turnos, setTurnos] = useState<TurnoBase[]>([]);
  const [nominaCfg, setNominaCfg] = useState<{ horasLaboralesMes: number } | null>(null);
  const [recargos, setRecargos] = useState<RecargosConfig | null>(null);
  const [rules, setRules] = useState<JornadaRules | null>(null);

  // 🔹 Preview del cálculo
  const [preview, setPreview] = useState<PreviewData | null>(null);

  // 🔹 Fecha actual
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fecha = new Date();
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  // --- Detectar usuario ---
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser ?? null);
    });
    return () => unsubscribe();
  }, []);

  // --- Cargar configuración base ---
  useEffect(() => {
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

  // --- Cargar turno del día ---
  useEffect(() => {
    if (!user || !nominaCfg || !recargos || !rules) return;

    const fetchTurno = async () => {
      const ref = doc(
        db,
        `usuarios/${user.uid}/malla/${año}_${mes}/dias/${dia}`
      );

      const snap = await getDoc(ref);

      if (snap.exists()) {
        const data = snap.data();

        if (data.turno) {
          setTurno(data as { turno: string; [key: string]: unknown });

          const detalle = TURNOS_PREDETERMINADOS.find(
            (t) => t.id === data.turno
          );
          setDetalleTurno(detalle || null);

          const emp = empleados.find((e) => e.id === user.uid);
          if (!emp) {
            setLoading(false);
            return;
          }

          const turnoAsignado = data.turno;
          const trn = turnos.find(
            (t) => t.id === turnoAsignado || t.nombre === turnoAsignado
          );

          if (!trn) {
            setLoading(false);
            return;
          }

          const fechaStr = fecha.toISOString().split("T")[0];
          const esDF = await esDominicalOFestivo(fechaStr);

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
              recargosActivos: true,
            }
          );

          setPreview({
            empleado: emp,
            turno: trn,
            esDF,
            tarifa: calc.tarifaHoraAplicada,
            horas: calc.horas,
            valores: calc.valores,
          });
        }
      }

      setLoading(false);
    };

    fetchTurno();
  }, [user, empleados, turnos, nominaCfg, recargos, rules, año, mes, dia, fecha]); // fecha NO es necesaria

  // --- Render ---
  if (loading) return <p className="text-center">Cargando turno...</p>;

  if (!turno)
    return (
      <p className="text-center text-gray-500">
        No tienes turno asignado para hoy.
      </p>
    );

  return (
    <main className="p-6 flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Estado del día</h1>

      <section className="p-6 rounded-2xl shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100 text-center w-full max-w-md">
        <p className="text-lg mb-2">
          <strong>Turno:</strong> {turno.turno}
        </p>
        <p className="text-lg mb-2">
          <strong>Horario:</strong>{" "}
          {detalleTurno
            ? `${detalleTurno.horaEntrada} - ${detalleTurno.horaSalida}`
            : "-"}
        </p>
        <p className="text-lg mb-2">
          <strong>Fecha:</strong> {fecha.toLocaleDateString("es-CO")}
        </p>
      </section>

      {!preview && (
        <div className="text-sm text-gray-500 italic text-center mt-4">
          Calculando pago...
        </div>
      )}

      {preview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 w-full max-w-4xl">
          {/* Parámetros */}
          <section className="p-4 rounded-2xl shadow-lg bg-white">
            <h2 className="font-semibold mb-3 text-gray-800">
              Parámetros aplicados
            </h2>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>
                <b>Empleado:</b> {preview.empleado.nombre}
              </li>
              <li>
                <b>Fecha:</b> {fecha.toLocaleDateString("es-CO")}{" "}
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

          {/* Total del día */}
          <section className="p-4 rounded-2xl shadow-lg bg-gradient-to-br from-indigo-50 to-indigo-100 flex flex-col justify-center items-center">
            <h2 className="text-lg font-semibold mb-2 text-indigo-700">
              Total Día $
            </h2>
            <div className="text-3xl font-bold text-indigo-800">
              $
              {isNaN(preview.valores["Valor Total Día"])
                ? "0"
                : preview.valores["Valor Total Día"].toLocaleString("es-CO")}
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
    </main>
  );
}
