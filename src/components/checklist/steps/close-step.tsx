"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  isPending: boolean;
  fotosAntes: number;
  fotosDespues: number;
  firmaCapturada: boolean;
  onFinalizar: (notasInternas: string | undefined) => void;
  onGuardarParaDespues: () => void;
}

export function CloseStep({
  isPending,
  fotosAntes,
  fotosDespues,
  firmaCapturada,
  onFinalizar,
  onGuardarParaDespues,
}: Props) {
  const [notas, setNotas] = useState("");
  const listoParaCerrar = firmaCapturada && fotosAntes > 0 && fotosDespues > 0;

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">6. Cierre</h2>

      <ul className="space-y-1 text-sm text-gray-600">
        <li>{firmaCapturada ? "✓" : "○"} Firma de conformidad</li>
        <li>{fotosAntes > 0 ? "✓" : "○"} Fotos antes ({fotosAntes})</li>
        <li>{fotosDespues > 0 ? "✓" : "○"} Fotos después ({fotosDespues})</li>
      </ul>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Notas internas (uso interno)</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder="No visibles para el cliente"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onGuardarParaDespues} className="flex-1">
          Guardar y continuar después
        </Button>
        <Button
          type="button"
          disabled={!listoParaCerrar || isPending}
          onClick={() => onFinalizar(notas || undefined)}
          className="flex-1"
        >
          {isPending ? "Cerrando..." : "Finalizar Visita"}
        </Button>
      </div>
      {!listoParaCerrar && (
        <p className="text-xs text-amber-600">Completa firma y fotos antes/después para poder cerrar.</p>
      )}
    </section>
  );
}
