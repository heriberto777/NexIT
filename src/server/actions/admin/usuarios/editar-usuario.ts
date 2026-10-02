"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";
import { editarUsuarioSchema } from "@/lib/zod/usuario.schema";
import type { EditarUsuarioInput } from "@/lib/zod/usuario.schema";

const ROLES_PERMITIDOS = ["ADMIN"] as const;

export async function editarUsuario(input: EditarUsuarioInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede editar usuarios`);
  }

  const { id, nombre, email, rol, clienteId, especialidadIds } = editarUsuarioSchema.parse(input);

  const conFlictoEmail = await prisma.usuario.findFirst({ where: { email, NOT: { id } } });
  if (conFlictoEmail) {
    throw new Error("Ya existe otro usuario con ese correo");
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
}
