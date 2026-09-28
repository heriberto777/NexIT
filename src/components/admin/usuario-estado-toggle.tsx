"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cambiarEstadoUsuario } from "@/server/actions/admin/usuarios/cambiar-estado-usuario";
import { useConfirm } from "@/components/ui/confirm-provider";

export function UsuarioEstadoToggle({ id, estado }: { id: string; estado: "ACTIVO" | "INACTIVO" }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function alternar() {
    setError(null);
    const nuevoEstado = estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (nuevoEstado === "INACTIVO") {
      const ok = await confirm({
        mensaje: "¿Desactivar este usuario? No podrá iniciar sesión hasta que lo reactives.",
        textoConfirmar: "Desactivar",
        peligroso: true,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        await cambiarEstadoUsuario({ id, estado: nuevoEstado });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={alternar}
        disabled={isPending}
        className={`text-xs underline ${estado === "ACTIVO" ? "text-red-600" : "text-green-700"}`}
      >
        {isPending ? "..." : estado === "ACTIVO" ? "Desactivar" : "Reactivar"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
