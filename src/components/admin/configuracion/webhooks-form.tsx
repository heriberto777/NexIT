"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { guardarWebhooksSchema, type GuardarWebhooksInput } from "@/lib/zod/configuracion.schema";
import { guardarWebhooks } from "@/server/actions/admin/configuracion/guardar-webhooks";
import { probarWebhookAction } from "@/server/actions/admin/configuracion/probar-integraciones";
import { generarWebhookSecret } from "@/server/actions/admin/configuracion/generar-webhook-secret";
import { Button } from "@/components/ui/button";

export interface WebhooksValues {
  webhookUrl: string;
  webhooksHabilitados: boolean;
  tieneWebhookSecret: boolean;
}

export function WebhooksForm({ valores }: { valores: WebhooksValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPendingPrueba, startPrueba] = useTransition();
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [isPendingGenerar, startGenerar] = useTransition();
  const [secretoRecienGenerado, setSecretoRecienGenerado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<GuardarWebhooksInput>({
    resolver: zodResolver(guardarWebhooksSchema),
    defaultValues: { webhookUrl: valores.webhookUrl, webhooksHabilitados: valores.webhooksHabilitados, webhookSecret: "" },
  });

  function generarSecreto() {
    setCopiado(false);
    startGenerar(async () => {
      const resultado = await generarWebhookSecret();
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setValue("webhookSecret", resultado.data.secreto, { shouldDirty: true });
      setSecretoRecienGenerado(true);
    });
  }

  async function copiarSecreto() {
    try {
      await navigator.clipboard.writeText(getValues("webhookSecret") ?? "");
      setCopiado(true);
    } catch {
      // Portapapeles bloqueado (permiso denegado, contexto no seguro, etc.) — el
      // secreto sigue visible en el input de texto para copiarlo a mano.
    }
  }

  async function onSubmit(values: GuardarWebhooksInput) {
    setError(null);
    setGuardado(false);
    const resultado = await guardarWebhooks(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setGuardado(true);
    setSecretoRecienGenerado(false);
    setCopiado(false);
    router.refresh();
  }

  function probar() {
    setResultadoPrueba(null);
    startPrueba(async () => {
      const resultado = await probarWebhookAction();
      setResultadoPrueba(resultado.ok ? resultado.data : { ok: false, mensaje: resultado.error });
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

      <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-sm font-medium text-gray-700">Webhooks habilitados</span>
        <input type="checkbox" {...register("webhooksHabilitados")} className="h-4 w-4 rounded border-gray-300" />
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">URL del Webhook (n8n)</label>
        <input {...register("webhookUrl")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="https://n8n.tuempresa.com/webhook/nexit-events" />
        {errors.webhookUrl && <p className="mt-1 text-xs text-red-600">{errors.webhookUrl.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Secreto {valores.tieneWebhookSecret && <span className="text-xs font-normal text-gray-400">(configurado — deja vacío para no cambiarlo)</span>}
        </label>
        <div className="flex gap-2">
          <input
            type={secretoRecienGenerado ? "text" : "password"}
            {...register("webhookSecret")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
            placeholder={valores.tieneWebhookSecret ? "••••••••" : ""}
          />
          {secretoRecienGenerado && (
            <Button type="button" variant="secondary" onClick={copiarSecreto}>
              {copiado ? "Copiado" : "Copiar"}
            </Button>
          )}
          <Button type="button" variant="secondary" disabled={isPendingGenerar} onClick={generarSecreto}>
            {isPendingGenerar ? "Generando..." : "Generar"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-gray-400">Firma cada request con HMAC-SHA256 (header X-NexIT-Signature) y también viaja como Bearer token.</p>
        {secretoRecienGenerado && (
          <p className="mt-1 text-xs text-amber-700">
            Copialo a la variable <span className="font-mono">WEBHOOK_SECRET</span> de tu instancia de n8n y luego guardá los cambios para activarlo
            — no vuelve a mostrarse una vez guardado.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="secondary" onClick={probar} disabled={isPendingPrueba}>
          {isPendingPrueba ? "Enviando..." : "Probar webhook"}
        </Button>
      </div>

      {resultadoPrueba && (
        <p className={`rounded-lg px-3 py-2 text-sm ${resultadoPrueba.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
          {resultadoPrueba.mensaje}
        </p>
      )}
    </form>
  );
}
