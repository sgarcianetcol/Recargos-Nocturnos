import NominaResumen from "@/components/dashboard/nomina/nomina";
import DashboardLayout from "@/layouts/DashboardLayout";


export default function EmpleadosPage() {
    return (
        <main className="p-6">
            <DashboardLayout>
                <NominaResumen />
            </DashboardLayout>

        </main>
    );
}

