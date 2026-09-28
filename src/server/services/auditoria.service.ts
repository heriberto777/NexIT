import { prisma } from "@/lib/prisma";
import type { SesionUsuario } from "@/server/auth/session";

interface RegistrarAuditoriaParams {
  usuario: SesionUsuario;
  accion: string;
  entidad: string;
  entidadId?: string;
  detalle?: string;
}

// Se llama DESPUÉS de que la acción ya se confirmó en BD, nunca dentro de la misma
// transacción — un fallo al auditar no debe revertir ni bloquear una acción real que
// ya tuvo éxito. Por eso solo loguea el error a consola si la escritura falla, en vez
// de relanzarlo hacia el caller.
export async function registrarAuditoria({ usuario, accion, entidad, entidadId, detalle }: RegistrarAuditoriaParams): Promise<void> {
  try {
    await prisma.registroAuditoria.create({
      data: {
        usuarioId: usuario.id,
        usuarioNombre: usuario.nombre,
        usuarioRol: usuario.rol,
        accion,
        entidad,
        entidadId,
        detalle,
      },
    });
  } catch (error) {
    console.error(`[auditoria] No se pudo registrar "${accion}" sobre ${entidad}:`, error);
  }
}
