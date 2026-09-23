"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoPlanPreventivo } from "@/server/actions/admin/cambiar-estado-plan-preventivo";

export function TogglePlanEstadoButton({ id, estado }: { id: string; estado: "ACTIVO" | "PAUSADO" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await cambiarEstadoPlanPreventivo({ id, estado: estado === "ACTIVO" ? "PAUSADO" : "ACTIVO" });
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className="text-xs text-gray-500 underline disabled:opacity-50"
    >
      {estado === "ACTIVO" ? "Pausar" : "Reactivar"}
    </button>
  );
}
