import { getSesionActual } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { LogsTabs } from "@/components/admin/logs/logs-tabs";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const dynamic = "force-dynamic";

// Tope fijo en vez de paginación real: a este volumen (auditoría de acciones
// administrativas, no de cada clic) 200 filas cubren varias semanas de uso típico. Si
// en el futuro hace falta ver más atrás, ahí sí vale la pena sumar paginación real.
const LIMITE = 200;

export default async function LogsPage() {
  const sesion = await getSesionActual();
  if (sesion?.rol !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">Los logs del sistema son solo para el rol Admin{sesion && ` (tu sesión actual es ${sesion.rol})`}.</p>
      </div>
    );
  }

  const [auditoria, errores, config] = await Promise.all([
    prisma.registroAuditoria.findMany({ orderBy: { createdAt: "desc" }, take: LIMITE }),
    prisma.registroError.findMany({ orderBy: { createdAt: "desc" }, take: LIMITE }),
    obtenerConfiguracion(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Logs del sistema</h1>
        <p className="text-sm text-gray-500">Últimos {LIMITE} registros de cada tipo.</p>
      </div>

      <LogsTabs
        auditoria={auditoria.map((r) => ({
          id: r.id,
          fecha: r.createdAt.toISOString(),
          usuarioNombre: r.usuarioNombre,
          usuarioRol: r.usuarioRol,
          accion: r.accion,
          entidad: r.entidad,
          entidadId: r.entidadId,
          detalle: r.detalle,
        }))}
        errores={errores.map((r) => ({
          id: r.id,
          fecha: r.createdAt.toISOString(),
          origen: r.origen,
          mensaje: r.mensaje,
          stack: r.stack,
          contexto: r.contexto,
        }))}
        localeFecha={config.localeFecha}
      />
    </div>
  );
}
