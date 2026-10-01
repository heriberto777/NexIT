"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { siguienteNumeroTicket } from "@/server/services/numero-ticket.service";
import { emitirEvento } from "@/server/services/webhook.service";
import { notificarTicketSinAsignar } from "@/server/services/notificacion.service";
import { crearTicketSchema } from "@/lib/zod/ticket.schema";
import type { CrearTicketInput } from "@/lib/zod/ticket.schema";

const ROLES_PERMITIDOS = ["ADMIN", "COORDINADOR", "TECNICO"] as const;

// Mismo patrón que resetear-password-usuario.ts: una temporal aleatoria en vez de
// pedirle una al staff, mostrada una sola vez (acá ni siquiera se muestra — viaja
// directo al contacto por el webhook de bienvenida).
function generarPasswordTemporal(): string {
  return crypto.randomBytes(9).toString("base64url");
}

// Creación manual por staff (Admin/Coordinador/Técnico) — típicamente cuando un cliente
// llama por teléfono en vez de reportar desde el portal. clienteId viaja en el input
// (a diferencia de crearTicketPortalSchema, donde sale de la sesión) porque aquí el
// staff elige a qué cliente pertenece.
export async function crearTicket(input: CrearTicketInput) {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede crear tickets`);
  }

  const {
    clienteId,
    sucursalId,
    activoId,
    ubicacionNoCatalogada,
    tipo,
    categoriaSoporte,
    titulo,
    descripcion,
    prioridad,
    contactoUsuarioId,
    contactoNuevo,
    contactoPendienteId,
  } = crearTicketSchema.parse(input);

  const sucursal = await prisma.sucursal.findUniqueOrThrow({ where: { id: sucursalId } });
  if (sucursal.clienteId !== clienteId) {
    throw new Error("Esa sucursal no pertenece al cliente seleccionado");
  }

  if (activoId) {
    const activo = await prisma.activo.findUniqueOrThrow({ where: { id: activoId } });
    if (activo.sucursalId !== sucursalId) {
      throw new Error("Ese activo no pertenece a la sucursal seleccionada");
    }
  }

  // Resuelve quién es el contacto real que reportó el problema — de acá sale
  // creadoPorId, y por lo tanto a quién le llegan las notificaciones (TICKET_CREADO,
  // TICKET_ASIGNADO, etc.). Antes esto se perdía: el ticket quedaba a nombre de
  // `usuario` (el miembro del staff que llenó el formulario) y el contacto real solo
  // aparecía como texto suelto en la descripción, sin forma de notificarle nada.
  let contacto: { id: string; nombre: string; email: string; telegramChatId: string | null; whatsappTelefono: string | null };
  let passwordTemporalNueva: string | null = null;

  if (contactoUsuarioId) {
    const existente = await prisma.usuario.findUnique({ where: { id: contactoUsuarioId } });
    if (!existente || existente.rol !== "CLIENTE" || existente.clienteId !== clienteId) {
      throw new Error("El contacto seleccionado no pertenece a este cliente");
    }
    contacto = existente;
  } else {
    const { nombre, email, whatsapp } = contactoNuevo!;
    const yaExiste = await prisma.usuario.findUnique({ where: { email } });
    if (yaExiste) {
      throw new Error("Ya existe un usuario con ese correo — búscalo arriba en vez de crear uno nuevo");
    }
    passwordTemporalNueva = generarPasswordTemporal();
    contacto = await prisma.usuario.create({
      data: {
        nombre,
        email,
        passwordHash: await bcrypt.hash(passwordTemporalNueva, 10),
        rol: "CLIENTE",
        clienteId,
        whatsappTelefono: whatsapp ?? null,
      },
    });
  }

  const contrato = await prisma.contrato.findFirst({
    where: { clienteId, estado: "ACTIVO" },
    orderBy: { fechaInicio: "desc" },
  });
  const sla = contrato
    ? await prisma.contratoSla.findFirst({ where: { contratoId: contrato.id, prioridad } })
    : null;

  const descripcionFinal = ubicacionNoCatalogada
    ? `[Equipo/ubicación no catalogada: ${ubicacionNoCatalogada}]\n\n${descripcion}`
    : descripcion;

  const numeroTicket = await siguienteNumeroTicket();

  const ticket = await prisma.$transaction(async (tx) => {
    const nuevo = await tx.ticket.create({
      data: {
        numeroTicket,
        clienteId,
        sucursalId,
        activoId,
        tipo,
        categoriaSoporte,
        prioridad,
        estado: "ABIERTO",
        titulo,
        descripcion: descripcionFinal,
        creadoPorId: contacto.id,
        slaId: sla?.id,
        origen: "TELEFONO",
      },
      include: { cliente: true },
    });

    await tx.ticketHistorial.create({
      data: {
        ticketId: nuevo.id,
        usuarioId: usuario.id,
        estadoNuevo: "ABIERTO",
        comentario: `Ticket creado por ${usuario.nombre} (${usuario.rol}) — reportado por teléfono, contacto: ${contacto.nombre}`,
      },
    });

    return nuevo;
  });

  if (contactoPendienteId) {
    // Solo si seguía PENDIENTE — evita pisar un registro que otro miembro del staff ya
    // convirtió en paralelo (dos pestañas abiertas sobre el mismo contacto pendiente).
    await prisma.contactoPendiente.updateMany({
      where: { id: contactoPendienteId, estado: "PENDIENTE" },
      data: { estado: "CONVERTIDO", ticketId: ticket.id, contactoCreadoId: contacto.id },
    });
  }

  if (passwordTemporalNueva) {
    emitirEvento({
      tipo: "CONTACTO_CREADO",
      usuarioId: contacto.id,
      nombre: contacto.nombre,
      email: contacto.email,
      passwordTemporal: passwordTemporalNueva,
      clienteNombre: ticket.cliente.nombre,
      whatsapp: contacto.whatsappTelefono,
    });
  }

  emitirEvento({
    tipo: "TICKET_CREADO",
    ticketId: ticket.id,
    numeroTicket: ticket.numeroTicket,
    clienteId: ticket.clienteId,
    clienteNombre: ticket.cliente.nombre,
    titulo: ticket.titulo,
    prioridad: ticket.prioridad,
    origen: "TELEFONO",
    reportadoPorNombre: contacto.nombre,
    reportadoPorEmail: contacto.email,
    reportadoPorTelegramChatId: contacto.telegramChatId,
    reportadoPorWhatsapp: contacto.whatsappTelefono,
  });

  // Un ticket creado por teléfono nunca nace asignado — Admin/Coordinador son quienes
  // le ponen técnico, así que son los destinatarios de esta notificación.
  await notificarTicketSinAsignar(ticket, titulo);

  return { id: ticket.id, numeroTicket: ticket.numeroTicket };
}
