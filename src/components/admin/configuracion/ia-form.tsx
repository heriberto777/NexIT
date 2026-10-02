"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { guardarIaSchema, type GuardarIaInput } from "@/lib/zod/configuracion.schema";
import { guardarIa } from "@/server/actions/admin/configuracion/guardar-ia";
import { probarIaAction } from "@/server/actions/admin/configuracion/probar-integraciones";
import { Button } from "@/components/ui/button";

export interface IaValues {
  iaProveedor: "ANTHROPIC" | "OPENAI" | "LOCAL";
  iaModelo: string;
  iaBaseUrl: string;
  iaHabilitada: boolean;
  tieneIaApiKey: boolean;
}

const MODELO_PLACEHOLDER: Record<IaValues["iaProveedor"], string> = {
  ANTHROPIC: "claude-opus-5-5",
  OPENAI: "gpt-4o-mini",
  LOCAL: "llama3.1",
};

export function IaForm({ valores }: { valores: IaValues }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPendingPrueba, startPrueba] = useTransition();
  const [resultadoPrueba, setResultadoPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<GuardarIaInput>({
    resolver: zodResolver(guardarIaSchema),
    defaultValues: { ...valores, iaApiKey: "" },
  });

  const proveedor = watch("iaProveedor");

  async function onSubmit(values: GuardarIaInput) {
    setError(null);
    setGuardado(false);
    const resultado = await guardarIa(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setGuardado(true);
    router.refresh();
  }

  function probar() {
    setResultadoPrueba(null);
    startPrueba(async () => {
      const resultado = await probarIaAction();
      setResultadoPrueba(resultado.ok ? resultado.data : { ok: false, mensaje: resultado.error });
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {guardado && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">Guardado correctamente.</p>}

      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">Asistente IA de Soporte</p>
        <p className="mb-3 text-xs text-gray-400">
          Chat de IA dentro del wizard de ejecución, para que el técnico consulte el problema del ticket. Elegí el
          proveedor según la API key que tengas — también podés apuntar a un modelo local (Ollama, LM Studio u otro
          servidor compatible con la API de OpenAI).
        </p>
      </div>

      <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
        <span className="text-sm font-medium text-gray-700">Asistente habilitado</span>
        <input type="checkbox" {...register("iaHabilitada")} className="h-4 w-4 rounded border-gray-300" />
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor</label>
        <select {...register("iaProveedor")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="ANTHROPIC">Anthropic (Claude)</option>
          <option value="OPENAI">OpenAI</option>
          <option value="LOCAL">Modelo local (Ollama, LM Studio, etc.)</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            API key {valores.tieneIaApiKey && <span className="text-xs font-normal text-gray-400">(configurada — deja vacío para no cambiarla)</span>}
          </label>
          <input
            type="password"
            {...register("iaApiKey")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={proveedor === "LOCAL" ? "Opcional en la mayoría de los servidores locales" : "sk-..."}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Modelo</label>
          <input {...register("iaModelo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={MODELO_PLACEHOLDER[proveedor]} />
          {errors.iaModelo && <p className="mt-1 text-xs text-red-600">{errors.iaModelo.message}</p>}
        </div>
      </div>

      {(proveedor === "LOCAL" || proveedor === "OPENAI") && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            URL del servidor {proveedor === "OPENAI" && <span className="text-xs font-normal text-gray-400">(opcional — solo si usás un proxy o Azure OpenAI)</span>}
          </label>
          <input
            {...register("iaBaseUrl")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={proveedor === "LOCAL" ? "http://localhost:11434/v1" : "https://api.openai.com/v1"}
          />
          {errors.iaBaseUrl && <p className="mt-1 text-xs text-red-600">{errors.iaBaseUrl.message}</p>}
        </div>
      )}

      <div className="flex items-center gap-3 border-t border-gray-100 pt-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar cambios"}
        </Button>
        <Button type="button" variant="secondary" onClick={probar} disabled={isPendingPrueba}>
          {isPendingPrueba ? "Probando..." : "Probar conexión"}
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
