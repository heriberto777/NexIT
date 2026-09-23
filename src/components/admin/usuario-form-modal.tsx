"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearUsuarioSchema, editarUsuarioSchema, type CrearUsuarioInput, type EditarUsuarioInput } from "@/lib/zod/usuario.schema";
import { crearUsuario } from "@/server/actions/admin/usuarios/crear-usuario";
import { editarUsuario } from "@/server/actions/admin/usuarios/editar-usuario";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ClienteOpcion {
  id: string;
  nombre: string;
}

interface UsuarioExistente {
  id: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "COORDINADOR" | "TECNICO" | "CLIENTE";
  clienteId: string | null;
  especialidad: string | null;
}

// Un solo modal para crear y editar: en modo edición no pide contraseña (eso lo
// resuelve el botón aparte "Resetear contraseña", que genera una temporal).
export function UsuarioFormModal({ clientes, usuarioExistente }: { clientes: ClienteOpcion[]; usuarioExistente?: UsuarioExistente }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esEdicion = Boolean(usuarioExistente);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CrearUsuarioInput | EditarUsuarioInput>({
    resolver: zodResolver(esEdicion ? editarUsuarioSchema : crearUsuarioSchema),
    defaultValues: usuarioExistente
      ? {
          id: usuarioExistente.id,
          nombre: usuarioExistente.nombre,
          email: usuarioExistente.email,
          rol: usuarioExistente.rol,
          clienteId: usuarioExistente.clienteId ?? "",
          especialidad: usuarioExistente.especialidad ?? "",
        }
      : { rol: "TECNICO" },
  });

  const rol = watch("rol");

  async function onSubmit(values: CrearUsuarioInput | EditarUsuarioInput) {
    setError(null);
    try {
      if (esEdicion) {
        await editarUsuario(values as EditarUsuarioInput);
      } else {
        await crearUsuario(values as CrearUsuarioInput);
      }
      setOpen(false);
      if (!esEdicion) reset({ rol: "TECNICO" });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error inesperado");
    }
  }

  return (
    <>
      {esEdicion ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-blue-600 underline">
          Editar
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          + Nuevo usuario
        </Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={esEdicion ? "Editar usuario" : "Nuevo usuario"}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
            <input {...register("nombre")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Nombre completo" />
            {errors.nombre && <p className="mt-1 text-xs text-red-600">{errors.nombre.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
            <input type="email" {...register("email")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="usuario@empresa.com" />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Rol</label>
            <select {...register("rol")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="ADMIN">Admin</option>
              <option value="COORDINADOR">Coordinador</option>
              <option value="TECNICO">Técnico</option>
              <option value="CLIENTE">Cliente</option>
            </select>
          </div>

          {rol === "CLIENTE" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Empresa</label>
              <select {...register("clienteId")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="">Selecciona una empresa</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
              {errors.clienteId && <p className="mt-1 text-xs text-red-600">{errors.clienteId.message}</p>}
            </div>
          )}

          {rol === "TECNICO" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Especialidad (opcional)</label>
              <input {...register("especialidad")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Redes, Electricidad, etc." />
            </div>
          )}

          {!esEdicion && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña inicial</label>
              <input type="password" {...register("password")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Mínimo 8 caracteres" />
              {"password" in errors && errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear usuario"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
