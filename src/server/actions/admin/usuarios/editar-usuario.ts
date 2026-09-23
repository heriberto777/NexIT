"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { editarUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { EditarUsuarioInput } from "@/lib/zod/usuario.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function editarUsuario(input: EditarUsuarioInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar usuarios`);
  }

  const { id, nombre, email, rol, clienteId, especialidad } = editarUsuarioSchema.parse(input);

  const conFlictoEmail = await prisma.usuario.findFirst({ where: { email, NOT: { id } } });
  if (conFlictoEmail) {
    throw new Error("Ya existe otro usuario con ese correo");
  }

  const actualizado = await prisma.usuario.update({
    where: { id },
    data: {
      nombre,
      email,
      rol,
      clienteId: rol === "CLIENTE" ? clienteId : null,
      especialidad: rol === "TECNICO" ? especialidad : null,
    },
  });

  return { id: actualizado.id };
}
