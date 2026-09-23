"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { generarTicketsPreventivos } from "@/server/actions/admin/generar-tickets-preventivos";
import { Button } from "@/components/ui/button";

export function GenerarTicketsPreventivosButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ id: string; numeroTicket: string; planTitulo: string }[] | null>(null);

  function handleClick() {
    setError(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const { generados } = await generarTicketsPreventivos({});
        setResultado(generados);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Generando..." : "Generar tickets pendientes"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {resultado && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          {resultado.length === 0 ? (
            <p>No hay planes vencidos por ahora — no se generó ningún ticket.</p>
          ) : (
            <>
              <p className="font-medium">{resultado.length} ticket(s) generado(s):</p>
              <ul className="mt-1 list-disc pl-4">
                {resultado.map((r) => (
                  <li key={r.id}>
                    <Link href={`/tickets/${r.id}`} className="underline">
                      #{r.numeroTicket}
                    </Link>{" "}
                    — {r.planTitulo}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
