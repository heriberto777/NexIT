"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoPlanPreventivo } from "@/server/actions/admin/cambiar-estado-plan-preventivo";

export function TogglePlanEstadoButton({ id, estado }: { id: string; estado: "ACTIVO" | "PAUSADO" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const resultado = await cambiarEstadoPlanPreventivo({ id, estado: estado === "ACTIVO" ? "PAUSADO" : "ACTIVO" });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={handleClick}
        className="text-xs text-gray-500 underline disabled:opacity-50"
      >
        {estado === "ACTIVO" ? "Pausar" : "Reactivar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
