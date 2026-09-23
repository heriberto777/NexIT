"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearTicketSchema, type CrearTicketInput } from "@/lib/zod/ticket.schema";
import { crearTicket } from "@/server/actions/tickets/crear-ticket";
import { Button } from "@/components/ui/button";

interface Activo {
  id: string;
  label: string;
}
interface Sucursal {
  id: string;
  nombre: string;
  activos: Activo[];
}
interface Cliente {
  id: string;
  nombre: string;
  sucursales: Sucursal[];
}

const TIPOS = [
  { value: "CORRECTIVO", label: "Correctivo — algo se dañó" },
  { value: "INSTALACION", label: "Instalación — equipo nuevo" },
  { value: "PREVENTIVO", label: "Preventivo — mantenimiento manual" },
] as const;

const CATEGORIAS = [
  { value: "SOFTWARE", label: "Software / Sistemas" },
  { value: "HARDWARE", label: "Hardware / Equipos" },
  { value: "INFRAESTRUCTURA", label: "Infraestructura / Redes" },
] as const;

const PRIORIDADES = [
  { value: "BAJA", label: "Baja" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica" },
] as const;

export function CrearTicketForm({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sinActivo, setSinActivo] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CrearTicketInput>({
    resolver: zodResolver(crearTicketSchema),
    defaultValues: { tipo: "CORRECTIVO", categoriaSoporte: "HARDWARE", prioridad: "MEDIA" },
  });

  const clienteId = watch("clienteId");
  const sucursalId = watch("sucursalId");
  const sucursalesDelCliente = clientes.find((c) => c.id === clienteId)?.sucursales ?? [];
  const activosDeSucursal = sucursalesDelCliente.find((s) => s.id === sucursalId)?.activos ?? [];

  async function onSubmit(values: CrearTicketInput) {
    setError(null);
    try {
      const { id } = await crearTicket(values);
      router.push(`/tickets/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
        <select {...register("clienteId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Selecciona un cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {errors.clienteId && <p className="mt-1 text-xs text-red-600">{errors.clienteId.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Sede</label>
        <select {...register("sucursalId")} disabled={!clienteId} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50">
          <option value="">Selecciona una sede...</option>
          {sucursalesDelCliente.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        {errors.sucursalId && <p className="mt-1 text-xs text-red-600">{errors.sucursalId.message}</p>}
      </div>

      {!sinActivo ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Equipo (opcional)</label>
          <select {...register("activoId")} disabled={!sucursalId} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50">
            <option value="">Selecciona un equipo...</option>
            {activosDeSucursal.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setSinActivo(true)} className="mt-1 text-xs text-blue-600 underline">
            No sé cuál es / no está en la lista
          </button>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Describe el equipo o la ubicación</label>
          <input
            {...register("ubicacionNoCatalogada")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Ej. Impresora de recepción, 2do piso"
          />
          <button type="button" onClick={() => setSinActivo(false)} className="mt-1 text-xs text-blue-600 underline">
            Mejor elegir de la lista
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
          <select {...register("tipo")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Categoría</label>
          <select {...register("categoriaSoporte")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Prioridad</label>
          <select {...register("prioridad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
            {PRIORIDADES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre de quien llamó</label>
          <input {...register("contactoNombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ana Torres" />
          {errors.contactoNombre && <p className="mt-1 text-xs text-red-600">{errors.contactoNombre.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Teléfono de contacto</label>
          <input {...register("contactoTelefono")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="809-555-0100" />
          {errors.contactoTelefono && <p className="mt-1 text-xs text-red-600">{errors.contactoTelefono.message}</p>}
        </div>
      </div>

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
          placeholder="Describe qué reportó el cliente, desde cuándo, y cualquier detalle que ayude al técnico..."
        />
        {errors.descripcion && <p className="mt-1 text-xs text-red-600">{errors.descripcion.message}</p>}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Creando..." : "Crear ticket"}
      </Button>
    </form>
  );
}
