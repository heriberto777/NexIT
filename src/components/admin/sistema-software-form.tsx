"use client";

import { useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  crearSistemaSoftwareSchema,
  editarSistemaSoftwareSchema,
  type CrearSistemaSoftwareInput,
  type EditarSistemaSoftwareInput,
} from "@/lib/zod/admin.schema";
import { crearSistemaSoftware } from "@/server/actions/admin/crear-sistema-software";
import { editarSistemaSoftware } from "@/server/actions/admin/editar-sistema-software";
import { Button } from "@/components/ui/button";

interface Cliente {
  id: string;
  nombre: string;
}

const ESTADOS = [
  { value: "ACTIVO", label: "Activo" },
  { value: "INACTIVO", label: "Inactivo" },
] as const;

interface Props {
  clientes: Cliente[];
  modoEdicion?: boolean;
  valoresIniciales?: EditarSistemaSoftwareInput;
  // Solo en modo edición — el cliente dueño del sistema no es editable (ver
  // editarSistemaSoftwareSchema, que a propósito no incluye clienteId), así que acá se
  // muestra como dato fijo, no como parte del form.
  clienteNombre?: string;
}

// Mismo patrón dual (crear/editar) que ActivoForm — ver ese componente para el porqué.
export function SistemaSoftwareForm({ clientes, modoEdicion, valoresIniciales, clienteNombre }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CrearSistemaSoftwareInput | EditarSistemaSoftwareInput>({
    resolver: zodResolver(modoEdicion ? editarSistemaSoftwareSchema : crearSistemaSoftwareSchema),
    defaultValues: valoresIniciales ?? { clienteId: "", nombre: "", proveedor: "" },
  });
  // clienteId (solo crear) y estado (solo editar) no son comunes a ambos schemas, así
  // que TypeScript no deja registrarlos directo sobre el tipo unión — se castea el
  // register al tipo del modo correspondiente, cada uno usado solo en su rama de la UI.
  const registerCrear = register as unknown as UseFormRegister<CrearSistemaSoftwareInput>;
  const registerEditar = register as unknown as UseFormRegister<EditarSistemaSoftwareInput>;

  async function onSubmit(values: CrearSistemaSoftwareInput | EditarSistemaSoftwareInput) {
    setError(null);
    try {
      if (modoEdicion) {
        const { id } = await editarSistemaSoftware(values as EditarSistemaSoftwareInput);
        router.push(`/admin/sistemas-software/${id}`);
      } else {
        await crearSistemaSoftware(values as CrearSistemaSoftwareInput);
        router.push("/admin/sistemas-software");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/sistemas-software" className="text-sm text-blue-600 underline">
        ← Volver a sistemas de software
      </Link>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {modoEdicion ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{clienteNombre}</p>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
            <select {...registerCrear("clienteId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Selecciona...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {"clienteId" in errors && errors.clienteId && <p className="mt-1 text-xs text-red-600">{errors.clienteId.message}</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nombre del sistema</label>
          <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ej. ERP SAP Business One" />
          {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Proveedor (opcional)</label>
          <input {...register("proveedor")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Ej. SAP" />
        </div>

        {modoEdicion && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
            <select {...registerEditar("estado")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {ESTADOS.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Registrar sistema"}
        </Button>
      </form>
    </div>
  );
}
