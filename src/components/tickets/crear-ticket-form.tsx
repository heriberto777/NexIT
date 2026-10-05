"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearTicketSchema, type CrearTicketInput } from "@/lib/zod/ticket.schema";
import { crearTicket } from "@/server/actions/tickets/crear-ticket";
import { buscarContactosCliente } from "@/server/actions/tickets/buscar-contactos-cliente";
import { Button } from "@/components/ui/button";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";

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
interface SistemaSoftware {
  id: string;
  nombre: string;
}
interface Cliente {
  id: string;
  nombre: string;
  sucursales: Sucursal[];
  sistemasSoftware: SistemaSoftware[];
}

interface ContactoInicial {
  id: string;
  nombre: string;
  empresaReportada: string | null;
  correo: string;
  telefono: string | null;
  motivo: string;
}

const TIPOS = [
  { value: "CORRECTIVO", label: "Correctivo — algo se dañó" },
  { value: "INSTALACION", label: "Instalación — equipo nuevo" },
  { value: "PREVENTIVO", label: "Preventivo — mantenimiento manual" },
] as const;

// Solo para la rama "Equipo" — ver mismo comentario en nuevo-ticket-wizard.tsx (portal).
const TIPOS_EQUIPO = [
  { value: "HARDWARE", label: "Hardware / Equipos" },
  { value: "INFRAESTRUCTURA", label: "Infraestructura / Redes" },
  { value: "ELECTRICO_ENERGIA", label: "Eléctrico / Energía (UPS, plantas, tableros)" },
  { value: "CLIMATIZACION", label: "Climatización (A/C de sala de servidores)" },
  { value: "IMPRESION", label: "Impresión (impresoras, escáneres, consumibles)" },
  { value: "SEGURIDAD_FISICA", label: "Seguridad física (cámaras, control de acceso)" },
] as const;

const SISTEMAS_GENERICOS = [
  { value: "SISTEMA_OPERATIVO", label: "Sistema operativo" },
  { value: "OFICINA", label: "Suite de oficina (Office, etc.)" },
] as const;

const PRIORIDADES = [
  { value: "BAJA", label: "Baja" },
  { value: "MEDIA", label: "Media" },
  { value: "ALTA", label: "Alta" },
  { value: "CRITICA", label: "Crítica" },
] as const;

