// /pages/malla/index.tsx
import React from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import MallaInfo from "@/components/dashboard/empleado/mallainfo";

export default function MallaEmpleadoView() {
  return (
    <DashboardLayout>
      <MallaInfo />
    </DashboardLayout>
  );
}
