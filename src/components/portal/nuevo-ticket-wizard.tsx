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
interface SistemaSoftware {
  id: string;
  nombre: string;
}

// Solo para la rama "Equipo" — Software/Sistemas se quitó de acá porque ahora esa rama
// tiene su propio flujo (ver SISTEMAS_GENERICOS) y categoriaSoporte se deriva sola.
const TIPOS_EQUIPO = [
  { value: "HARDWARE", label: "Hardware / Equipos" },
  { value: "INFRAESTRUCTURA", label: "Infraestructura / Redes" },
] as const;

// Opciones universales que no dependen de qué tenga instalado cada cliente (a
// diferencia del catálogo `sistemasSoftware`, que sí es por cliente) — no necesitan
// estar en una tabla, son iguales para cualquiera.
const SISTEMAS_GENERICOS = [
  { value: "SISTEMA_OPERATIVO", label: "Sistema operativo" },
  { value: "OFICINA", label: "Suite de oficina (Office, etc.)" },
] as const;

const PRIORIDADES = [
  { value: "BAJA", label: "Baja — puede esperar" },
  { value: "MEDIA", label: "Media — afecta el trabajo diario" },
  { value: "ALTA", label: "Alta — bloquea una tarea importante" },
  { value: "CRITICA", label: "Crítica — operación detenida" },
] as const;

export function NuevoTicketWizard({
  sucursales,
  activos,
  sistemasSoftware,
}: {
  sucursales: Sucursal[];
  activos: Activo[];
  sistemasSoftware: SistemaSoftware[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [tipoProblema, setTipoProblema] = useState<"EQUIPO" | "SISTEMA">("EQUIPO");
  const [sinActivo, setSinActivo] = useState(false);
  const [sistemaSeleccion, setSistemaSeleccion] = useState("");
  const [sinSistema, setSinSistema] = useState(false);
  const [fotos, setFotos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CrearTicketPortalInput>({
    resolver: zodResolver(crearTicketPortalSchema),
    defaultValues: { categoriaSoporte: "HARDWARE", prioridadPercibida: "MEDIA" },
  });

  const sucursalId = watch("sucursalId");
  const activosDeSucursal = activos.filter((a) => a.sucursalId === sucursalId);

  // Cambiar de rama limpia los campos de la otra — evita mandar, por ejemplo, un
  // activoId real junto con un sistemaSoftwareId si el usuario fue y volvió entre las
  // dos opciones antes de enviar.
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

  // El mismo select ofrece tanto el catálogo propio del cliente (un id real) como las
  // dos opciones genéricas universales (SISTEMA_OPERATIVO/OFICINA, que no son ids de
  // nada) — según cuál se eligió, se deriva sola la categoriaSoporte correspondiente.
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
        // FOTO_ANTES, no OTRO: es conceptualmente una foto "antes" (la falla, previa a
        // cualquier intervención) — así aparece sola, sin cambios adicionales, en la
        // sección "Antes" que ya existe en /tickets/[id], en el PDF y en cualquier otra
        // pantalla que filtre evidencias por tipo.
        formData.append("tipo", "FOTO_ANTES");
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
            <h2 className="text-sm font-semibold text-gray-900">2. ¿Qué presenta el problema?</h2>
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

            {tipoProblema === "EQUIPO" ? (
              !sinActivo ? (
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
              )
            ) : !sinSistema ? (
              <>
                <select
                  value={sistemaSeleccion}
                  onChange={(e) => onSistemaChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona un sistema...</option>
                  {sistemasSoftware.length > 0 && (
                    <optgroup label="Sistemas de tu empresa">
                      {sistemasSoftware.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.nombre}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="General">
                    {SISTEMAS_GENERICOS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <button type="button" onClick={activarSinSistema} className="text-xs text-blue-600 underline">
                  No sé cuál es / no está en la lista
                </button>
              </>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium text-gray-700">Describe el sistema</label>
                <input
                  {...register("sistemaNoCatalogado")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. Sistema de facturación del proveedor X"
                />
                <button type="button" onClick={desactivarSinSistema} className="text-xs text-blue-600 underline">
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

            <div className={`grid grid-cols-1 gap-3 ${tipoProblema === "EQUIPO" ? "sm:grid-cols-2" : ""}`}>
              {tipoProblema === "EQUIPO" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Tipo</label>
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
