"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearTicketInstalacion } from "@/server/actions/tickets/crear-ticket-instalacion";

interface Props {
  cotizacionId: string;
}

export function CrearTicketInstalacionButton({ cotizacionId }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function crear() {
    setError(null);
    setEnviando(true);
    const resultado = await crearTicketInstalacion({ cotizacionId });
    setEnviando(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.push(`/tickets/${resultado.data.id}`);
  }

  return (
    <div className="space-y-1">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" disabled={enviando} onClick={crear} className="text-xs text-blue-600 underline disabled:opacity-60">
        {enviando ? "Creando..." : "Crear ticket de instalación"}
      </button>
    </div>
  );
}
