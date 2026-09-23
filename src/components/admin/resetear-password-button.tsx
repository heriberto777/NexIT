"use client";

import { useState, useTransition } from "react";
import { resetearPasswordUsuario } from "@/server/actions/admin/usuarios/resetear-password-usuario";
import { Modal } from "@/components/ui/modal";

// Muestra la contraseña temporal UNA sola vez, en un modal — después de cerrarlo no
// hay forma de volver a verla desde la interfaz (NexIT no la guarda en texto plano).
export function ResetearPasswordButton({ id, nombre }: { id: string; nombre: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null);

  function resetear() {
    setError(null);
    if (!confirm(`¿Generar una contraseña temporal nueva para ${nombre}? La anterior dejará de funcionar de inmediato.`)) {
      return;
    }
    startTransition(async () => {
      try {
        const { passwordTemporal } = await resetearPasswordUsuario({ id });
        setPasswordTemporal(passwordTemporal);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={resetear} disabled={isPending} className="text-xs text-gray-500 underline">
        {isPending ? "..." : "Resetear contraseña"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}

      <Modal open={passwordTemporal !== null} onClose={() => setPasswordTemporal(null)} title="Contraseña temporal generada">
        <p className="text-sm text-gray-600">
          Comparte esta contraseña con <strong>{nombre}</strong> por un canal seguro. No se volverá a mostrar.
        </p>
        <p className="mt-3 select-all rounded-lg bg-gray-100 px-3 py-2 text-center font-mono text-sm text-gray-900">{passwordTemporal}</p>
      </Modal>
    </>
  );
}
