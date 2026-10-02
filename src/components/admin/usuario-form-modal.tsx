"use client";

import { useState } from "react";
import { useForm, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { crearUsuarioSchema, editarUsuarioSchema, type CrearUsuarioInput, type EditarUsuarioInput } from "@/lib/zod/usuario.schema";
import { crearUsuario } from "@/server/actions/admin/usuarios/crear-usuario";
import { editarUsuario } from "@/server/actions/admin/usuarios/editar-usuario";
import { cambiarEstadoUsuario } from "@/server/actions/admin/usuarios/cambiar-estado-usuario";
import { resetearPasswordUsuario } from "@/server/actions/admin/usuarios/resetear-password-usuario";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ComboboxBuscable } from "@/components/ui/combobox-buscable";
import { SelectorEtiquetas } from "@/components/ui/selector-etiquetas";
import { useConfirm } from "@/components/ui/confirm-provider";

interface ClienteOpcion {
  id: string;
  nombre: string;
}

interface EspecialidadOpcion {
  id: string;
  nombre: string;
}

interface UsuarioExistente {
  id: string;
  nombre: string;
  email: string;
  rol: "ADMIN" | "COORDINADOR" | "TECNICO" | "CLIENTE";
  clienteId: string | null;
  especialidadIds: string[];
  estado: "ACTIVO" | "INACTIVO";
  telegramChatId: string | null;
  whatsappTelefono: string | null;
}

// Un solo modal para crear y editar: en modo edición no pide contraseña (eso lo
// resuelve el botón aparte "Resetear contraseña", que genera una temporal).
export function UsuarioFormModal({
  clientes,
  especialidades,
  usuarioExistente,
}: {
  clientes: ClienteOpcion[];
  especialidades: EspecialidadOpcion[];
  usuarioExistente?: UsuarioExistente;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esEdicion = Boolean(usuarioExistente);

  // Estado y contraseña NO son parte del form normal: son acciones propias (solo Admin,
  // ver cambiar-estado-usuario.ts/resetear-password-usuario.ts) que se disparan al toque
  // y no dependen de hacer click en "Guardar cambios" — pero viven en este mismo modal
  // para no obligar a abrir 3 controles distintos por usuario.
  const [estadoActual, setEstadoActual] = useState(usuarioExistente?.estado ?? "ACTIVO");
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [reseteandoPassword, setReseteandoPassword] = useState(false);
  const [passwordTemporal, setPasswordTemporal] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
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
          especialidadIds: usuarioExistente.especialidadIds,
          telegramChatId: usuarioExistente.telegramChatId ?? "",
          whatsappTelefono: usuarioExistente.whatsappTelefono ?? "",
        }
      : { rol: "TECNICO", especialidadIds: [] },
  });

  const rol = watch("rol");
  // telegramChatId/whatsappTelefono solo existen en EditarUsuarioInput, no en
  // CrearUsuarioInput — keyof de la unión solo da la intersección de claves, así que
  // hay que castear register para esos dos campos (mismo patrón que SistemaSoftwareForm).
  const registerEditar = register as unknown as UseFormRegister<EditarUsuarioInput>;

  async function onSubmit(values: CrearUsuarioInput | EditarUsuarioInput) {
    setError(null);
    const resultado = esEdicion ? await editarUsuario(values as EditarUsuarioInput) : await crearUsuario(values as CrearUsuarioInput);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setOpen(false);
    if (!esEdicion) reset({ rol: "TECNICO" });
    router.refresh();
  }

  async function alternarEstado() {
    if (!usuarioExistente) return;
    setError(null);
    const nuevoEstado = estadoActual === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    if (nuevoEstado === "INACTIVO") {
      const ok = await confirm({
        mensaje: "¿Desactivar este usuario? No podrá iniciar sesión hasta que lo reactives.",
        textoConfirmar: "Desactivar",
        peligroso: true,
      });
      if (!ok) return;
    }
    setCambiandoEstado(true);
    const resultado = await cambiarEstadoUsuario({ id: usuarioExistente.id, estado: nuevoEstado });
    setCambiandoEstado(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setEstadoActual(nuevoEstado);
    router.refresh();
  }

  async function resetearPassword() {
    if (!usuarioExistente) return;
    setError(null);
    const ok = await confirm({
      mensaje: `¿Generar una contraseña temporal nueva para ${usuarioExistente.nombre}? La anterior dejará de funcionar de inmediato.`,
      textoConfirmar: "Generar",
    });
    if (!ok) return;
    setReseteandoPassword(true);
    const resultado = await resetearPasswordUsuario({ id: usuarioExistente.id });
    setReseteandoPassword(false);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setPasswordTemporal(resultado.data.passwordTemporal);
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

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Empresa {rol !== "CLIENTE" && <span className="font-normal text-gray-400">(opcional)</span>}
            </label>
            <ComboboxBuscable
              value={watch("clienteId") ?? ""}
              onChange={(v) => setValue("clienteId", v, { shouldValidate: true })}
              placeholder="Sin empresa asociada"
              options={[{ value: "", label: "— Ninguna —" }, ...clientes.map((c) => ({ value: c.id, label: c.nombre }))]}
            />
            {errors.clienteId && <p className="mt-1 text-xs text-red-600">{errors.clienteId.message}</p>}
          </div>

          {rol === "TECNICO" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Especialidades (opcional)</label>
              <SelectorEtiquetas
                seleccionadas={watch("especialidadIds") ?? []}
                onChange={(ids) => setValue("especialidadIds", ids, { shouldValidate: true })}
                opciones={especialidades.map((e) => ({ id: e.id, nombre: e.nombre }))}
              />
            </div>
          )}

          {!esEdicion && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña inicial</label>
              <input type="password" {...register("password")} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Mínimo 8 caracteres" />
              {"password" in errors && errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            </div>
          )}

          {esEdicion && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Telegram chat id (opcional)</label>
                <input
                  {...registerEditar("telegramChatId")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Vacío si no está vinculado"
                />
                {"telegramChatId" in errors && errors.telegramChatId && (
                  <p className="mt-1 text-xs text-red-600">{errors.telegramChatId.message as string}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp (opcional)</label>
                <input
                  {...registerEditar("whatsappTelefono")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ej. +18095551234"
                />
                {"whatsappTelefono" in errors && errors.whatsappTelefono && (
                  <p className="mt-1 text-xs text-red-600">{errors.whatsappTelefono.message as string}</p>
                )}
              </div>
            </>
          )}

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear usuario"}
          </Button>

          {esEdicion && usuarioExistente && (
            <div className="space-y-3 border-t border-gray-100 pt-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Estado</p>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      estadoActual === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {estadoActual}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={alternarEstado}
                  disabled={cambiandoEstado}
                  className={`text-xs underline ${estadoActual === "ACTIVO" ? "text-red-600" : "text-green-700"}`}
                >
                  {cambiandoEstado ? "..." : estadoActual === "ACTIVO" ? "Desactivar" : "Reactivar"}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Contraseña</p>
                <button type="button" onClick={resetearPassword} disabled={reseteandoPassword} className="text-xs text-gray-500 underline">
                  {reseteandoPassword ? "..." : "Resetear contraseña"}
                </button>
              </div>
              {passwordTemporal && (
                <div>
                  <p className="text-xs text-gray-500">
                    Comparte esta contraseña con {usuarioExistente.nombre} por un canal seguro. No se volverá a mostrar.
                  </p>
                  <p className="mt-1 select-all rounded-lg bg-gray-100 px-3 py-2 text-center font-mono text-sm text-gray-900">{passwordTemporal}</p>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}
