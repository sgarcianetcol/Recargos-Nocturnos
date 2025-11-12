// src/pages/configuracion/index.tsx
import DashboardLayout from "@/layouts/DashboardLayout";
import ConfiguracionAdmin from "@/components/configuracion/configuracionAdmin";

export default function ConfiguracionPage() {
  return (
    <DashboardLayout>
      <ConfiguracionAdmin />
    </DashboardLayout>
  );
}
