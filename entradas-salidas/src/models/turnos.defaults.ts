// src/models/nomina/turnos.defaults.ts
import { TurnoBase } from "./config.model";

export const TURNOS_PREDETERMINADOS: TurnoBase[] = [
  {
    id: "M8",
    nombre: "Mañana 8h",
    horaEntrada: "06:00",
    horaSalida: "14:00",
    duracionHoras: 8,
  },
  {
    id: "T8",
    nombre: "Tarde 8h",
    horaEntrada: "14:00",
    horaSalida: "22:00",
    duracionHoras: 8,
  },
  {
    id: "N8",
    nombre: "Noche 8h",
    horaEntrada: "22:00",
    horaSalida: "06:00",
    duracionHoras: 8,
  },
  {
    id: "D12",
    nombre: "Diurno 12h",
    horaEntrada: "06:00",
    horaSalida: "18:00",
    duracionHoras: 12,
  },
  {
    id: "N12",
    nombre: "Nocturno 12h",
    horaEntrada: "18:00",
    horaSalida: "06:00",
    duracionHoras: 12,
  },
  {
    id: "D",
    nombre: "Descanso",
    horaEntrada: "D",
    horaSalida: "D",
    duracionHoras: 0,
  },
];
