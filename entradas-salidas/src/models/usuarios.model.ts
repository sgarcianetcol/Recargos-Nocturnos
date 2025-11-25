export type Rol = "admin"  | "empleado";
export type Empresas = "NETCOL" | "TRIANGULUM" | "INTEEGRA";

export interface Empleado {
  id: string; // uid de Firebase Auth
  nombre: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  salarioBaseMensual: number;
  documento?: string;
  area?: string;
  empresa: Empresas;
  proyectos?: string[];
  recargosActivos?: boolean;
  creadoEn: Date; // ojo: en Firestore es Timestamp -> convertir a Date en el cliente
}
