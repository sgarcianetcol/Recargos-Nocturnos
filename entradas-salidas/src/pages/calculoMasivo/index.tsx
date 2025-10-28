import CalculoMasivo from "@/components/dashboard/CalculoMasivo";
import DashboardLayout from "@/layouts/DashboardLayout";


export default function EmpleadosPage() {
    return (
        <main className="p-6">
            <DashboardLayout>
                <CalculoMasivo />
            </DashboardLayout>

        </main>
    );
}

