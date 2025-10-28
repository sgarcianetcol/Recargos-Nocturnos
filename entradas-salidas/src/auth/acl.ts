import { ROLE_PERMS } from "./permissions";
import type { Rol } from "./permissions";

export function hasPerm(rol: Rol, perm: string) {
    return ROLE_PERMS[rol]?.includes(perm) ?? false;
}