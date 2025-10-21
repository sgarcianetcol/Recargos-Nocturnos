import DashboardLayout from "@/layouts/DashboardLayout";
import UsuariosTable from "../../components/usuarios/UsuariosTable";

export default function EmpleadosPage() {
    return (
        <main className="p-6">
            <DashboardLayout>
                <UsuariosTable />
            </DashboardLayout>

        </main>
    );
}

