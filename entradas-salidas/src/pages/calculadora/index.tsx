import DashboardLayout from "@/layouts/DashboardLayout";
import CalcularJornadaPage from "@/components/dashboard/jornadas/calcular";

export default function EmpleadosPage() {
    return (
        <main className="p-6">
            <DashboardLayout>
                <CalcularJornadaPage />
            </DashboardLayout>

        </main>
    );
}

