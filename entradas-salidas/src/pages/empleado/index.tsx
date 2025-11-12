"use client";

import { getAuth } from "firebase/auth";
import DashboardLayout from "@/layouts/DashboardLayout";
import DashboardEmpleado from "@/components/dashboard/empleado/dashboardEmpleado";

export default function EmpleadoPage() {
  const auth = getAuth();
  const usuarioId = auth.currentUser?.uid || "Rs5vtcmR4DVTqSyJPUAQlRlqyxK2";

  return (
    <DashboardLayout>
      <DashboardEmpleado usuarioId={usuarioId} />
    </DashboardLayout>
  );
}
