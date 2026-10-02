import { prisma } from "@/lib/prisma";

export interface DefinicionPlantilla {
  clave: string;
  nombre: string;
  descripcion: string;
  placeholders: string[];
  cuerpoPorDefecto: string;
}

// Catálogo FIJO (en código, no en BD) de los mensajes que hoy están escritos a mano en
// el JSON de los workflows de n8n (ver N8N_INTEGRATION.md) — la BD solo guarda el
// override cuando alguien lo personaliza desde /admin/configuracion; sin override, se
// usa `cuerpoPorDefecto` tal cual, que es tal cual el texto que n8n ya manda hoy. Los
// placeholders se reemplazan con `{{nombre}}` — nunca HTML/markdown, texto plano, porque
// el mismo cuerpo se manda por correo, Telegram y WhatsApp.
export const PLANTILLAS: DefinicionPlantilla[] = [
  {
    clave: "TICKET_CREADO",
    nombre: "Ticket creado — confirmación al cliente",
    descripcion: "Se manda por correo/Telegram/WhatsApp apenas se crea un ticket nuevo.",
    placeholders: ["numeroTicket", "clienteNombre", "titulo", "prioridad"],
    cuerpoPorDefecto: 'Recibimos tu ticket #{{numeroTicket}} ("{{titulo}}", prioridad {{prioridad}}). Te avisaremos cuando un técnico lo atienda.',
  },
  {
    clave: "TICKET_ASIGNADO_TECNICO",
    nombre: "Ticket asignado — aviso al técnico",
    descripcion: "Avisa al técnico recién asignado que tiene un ticket nuevo.",
    placeholders: ["numeroTicket", "clienteNombre", "titulo", "prioridad"],
    cuerpoPorDefecto: 'Te asignaron el ticket #{{numeroTicket}} de {{clienteNombre}}: "{{titulo}}" (prioridad {{prioridad}}).',
  },
  {
    clave: "TICKET_ASIGNADO_CLIENTE",
    nombre: "Ticket asignado — aviso al cliente",
    descripcion: "Avisa al cliente que ya hay un técnico trabajando en su ticket.",
    placeholders: ["numeroTicket", "tecnicoNombre"],
    cuerpoPorDefecto: "{{tecnicoNombre}} fue asignado a tu ticket #{{numeroTicket}} y ya está trabajando en tu solicitud.",
  },
  {
    clave: "TICKET_CAMBIO_ESTADO",
    nombre: "Cambio de estado — aviso al cliente",
    descripcion: "Avisa al cliente cuando su ticket cambia de estado (ej. queda listo para validar).",
    placeholders: ["numeroTicket", "estadoNuevo"],
    cuerpoPorDefecto: "Tu ticket #{{numeroTicket}} cambió de estado a {{estadoNuevo}}.",
  },
  {
    clave: "SLA_EN_RIESGO",
    nombre: "Alerta de SLA al equipo técnico",
    descripcion: "Alerta interna cuando un ticket está por vencer o ya venció su SLA.",
    placeholders: ["numeroTicket", "clienteNombre", "titulo", "prioridad", "estadoSla"],
    cuerpoPorDefecto: '⏰ El ticket #{{numeroTicket}} de {{clienteNombre}} ("{{titulo}}", prioridad {{prioridad}}) está con el SLA {{estadoSla}}.',
  },
  {
    clave: "CONTACTO_CREADO",
    nombre: "Bienvenida al Portal",
    descripcion: "Se manda cuando el staff crea manualmente el acceso de un contacto nuevo.",
    placeholders: ["nombre", "clienteNombre"],
    cuerpoPorDefecto: "Hola {{nombre}}, un representante de {{clienteNombre}} te registró para dar seguimiento a tus solicitudes de soporte.",
  },
];

export function obtenerDefinicion(clave: string): DefinicionPlantilla | undefined {
  return PLANTILLAS.find((p) => p.clave === clave);
}

// Si `clave` no está en el catálogo, devuelve null (no revienta el webhook por una
// clave vieja/mal escrita). `{{placeholder}}` que no venga en `variables` se reemplaza
// por string vacío, no se deja el placeholder literal en el mensaje final.
export async function renderizarPlantilla(clave: string, variables: Record<string, string>): Promise<string | null> {
  const definicion = obtenerDefinicion(clave);
  if (!definicion) return null;

  const personalizada = await prisma.plantillaNotificacion.findUnique({ where: { clave } });
  const cuerpo = personalizada?.cuerpo ?? definicion.cuerpoPorDefecto;

  return cuerpo.replace(/\{\{(\w+)\}\}/g, (_coincidencia, nombre: string) => variables[nombre] ?? "");
}
