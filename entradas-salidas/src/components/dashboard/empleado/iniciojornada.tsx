import React from "react";
import { Button } from "@/components/ui/button";
import { Play, Square } from "lucide-react";

export default function InicioJornadaView() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Inicio de Jornada</h1>

      <div className="bg-white shadow rounded-xl p-6 flex flex-col gap-4">
        <Button className="w-full flex items-center gap-2">
          <Play size={18} /> Iniciar Jornada
        </Button>

        <Button className="w-full bg-red-500 hover:bg-red-600 flex items-center gap-2">
          <Square size={18} /> Finalizar Jornada
        </Button>
      </div>
    </div>
  );
}
