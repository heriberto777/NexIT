"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { marcarFacturacionCotizacion } from "@/server/actions/admin/marcar-facturacion-cotizacion";
import { marcarFacturacionRepuesto } from "@/server/actions/admin/marcar-facturacion-repuesto";

type EstadoFacturacion = "PENDIENTE" | "FACTURADO";

const ESTILO: Record<EstadoFacturacion, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800 hover:bg-amber-200",
  FACTURADO: "bg-green-100 text-green-800 hover:bg-green-200",
};

const ETIQUETA: Record<EstadoFacturacion, string> = {
  PENDIENTE: "Pendiente de facturar",
  FACTURADO: "Facturado",
};

interface Props {
  id: string;
  tipo: "COTIZACION" | "REPUESTO";
  estadoInicial: EstadoFacturacion;
}

// Mismo patrón optimista que ContratoCard: setea de una vez, revierte si la Server
// Action falla, router.refresh() en éxito para resincronizar KPIs/filtros del padre.
export function ToggleFacturacion({ id, tipo, estadoInicial }: Props) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoFacturacion>(estadoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alternar() {
    if (guardando) return;
    setError(null);
    const anterior = estado;
    const siguiente: EstadoFacturacion = anterior === "PENDIENTE" ? "FACTURADO" : "PENDIENTE";
    setEstado(siguiente);
    setGuardando(true);
    const accion = tipo === "COTIZACION" ? marcarFacturacionCotizacion : marcarFacturacionRepuesto;
    const resultado = await accion({ id, estadoFacturacion: siguiente });
    setGuardando(false);
    if (!resultado.ok) {
      setEstado(anterior);
      setError(resultado.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={guardando}
        onClick={alternar}
        title="Click para cambiar"
        className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold disabled:opacity-60 ${ESTILO[estado]}`}
      >
        {guardando ? "Guardando..." : ETIQUETA[estado]}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
