"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { EditarUsuarioInput } from "@/lib/zod/usuario.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function editarUsuario(input: EditarUsuarioInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
      throw new Error(`Tu rol (${usuario.rol}) no puede editar usuarios`);
    }

    const { id, nombre, email, rol, clienteId, especialidadIds, telegramChatId, whatsappTelefono } = editarUsuarioSchema.parse(input);

    const conFlictoEmail = await prisma.usuario.findFirst({ where: { email, NOT: { id } } });
    if (conFlictoEmail) {
      throw new Error("Ya existe otro usuario con ese correo");
    }
    if (telegramChatId) {
      const conflictoTelegram = await prisma.usuario.findFirst({ where: { telegramChatId, NOT: { id } } });
      if (conflictoTelegram) {
        throw new Error(`Ese Telegram chat id ya está vinculado a ${conflictoTelegram.nombre}`);
      }
    }
    if (whatsappTelefono) {
      const conflictoWhatsapp = await prisma.usuario.findFirst({ where: { whatsappTelefono, NOT: { id } } });
      if (conflictoWhatsapp) {
        throw new Error(`Ese teléfono de WhatsApp ya está vinculado a ${conflictoWhatsapp.nombre}`);
      }
    }

    // deleteMany + create (no un simple `set`, que no existe para una tabla de unión
    // explícita como UsuarioEspecialidad) — reemplaza el conjunto completo en vez de
    // intentar diffear cuáles se agregaron/quitaron.
    const actualizado = await prisma.$transaction(async (tx) => {
      await tx.usuarioEspecialidad.deleteMany({ where: { usuarioId: id } });
      return tx.usuario.update({
        where: { id },
        data: {
          nombre,
          email,
          rol,
          clienteId: rol === "CLIENTE" ? clienteId : null,
          especialidades:
            rol === "TECNICO" && especialidadIds.length > 0
              ? { create: especialidadIds.map((especialidadId) => ({ especialidadId })) }
              : undefined,
          // ?? null (no undefined): un campo dejado en blanco en el modal debe desvincular
          // el canal, no dejar el valor anterior intacto — el formulario siempre manda el
          // estado completo del campo, nunca un patch parcial.
          telegramChatId: telegramChatId ?? null,
          whatsappTelefono: whatsappTelefono ?? null,
        },
      });
    });

    await registrarAuditoria({
      usuario,
      accion: "usuario.editar",
      entidad: "Usuario",
      entidadId: actualizado.id,
      detalle: `Editó a ${nombre} (${email}), rol ${rol}`,
    });

    return { id: actualizado.id };
  });
}
