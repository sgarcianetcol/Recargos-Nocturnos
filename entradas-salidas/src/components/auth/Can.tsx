import { hasPerm } from "@/auth/acl";
import type { Rol } from "@/auth/permissions";

export default function Can({ need, role, children }: { need: string; role: Rol | null; children: React.ReactNode }) {
    if (!role) return null;
    return hasPerm(role, need) ? <>{children}</> : null;
}