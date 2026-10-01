"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";

const schema = z.object({ id: z.string().cuid() });

// `updateMany` con usuarioId en el where (en vez de `update` por id solo) evita que
// alguien marque como leída una notificación ajena cambiando el id en el cliente.
export async function marcarNotificacionLeida(input: z.infer<typeof schema>): Promise<void> {
  const usuario = await requireUsuario();
  const { id } = schema.parse(input);
  await prisma.notificacion.updateMany({ where: { id, usuarioId: usuario.id }, data: { leida: true } });
}

export async function marcarTodasNotificacionesLeidas(): Promise<void> {
  const usuario = await requireUsuario();
  await prisma.notificacion.updateMany({ where: { usuarioId: usuario.id, leida: false }, data: { leida: true } });
}
