"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarEnvioCotizacion } from "@/server/actions/tickets/marcar-envio-cotizacion";
import { Button } from "@/components/ui/button";

type MedioEnvio = "MENSAJERIA" | "UBER" | "OTRO";

const ETIQUETA_MEDIO: Record<MedioEnvio, string> = {
  MENSAJERIA: "Mensajería",
  UBER: "Uber",
  OTRO: "Otro",
};

interface Props {
  cotizacionId: string;
  envioActual: { medioEnvio: MedioEnvio; detalleEnvio: string } | null;
}

export function MarcarEnvioCotizacionButton({ cotizacionId, envioActual }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [medio, setMedio] = useState<MedioEnvio>(envioActual?.medioEnvio ?? "MENSAJERIA");
  const [detalle, setDetalle] = useState(envioActual?.detalleEnvio ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setError(null);
    if (detalle.trim().length < 3) {
      setError("Agregá al menos un dato del envío (guía, código, etc.)");
      return;
    }
    setEnviando(true);
    const resultado = await marcarEnvioCotizacion({ cotizacionId, medioEnvio: medio, detalleEnvio: detalle.trim() });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEditando(false);
    router.refresh();
  }

  if (!editando && envioActual) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-gray-600">
          Enviado por <span className="font-medium">{ETIQUETA_MEDIO[envioActual.medioEnvio]}</span>: {envioActual.detalleEnvio}
        </p>
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-blue-600 underline">
          Editar
        </button>
      </div>
    );
  }

  if (!editando) {
    return (
      <button type="button" onClick={() => setEditando(true)} className="text-xs text-blue-600 underline">
        Marcar como enviado
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <select value={medio} onChange={(e) => setMedio(e.target.value as MedioEnvio)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs">
          <option value="MENSAJERIA">Mensajería</option>
          <option value="UBER">Uber</option>
          <option value="OTRO">Otro</option>
        </select>
      </div>
      <textarea
        value={detalle}
        onChange={(e) => setDetalle(e.target.value)}
        rows={2}
        placeholder="Número de guía, código de viaje, etc."
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
      />
      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
        <Button type="button" className="flex-1" disabled={enviando} onClick={guardar}>
          {enviando ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
}
