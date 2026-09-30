"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearTicketSchema, type CrearTicketInput } from "@/lib/zod/ticket.schema";
import { crearTicket } from "@/server/actions/tickets/crear-ticket";
import { buscarContactosCliente } from "@/server/actions/tickets/buscar-contactos-cliente";
import { Button } from "@/components/ui/button";

interface ContactoEncontrado {
  id: string;
  nombre: string;
  email: string;
  whatsappTelefono: string | null;
}

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

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ContactoEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contactoSeleccionado, setContactoSeleccionado] = useState<ContactoEncontrado | null>(null);
  const [modoNuevoContacto, setModoNuevoContacto] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CrearTicketInput>({
    resolver: zodResolver(crearTicketSchema),
    defaultValues: { tipo: "CORRECTIVO", categoriaSoporte: "HARDWARE", prioridad: "MEDIA" },
  });

  const clienteId = watch("clienteId");
  const sucursalId = watch("sucursalId");
  const sucursalesDelCliente = clientes.find((c) => c.id === clienteId)?.sucursales ?? [];
  const activosDeSucursal = sucursalesDelCliente.find((s) => s.id === sucursalId)?.activos ?? [];

  // Cambiar de cliente invalida cualquier contacto ya elegido — buscarlo de nuevo evita
  // enviar un contactoUsuarioId que pertenece a otro cliente.
  function resetContacto() {
    setContactoSeleccionado(null);
    setModoNuevoContacto(false);
    setBusqueda("");
    setResultados([]);
    setValue("contactoUsuarioId", undefined);
    setValue("contactoNuevo", undefined);
  }

  useEffect(() => {
    if (!clienteId || !busqueda.trim() || busqueda.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    const timeout = setTimeout(() => {
      buscarContactosCliente({ clienteId, query: busqueda.trim() })
        .then(setResultados)
        .finally(() => setBuscando(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [clienteId, busqueda]);

  function seleccionarContacto(contacto: ContactoEncontrado) {
    setContactoSeleccionado(contacto);
    setValue("contactoUsuarioId", contacto.id);
    setValue("contactoNuevo", undefined);
  }

  function activarNuevoContacto() {
    setModoNuevoContacto(true);
    setContactoSeleccionado(null);
    setValue("contactoUsuarioId", undefined);
  }

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
        <select
          {...register("clienteId", { onChange: resetContacto })}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Selecciona un cliente...</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        {errors.clienteId && <p className="mt-1 text-xs text-red-600">{errors.clienteId.message}</p>}
      </div>

      {clienteId && (
        <div className="rounded-lg border border-gray-200 p-3">
          <label className="mb-1 block text-sm font-medium text-gray-700">Contacto que reporta</label>

          {contactoSeleccionado ? (
            <div className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-gray-900">{contactoSeleccionado.nombre}</p>
                <p className="text-xs text-gray-600">{contactoSeleccionado.email}</p>
              </div>
              <button type="button" onClick={resetContacto} className="text-xs text-blue-600 underline">
                Cambiar
              </button>
            </div>
          ) : modoNuevoContacto ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <input
                    {...register("contactoNuevo.nombre")}
                    placeholder="Nombre del contacto"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {errors.contactoNuevo?.nombre && <p className="mt-1 text-xs text-red-600">{errors.contactoNuevo.nombre.message}</p>}
                </div>
                <div>
                  <input
                    {...register("contactoNuevo.email")}
                    placeholder="Correo (para su acceso al Portal)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                  {errors.contactoNuevo?.email && <p className="mt-1 text-xs text-red-600">{errors.contactoNuevo.email.message}</p>}
                </div>
              </div>
              <input
                {...register("contactoNuevo.whatsapp")}
                placeholder="WhatsApp (opcional, con código de país)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500">
                Se crea con acceso al Portal y se le avisa por correo{"/"}WhatsApp con una contraseña temporal.
              </p>
              <button type="button" onClick={resetContacto} className="text-xs text-blue-600 underline">
                Mejor buscar uno existente
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o correo..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {buscando && <p className="text-xs text-gray-400">Buscando...</p>}
              {resultados.length > 0 && (
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                  {resultados.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => seleccionarContacto(c)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <p className="font-medium text-gray-900">{c.nombre}</p>
                        <p className="text-xs text-gray-500">{c.email}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {busqueda.trim().length >= 2 && !buscando && resultados.length === 0 && (
                <p className="text-xs text-gray-400">No hay contactos que coincidan.</p>
              )}
              <button type="button" onClick={activarNuevoContacto} className="text-xs text-blue-600 underline">
                + Es un contacto nuevo
              </button>
            </div>
          )}
          {errors.contactoUsuarioId && <p className="mt-1 text-xs text-red-600">{errors.contactoUsuarioId.message}</p>}
        </div>
      )}

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
