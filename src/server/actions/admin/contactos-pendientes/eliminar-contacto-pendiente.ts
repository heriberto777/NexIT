"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { registrarAuditoria } from "@/server/services/auditoria.service";

const ROLES_PERMITIDOS = ["ADMIN", "COORDINADOR"] as const;
const schema = z.object({ id: z.string().cuid() });

// Para descartar contactos basura (spam, pruebas, números equivocados) que completaron
// los 5 datos pero no corresponde levantarles un ticket. Nunca borra uno ya CONVERTIDO
// — eso dejaría un ticket real sin su registro de origen, sin ganar nada a cambio.
export async function eliminarContactoPendiente(input: z.infer<typeof schema>): Promise<void> {
  const usuario = await requireUsuario();
  if (!ROLES_PERMITIDOS.includes(usuario.rol as (typeof ROLES_PERMITIDOS)[number])) {
    throw new Error(`Tu rol (${usuario.rol}) no puede eliminar contactos pendientes`);
  }

  const { id } = schema.parse(input);

  const contacto = await prisma.contactoPendiente.findUniqueOrThrow({ where: { id } });
  if (contacto.estado === "CONVERTIDO") {
    throw new Error("Este contacto ya se convirtió en un ticket — no se puede eliminar");
  }

  await prisma.contactoPendiente.delete({ where: { id } });

  await registrarAuditoria({
    usuario,
    accion: "contacto_pendiente.eliminar",
    entidad: "ContactoPendiente",
    entidadId: id,
    detalle: `Eliminó el contacto pendiente de "${contacto.nombre ?? "sin nombre"}" (${contacto.canal} ${contacto.identificador})`,
  });
}
