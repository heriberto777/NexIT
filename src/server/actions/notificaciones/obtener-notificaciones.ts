"use server";

import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// Lee la campanita del usuario logueado (los 4 roles la usan) — nunca recibe un
// usuarioId por parámetro, así nadie puede pedir las notificaciones de otra persona
// cambiando un id en el cliente.
export async function obtenerNotificaciones() {
  const usuario = await requireUsuario();

  const [items, noLeidas, config] = await Promise.all([
    prisma.notificacion.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { fechaCreacion: "desc" },
      take: 20,
    }),
    prisma.notificacion.count({ where: { usuarioId: usuario.id, leida: false } }),
    obtenerConfiguracion(),
  ]);

  return {
    rol: usuario.rol,
    noLeidas,
    intervaloSegundos: config.notificacionesIntervaloSegundos,
    localeFecha: config.localeFecha,
    items: items.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensaje: n.mensaje,
      ticketId: n.ticketId,
      contactoPendienteId: n.contactoPendienteId,
      leida: n.leida,
      fechaCreacion: n.fechaCreacion.toISOString(),
    })),
  };
}
