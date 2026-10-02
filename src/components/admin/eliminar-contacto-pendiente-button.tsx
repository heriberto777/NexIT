"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-provider";
import { eliminarContactoPendiente } from "@/server/actions/admin/contactos-pendientes/eliminar-contacto-pendiente";

export function EliminarContactoPendienteButton({ id, nombre }: { id: string; nombre: string | null }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function eliminar() {
    setError(null);
    const ok = await confirm({
      titulo: "Eliminar contacto pendiente",
      mensaje: `¿Eliminar a "${nombre ?? "este contacto"}"? Úsalo para descartar contactos basura o duplicados — esta acción no se puede deshacer.`,
      textoConfirmar: "Eliminar",
      peligroso: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const resultado = await eliminarContactoPendiente({ id });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={eliminar} disabled={isPending} className="text-xs text-red-600 underline disabled:opacity-50">
        {isPending ? "Eliminando..." : "Eliminar"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
