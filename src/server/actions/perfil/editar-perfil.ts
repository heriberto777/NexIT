"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { editarPerfilSchema } from "@/lib/zod/perfil.schema";
import type { EditarPerfilInput } from "@/lib/zod/perfil.schema";
import { ejecutarAccion, type ActionResult } from "@/server/actions/action-result";

// Sin restricción de rol: cualquier usuario autenticado edita solo su propio registro
// (usuario.id de la sesión, nunca un id recibido del cliente) — a diferencia de
// editar-usuario.ts (admin editando a un tercero), acá no hay `id` en el input.
export async function editarPerfil(input: EditarPerfilInput): Promise<ActionResult<{ id: string }>> {
  return ejecutarAccion(async () => {
    const usuario = await requireUsuario();
    const { nombre, telegramChatId, whatsappTelefono } = editarPerfilSchema.parse(input);

    try {
      await prisma.usuario.update({
        where: { id: usuario.id },
        data: { nombre, telegramChatId: telegramChatId ?? null, whatsappTelefono: whatsappTelefono ?? null },
      });
    } catch (error) {
      // P2002: el índice @unique de telegramChatId/whatsappTelefono ya está tomado por
      // otro usuario — mensaje accionable en vez del error crudo de Prisma.
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new Error("Ese Telegram o WhatsApp ya está vinculado a otro usuario");
      }
      throw error;
    }

    return { id: usuario.id };
  });
}
