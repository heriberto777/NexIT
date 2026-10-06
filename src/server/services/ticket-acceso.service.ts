import type { Prisma } from "@prisma/client";

// Único lugar que decide "¿este usuario puede ejecutar pasos de este ticket?" — desde
// que existe TicketColaborador (Opción A del análisis "¿un ticket puede tener varios
// técnicos?"), ya no alcanza con comparar `tecnicoAsignadoId === usuario.id` a mano en
// cada Server Action. El RESPONSABLE (tecnicoAsignadoId) sigue siendo uno solo — es a
// quien apuntan notificaciones, PDF del informe y alertas de SLA, sin cambios — los
// colaboradores son gente adicional que puede entrar a ayudar con los pasos del wizard,
// nada más.
export interface TicketConAcceso {
  tecnicoAsignadoId: string | null;
  colaboradores: { usuarioId: string }[];
}

export function tieneAccesoAlTicket(ticket: TicketConAcceso, usuarioId: string): boolean {
  if (ticket.tecnicoAsignadoId === usuarioId) return true;
  return ticket.colaboradores.some((c) => c.usuarioId === usuarioId);
}

// Shape mínimo que toda query de ticket debe incluir para poder llamar a
// tieneAccesoAlTicket() — Prisma `include`/`select` listo para spread.
export const INCLUDE_COLABORADORES = { colaboradores: { select: { usuarioId: true } } } as const;

// Da de alta a `usuarioId` como TicketColaborador si todavía no tiene acceso al ticket
// (ni es el responsable ni ya es colaborador) — usado al asignar una tarea o mencionar a
// alguien en un comentario (ver análisis "Tareas dentro de un ticket"), para que
// tieneAccesoAlTicket() siga siendo el único lugar que decide quién puede ver el ticket,
// sin inventar un segundo sistema de permisos solo para tareas. No-op si ya tenía acceso.
export async function asegurarColaborador(
  tx: Prisma.TransactionClient,
  ticketId: string,
  usuarioId: string,
  tecnicoAsignadoId: string | null,
): Promise<void> {
  if (usuarioId === tecnicoAsignadoId) return;
  await tx.ticketColaborador.upsert({
    where: { ticketId_usuarioId: { ticketId, usuarioId } },
    create: { ticketId, usuarioId },
    update: {},
  });
}
