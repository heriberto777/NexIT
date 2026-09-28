"use client";

import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface OpcionesConfirm {
  titulo?: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligroso?: boolean; // botón rojo — para eliminar/desactivar, no para confirmaciones neutrales
}

type ConfirmFn = (opciones: OpcionesConfirm | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// Reemplaza window.confirm() (bloqueante, sin estilo, imposible de personalizar) por un
// modal consistente con el resto de la app. Un solo provider montado una vez en el
// root layout — cualquier componente cliente llama useConfirm() y hace
// `if (!(await confirm("¿Seguro?"))) return;`, igual de simple que el confirm() nativo
// pero sin bloquear el hilo principal y con la estética de NexIT.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pendiente, setPendiente] = useState<{ opciones: OpcionesConfirm; resolver: (v: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((opciones) => {
    const normalizadas = typeof opciones === "string" ? { mensaje: opciones } : opciones;
    return new Promise<boolean>((resolve) => {
      setPendiente({ opciones: normalizadas, resolver: resolve });
    });
  }, []);

  function responder(valor: boolean) {
    pendiente?.resolver(valor);
    setPendiente(null);
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      {pendiente && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => responder(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={pendiente.opciones.titulo ?? "Confirmar"}
          >
            {pendiente.opciones.titulo && <h2 className="mb-1 text-sm font-semibold text-gray-900">{pendiente.opciones.titulo}</h2>}
            <p className="mb-4 text-sm text-gray-600">{pendiente.opciones.mensaje}</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => responder(false)}>
                {pendiente.opciones.textoCancelar ?? "Cancelar"}
              </Button>
              <Button type="button" variant={pendiente.opciones.peligroso ? "danger" : "primary"} onClick={() => responder(true)}>
                {pendiente.opciones.textoConfirmar ?? "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext>
  );
}

export function useConfirm(): ConfirmFn {
  const confirm = use(ConfirmContext);
  if (!confirm) throw new Error("useConfirm() debe usarse dentro de <ConfirmProvider>");
  return confirm;
}
