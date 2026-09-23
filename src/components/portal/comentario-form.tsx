"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { agregarComentarioSchema, type AgregarComentarioInput } from "@/lib/zod/portal.schema";
import { agregarComentarioTicket } from "@/server/actions/portal/agregar-comentario";
import { Button } from "@/components/ui/button";

export function ComentarioForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<AgregarComentarioInput>({
    resolver: zodResolver(agregarComentarioSchema),
    defaultValues: { ticketId, mensaje: "" },
  });

  async function onSubmit(values: AgregarComentarioInput) {
    setError(null);
    try {
      await agregarComentarioTicket(values);
      reset({ ticketId, mensaje: "" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <textarea
        {...register("mensaje")}
        rows={2}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        placeholder="Escribe una nota o pregunta para el equipo técnico..."
      />
      <Button type="submit" disabled={isSubmitting} variant="secondary">
        {isSubmitting ? "Enviando..." : "Enviar mensaje"}
      </Button>
    </form>
  );
}
