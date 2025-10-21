// src/pages/dark-store/index.tsx
import DashboardLayout from "@/layouts/DashboardLayout";
import DashboardAdmin from "@/components/dashboard/dashboardAdmin"; // mejor usa alias @

export default function DarkStorePage() {
    return ( // 👈 ESTE return es obligatorio
        <DashboardLayout>
            <DashboardAdmin />
        </DashboardLayout>
    );
}
