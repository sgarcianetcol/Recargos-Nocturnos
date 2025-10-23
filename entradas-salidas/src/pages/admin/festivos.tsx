import * as React from "react";
import DashboardLayout from "@/layouts/DashboardLayout";
import { cachearFestivosAnio, hayFestivosEnAnio } from "@/services/festivos.service";

export default function AdminFestivos() {
    const [year, setYear] = React.useState<string>(String(new Date().getFullYear()));
    const [status, setStatus] = React.useState<string>("");

    async function precalentar() {
        setStatus("Verificando…");
        const y = Number(year);
        const existe = await hayFestivosEnAnio(y);
        if (existe) {
            setStatus(`Ya hay festivos en ${y}.`);
            return;
        }
        setStatus("Cargando festivos del año…");
        await cachearFestivosAnio(y);
        setStatus(`Listo: festivos ${y} cacheados.`);
    }

    return (
        <DashboardLayout>
            <div className="space-y-4 max-w-md">
                <h1 className="text-xl font-semibold">Festivos de Colombia</h1>
                <div className="flex gap-2">
                    <input
                        type="number"
                        className="border p-2 w-40"
                        value={year}
                        onChange={(e) => setYear(e.target.value)}
                    />
                    <button onClick={precalentar} className="px-4 py-2 bg-black text-white rounded">
                        Precalentar año
                    </button>
                </div>
                {status && <p className="text-sm text-gray-600">{status}</p>}
                <p className="text-xs text-gray-500">
                    Tip: aunque este botón no es obligatorio (el sistema cachea “on-the-fly”),
                    sirve para dejar todo el año listo de una vez.
                </p>
            </div>
        </DashboardLayout>
    );
}
