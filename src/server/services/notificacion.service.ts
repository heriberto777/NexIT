import { prisma } from "@/lib/prisma";
import type { TipoNotificacion } from "@prisma/client";

interface CrearNotificacionInput {
  usuarioId: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  ticketId?: string;
  contactoPendienteId?: string;
}

// Primitiva de bajo nivel — las funciones de abajo son las que de verdad se llaman
// desde las Server Actions/servicios de negocio, esta solo evita repetir
// `prisma.notificacion.create` en cada una.
export async function crearNotificacion(input: CrearNotificacionInput): Promise<void> {
  await prisma.notificacion.create({ data: input });
}

async function idsStaffActivo(): Promise<string[]> {
  const usuarios = await prisma.usuario.findMany({
    where: { rol: { in: ["ADMIN", "COORDINADOR"] }, estado: "ACTIVO" },
    select: { id: true },
  });
  return usuarios.map((u) => u.id);
}

// Ticket recién creado sin técnico, o que volvió a necesitar uno (reabierto tras un
// rechazo del cliente) — ADMIN/COORDINADOR son quienes asignan, así que son los únicos
// destinatarios. Sin destinatarios activos, no crea nada (createMany con data vacía
// tira error en vez de simplemente no hacer nada).
export async function notificarTicketSinAsignar(ticket: { id: string; numeroTicket: string }, mensaje: string): Promise<void> {
  const ids = await idsStaffActivo();
  if (ids.length === 0) return;
  await prisma.notificacion.createMany({
    data: ids.map((usuarioId) => ({
      usuarioId,
      tipo: "TICKET_SIN_ASIGNAR" as const,
      titulo: `Ticket #${ticket.numeroTicket} sin asignar`,
      mensaje,
      ticketId: ticket.id,
    })),
  });
}

export async function notificarTecnicoAsignado(
  ticket: { id: string; numeroTicket: string; titulo: string },
  tecnicoId: string,
  esReasignacion: boolean,
): Promise<void> {
  await crearNotificacion({
    usuarioId: tecnicoId,
    tipo: "TICKET_ASIGNADO",
    titulo: esReasignacion ? `Te reasignaron el ticket #${ticket.numeroTicket}` : `Te asignaron el ticket #${ticket.numeroTicket}`,
    mensaje: ticket.titulo,
    ticketId: ticket.id,
  });
}

export async function notificarContactoPendienteNuevo(contacto: {
  id: string;
  nombre: string | null;
  empresaReportada: string | null;
}): Promise<void> {
  const ids = await idsStaffActivo();
  if (ids.length === 0) return;
  await prisma.notificacion.createMany({
    data: ids.map((usuarioId) => ({
      usuarioId,
      tipo: "CONTACTO_PENDIENTE_NUEVO" as const,
      titulo: `Nuevo contacto pendiente: ${contacto.nombre ?? "sin nombre"}`,
      mensaje: `Dice ser de ${contacto.empresaReportada ?? "una empresa sin especificar"}`,
      contactoPendienteId: contacto.id,
    })),
  });
}

// Avisos de cambio de estado dirigidos al contacto real del cliente — el caller ya
// decide si corresponde (normalmente chequeando creadoPor.rol === "CLIENTE", porque un
// ticket PROGRAMADO tiene como "reportador" a un coordinador, no a un cliente real).
export async function notificarCambioEstadoCliente(
  usuarioId: string,
  ticket: { id: string; numeroTicket: string },
  titulo: string,
  mensaje: string,
): Promise<void> {
  await crearNotificacion({
    usuarioId,
    tipo: "TICKET_CAMBIO_ESTADO",
    titulo: `${titulo} — Ticket #${ticket.numeroTicket}`,
    mensaje,
    ticketId: ticket.id,
  });
}
