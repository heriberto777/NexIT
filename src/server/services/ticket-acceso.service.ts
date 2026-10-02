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
