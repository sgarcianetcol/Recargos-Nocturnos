// /pages/iniciojornada/index.tsx
import React from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import InicioJornadaView from "@/components/dashboard/empleado/iniciojornada";

export default function InicioJornadaPage() {
  return (
    <DashboardLayout>
      <InicioJornadaView />
    </DashboardLayout>
  );
}