export function CrearTicketForm({ clientes, contactoInicial }: { clientes: Cliente[]; contactoInicial?: ContactoInicial | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [tipoProblema, setTipoProblema] = useState<"EQUIPO" | "SISTEMA">("EQUIPO");
  const [sinActivo, setSinActivo] = useState(false);
  const [sistemaSeleccion, setSistemaSeleccion] = useState("");
  const [sinSistema, setSinSistema] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ContactoEncontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [contactoSeleccionado, setContactoSeleccionado] = useState<ContactoEncontrado | null>(null);
  // Si venimos de /admin/contactos-pendientes, el contacto siempre es "nuevo" — ya
  // tiene sus datos recolectados por chat, no tiene sentido buscarlo (todavía no existe).
  const [modoNuevoContacto, setModoNuevoContacto] = useState(Boolean(contactoInicial));

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CrearTicketInput>({
    resolver: zodResolver(crearTicketSchema),
    defaultValues: {
      tipo: "CORRECTIVO",
      categoriaSoporte: "HARDWARE",
      prioridad: "MEDIA",
      descripcion: contactoInicial?.motivo,
      contactoPendienteId: contactoInicial?.id,
      contactoNuevo: contactoInicial
        ? { nombre: contactoInicial.nombre, email: contactoInicial.correo, whatsapp: contactoInicial.telefono ?? undefined }
        : undefined,
    },
  });

  const clienteId = watch("clienteId");
  const sucursalId = watch("sucursalId");
  const sucursalesDelCliente = clientes.find((c) => c.id === clienteId)?.sucursales ?? [];
  const activosDeSucursal = sucursalesDelCliente.find((s) => s.id === sucursalId)?.activos ?? [];
  const sistemasDelCliente = clientes.find((c) => c.id === clienteId)?.sistemasSoftware ?? [];

  function cambiarTipoProblema(tipo: "EQUIPO" | "SISTEMA") {
    setTipoProblema(tipo);
    if (tipo === "EQUIPO") {
      setValue("sistemaSoftwareId", undefined);
      setValue("sistemaNoCatalogado", undefined);
      setSistemaSeleccion("");
      setSinSistema(false);
      setValue("categoriaSoporte", "HARDWARE");
    } else {
      setValue("activoId", undefined);
      setValue("ubicacionNoCatalogada", undefined);
      setSinActivo(false);
      setValue("categoriaSoporte", "SOFTWARE");
    }
  }

  function onSistemaChange(value: string) {
    setSistemaSeleccion(value);
    const generico = SISTEMAS_GENERICOS.find((g) => g.value === value);
    if (generico) {
      setValue("sistemaSoftwareId", undefined);
      setValue("sistemaNoCatalogado", generico.label);
      setValue("categoriaSoporte", "SOFTWARE_SISTEMA");
    } else if (value) {
      setValue("sistemaSoftwareId", value);
      setValue("sistemaNoCatalogado", undefined);
      setValue("categoriaSoporte", "SOFTWARE_TERCEROS");
    } else {
      setValue("sistemaSoftwareId", undefined);
      setValue("sistemaNoCatalogado", undefined);
    }
  }

  function activarSinSistema() {
    setSinSistema(true);
    setSistemaSeleccion("");
    setValue("sistemaSoftwareId", undefined);
    setValue("sistemaNoCatalogado", "");
    setValue("categoriaSoporte", "SOFTWARE");
  }

  function desactivarSinSistema() {
    setSinSistema(false);
    setValue("sistemaNoCatalogado", undefined);
  }

  function cambiarCliente(v: string) {
    setValue("clienteId", v, { shouldValidate: true });
    if (!contactoInicial) resetContacto();
  }

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
      queueMicrotask(() => setResultados([]));
      return;
    }
    queueMicrotask(() => setBuscando(true));
    const timeout = setTimeout(() => {
      buscarContactosCliente({ clienteId, query: busqueda.trim() })
        .then((resultado) => setResultados(resultado.ok ? resultado.data : []))
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
    const resultado = await crearTicket(values);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    router.push(`/tickets/${resultado.data.id}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {contactoInicial && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ Dice ser de <strong>{contactoInicial.empresaReportada ?? "empresa no especificada"}</strong> — confirmá
          vos cuál es el cliente real antes de continuar, ese dato no está verificado.
        </p>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
        <ComboboxBuscable
          value={clienteId ?? ""}
          onChange={cambiarCliente}
          placeholder="Selecciona un cliente..."
          options={clientes.map((c) => ({ value: c.id, label: c.nombre }))}
        />
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
        <ComboboxBuscable
          value={watch("sucursalId") ?? ""}
          onChange={(v) => setValue("sucursalId", v, { shouldValidate: true })}
          disabled={!clienteId}
          placeholder="Selecciona una sede..."
          options={sucursalesDelCliente.map((s) => ({ value: s.id, label: s.nombre }))}
        />
        {errors.sucursalId && <p className="mt-1 text-xs text-red-600">{errors.sucursalId.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">¿Qué presenta el problema?</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => cambiarTipoProblema("EQUIPO")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tipoProblema === "EQUIPO" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"
            }`}
          >
            Equipo
          </button>
          <button
            type="button"
            onClick={() => cambiarTipoProblema("SISTEMA")}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              tipoProblema === "SISTEMA" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"
            }`}
          >
            Sistema
          </button>
        </div>
      </div>

      {tipoProblema === "EQUIPO" ? (
        !sinActivo ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Equipo (opcional)</label>
            <ComboboxBuscable
              value={watch("activoId") ?? ""}
              onChange={(v) => setValue("activoId", v, { shouldValidate: true })}
              disabled={!sucursalId}
              placeholder="Selecciona un equipo..."
              options={activosDeSucursal.map((a) => ({ value: a.id, label: a.label }))}
            />
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
        )
      ) : !sinSistema ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Sistema (opcional)</label>
          <ComboboxBuscable
            value={sistemaSeleccion}
            onChange={onSistemaChange}
            disabled={!clienteId}
            placeholder="Selecciona un sistema..."
            options={[
              ...sistemasDelCliente.map((s) => ({ value: s.id, label: s.nombre, grupo: "Sistemas del cliente" })),
              ...SISTEMAS_GENERICOS.map((g) => ({ value: g.value, label: g.label, grupo: "General" })),
            ]}
          />
          <button type="button" onClick={activarSinSistema} className="mt-1 text-xs text-blue-600 underline">
            No sé cuál es / no está en la lista
          </button>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Describe el sistema</label>
          <input
            {...register("sistemaNoCatalogado")}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Ej. Sistema de facturación del proveedor X"
          />
          <button type="button" onClick={desactivarSinSistema} className="mt-1 text-xs text-blue-600 underline">
            Mejor elegir de la lista
          </button>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 ${tipoProblema === "EQUIPO" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
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
        {tipoProblema === "EQUIPO" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Categoría</label>
            <select {...register("categoriaSoporte")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {TIPOS_EQUIPO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
