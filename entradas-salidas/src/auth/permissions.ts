// src/auth/permissions.ts
export type Rol = "admin" | "empleado";

export const PERMS = {
    VER_RESUMEN: "ver_resumen",
    VER_USUARIOS: "ver_usuarios",
    CRUD_USUARIOS: "crud_usuarios",
    VER_CALCULAR: "ver_calcular",
    CREAR_FICHAJE: "crear_fichaje",
    CERRAR_FICHAJE: "cerrar_fichaje",
    VER_NOMINA: "ver_nomina",
    EXPORTAR_NOMINA: "exportar_nomina",
    CONFIGURAR: "configurar",
} as const;

export const ROLE_PERMS: Record<Rol, string[]> = {
    admin: [
        PERMS.VER_RESUMEN, PERMS.VER_USUARIOS, PERMS.CRUD_USUARIOS,
        PERMS.VER_CALCULAR, PERMS.CREAR_FICHAJE, PERMS.CERRAR_FICHAJE,
        PERMS.VER_NOMINA, PERMS.EXPORTAR_NOMINA, PERMS.CONFIGURAR,
    ],
    empleado: [
        PERMS.VER_RESUMEN, PERMS.VER_CALCULAR, PERMS.CREAR_FICHAJE, PERMS.CERRAR_FICHAJE,
        // sin nómina global ni usuarios
    ],
};
