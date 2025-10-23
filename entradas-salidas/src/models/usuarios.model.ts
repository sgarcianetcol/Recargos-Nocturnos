export type Rol = "admin" | "lider" | "empleado";
export type Empresas = "NETCOL" | "TRIANGULUM" | "INTEEGRA";

export interface Empleado {
    id: string;                    // uid de Firebase Auth
    nombre: string;
    correo: string;
    rol: Rol;
    activo: boolean;
    salarioBaseMensual: number;
    documento?: string;
    area?: string;
    empresa: Empresas;
    proyectos?: string[];
    creadoEn: Date;                // ojo: en Firestore es Timestamp -> convertir a Date en el cliente
}
