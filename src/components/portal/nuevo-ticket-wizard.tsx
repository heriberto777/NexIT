"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearTicketPortalSchema, type CrearTicketPortalInput } from "@/lib/zod/portal.schema";
import { crearTicketPortal } from "@/server/actions/portal/crear-ticket";
import { Button } from "@/components/ui/button";

interface Sucursal {
  id: string;
  nombre: string;
}
interface Activo {
  id: string;
  sucursalId: string;
  label: string;
}

const CATEGORIAS = [
  { value: "SOFTWARE", label: "Software / Sistemas" },
  { value: "HARDWARE", label: "Hardware / Equipos" },
  { value: "INFRAESTRUCTURA", label: "Infraestructura / Redes" },
] as const;

const PRIORIDADES = [
  { value: "BAJA", label: "Baja — puede esperar" },
  { value: "MEDIA", label: "Media — afecta el trabajo diario" },
  { value: "ALTA", label: "Alta — bloquea una tarea importante" },
  { value: "CRITICA", label: "Crítica — operación detenida" },
] as const;

export function NuevoTicketWizard({ sucursales, activos }: { sucursales: Sucursal[]; activos: Activo[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [sinActivo, setSinActivo] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    formState: { errors },
  } = useForm<CrearTicketPortalInput>({
    resolver: zodResolver(crearTicketPortalSchema),
    defaultValues: { categoriaSoporte: "HARDWARE", prioridadPercibida: "MEDIA" },
  });

  const sucursalId = watch("sucursalId");
  const activosDeSucursal = activos.filter((a) => a.sucursalId === sucursalId);

  async function irAPaso2() {
    if (await trigger("sucursalId")) setStep(2);
  }

  function irAPaso3() {
    setStep(3);
  }

  async function onSubmit(values: CrearTicketPortalInput) {
    setError(null);
    setEnviando(true);
    try {
      const { id } = await crearTicketPortal(values);

      for (const foto of fotos) {
        const formData = new FormData();
        formData.append("file", foto);
        formData.append("tipo", "OTRO");
        await fetch(`/api/tickets/${id}/evidencias`, { method: "POST", body: formData });
      }

      router.push(`/portal/tickets/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <nav className="flex gap-1">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-blue-600" : "bg-gray-200"}`} />
        ))}
      </nav>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">1. ¿En qué sede ocurre el problema?</h2>
            <div className="space-y-2">
              {sucursales.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50"
                >
                  <input type="radio" value={s.id} {...register("sucursalId")} />
                  {s.nombre}
                </label>
              ))}
            </div>
            {errors.sucursalId && <p className="text-xs text-red-600">{errors.sucursalId.message}</p>}
            <Button type="button" onClick={irAPaso2} className="w-full">
              Continuar
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">2. ¿Qué equipo está afectado?</h2>
            {!sinActivo ? (
              <>
                <select {...register("activoId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Selecciona un equipo...</option>
                  {activosDeSucursal.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setSinActivo(true)} className="text-xs text-blue-600 underline">
                  No sé cuál es / no está en la lista
                </button>
              </>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium text-gray-700">Describe el equipo o la ubicación</label>
                <input
                  {...register("ubicacionNoCatalogada")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. Impresora de recepción, 2do piso"
                />
                <button type="button" onClick={() => setSinActivo(false)} className="text-xs text-blue-600 underline">
                  Mejor elegir de la lista
                </button>
              </>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} className="flex-1">
                Atrás
              </Button>
              <Button type="button" onClick={irAPaso3} className="flex-1">
                Continuar
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-900">3. Cuéntanos qué pasa</h2>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Asunto</label>
              <input {...register("titulo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="El UPS no enciende" />
              {errors.titulo && <p className="mt-1 text-xs text-red-600">{errors.titulo.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Descripción del problema</label>
              <textarea
                {...register("descripcion")}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Describe qué observas, desde cuándo, y cualquier detalle que ayude al técnico..."
              />
              {errors.descripcion && <p className="mt-1 text-xs text-red-600">{errors.descripcion.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
                <select {...register("categoriaSoporte")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Urgencia</label>
                <select {...register("prioridadPercibida")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                  {PRIORIDADES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Fotos (opcional)</label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
                className="w-full text-sm"
              />
              {fotos.length > 0 && <p className="mt-1 text-xs text-gray-500">{fotos.length} foto(s) seleccionada(s)</p>}
            </div>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(2)} className="flex-1" disabled={enviando}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1" disabled={enviando}>
                {enviando ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
