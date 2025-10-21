export type Rol = "admin" | "lider" | "empleado";
export type Empresas = "NETCOL" | "TRIANGULUM" | "INTEEGRA";
export interface Empleado {
    id: string;              // = uid Auth
    nombre: string;
    correo: string;
    rol: Rol;
    activo: boolean;
    // opcionales útiles:
    documento?: string;          // CC/NIT
    area?: string;
    creadoEn: Date;
    empresa: Empresas;    // id de la empresa
    proyectos?: string[];     // ids de proyectos asignados
}