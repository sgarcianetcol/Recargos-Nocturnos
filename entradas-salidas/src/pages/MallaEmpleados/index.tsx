// /pages/MallaEmpleados/index.tsx
import DashboardLayout from "@/layouts/DashboardLayout";
import MallaEmpleadosPage from "@/components/dashboard/Malla/mallaadmin";
export default function MallaEmpleados() {
  return (
    <DashboardLayout>
      <MallaEmpleadosPage />
    </DashboardLayout>
  );
}
