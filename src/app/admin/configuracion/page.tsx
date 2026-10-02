import { getSesionActual } from "@/server/auth/session";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { storageService } from "@/server/services/storage.service";
import { prisma } from "@/lib/prisma";
import { PLANTILLAS } from "@/server/services/plantilla-notificacion.service";
import { ConfiguracionTabs } from "@/components/admin/configuracion/configuracion-tabs";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const sesion = await getSesionActual();
  if (sesion?.rol !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">La configuración del sistema es solo para el rol Admin{sesion && ` (tu sesión actual es ${sesion.rol})`}.</p>
      </div>
    );
  }

  const allowDataReset = process.env.ALLOW_DATA_RESET === "true";

  const [config, categoriasRaw, especialidadesRaw, plantillasPersonalizadas, conteoDatosPrueba] = await Promise.all([
    obtenerConfiguracion(),
    prisma.categoriaActivo.findMany({
      include: { _count: { select: { activos: true, checklistTemplates: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.especialidad.findMany({
      include: { _count: { select: { usuarios: true } } },
      orderBy: { nombre: "asc" },
    }),
    prisma.plantillaNotificacion.findMany(),
    allowDataReset
      ? Promise.all([
          prisma.ticket.count(),
          prisma.notificacion.count(),
          prisma.conversacionChat.count(),
          prisma.contactoPendiente.count(),
        ]).then(([tickets, notificaciones, conversaciones, contactosPendientes]) => ({
          tickets,
          notificaciones,
          conversaciones,
          contactosPendientes,
        }))
      : Promise.resolve(null),
  ]);
  const logoUrl = config.empresaLogoUrl ? await storageService.getPublicUrl(config.empresaLogoUrl) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Configuración del sistema</h1>

      <ConfiguracionTabs
        branding={{
          empresaNombre: config.empresaNombre,
          empresaRnc: config.empresaRnc ?? "",
          empresaTelefono: config.empresaTelefono ?? "",
          empresaEmail: config.empresaEmail ?? "",
          empresaDireccion: config.empresaDireccion ?? "",
        }}
        logoUrl={logoUrl}
        smtp={{
          smtpHost: config.smtpHost ?? "",
          smtpPort: config.smtpPort ?? undefined,
          smtpUser: config.smtpUser ?? "",
          smtpFromEmail: config.smtpFromEmail ?? "",
          smtpFromName: config.smtpFromName ?? "",
          smtpSsl: config.smtpSsl,
          tieneSmtpPass: Boolean(config.smtpPass),
        }}
        webhooks={{
          webhookUrl: config.webhookUrl ?? "",
          webhooksHabilitados: config.webhooksHabilitados,
          tieneWebhookSecret: Boolean(config.webhookSecret),
        }}
        parametros={{
          slaHorasCritica: config.slaHorasCritica,
          slaHorasAlta: config.slaHorasAlta,
          slaHorasMedia: config.slaHorasMedia,
          slaHorasBaja: config.slaHorasBaja,
          diasAnticipacionPreventivos: config.diasAnticipacionPreventivos,
          diasVentanaProximoPreventivo: config.diasVentanaProximoPreventivo,
          fotosMinimasEvidencia: config.fotosMinimasEvidencia,
          evidenciaMaxMB: config.evidenciaMaxMB,
          monedaCodigo: config.monedaCodigo,
          monedaSimbolo: config.monedaSimbolo,
          localeFecha: config.localeFecha,
          notificacionesIntervaloSegundos: config.notificacionesIntervaloSegundos,
        }}
        categorias={categoriasRaw.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          activos: c._count.activos,
          checklistTemplates: c._count.checklistTemplates,
        }))}
        especialidades={especialidadesRaw.map((e) => ({ id: e.id, nombre: e.nombre, usuarios: e._count.usuarios }))}
        plantillas={PLANTILLAS.map((p) => {
          const override = plantillasPersonalizadas.find((pp) => pp.clave === p.clave);
          return {
            clave: p.clave,
            nombre: p.nombre,
            descripcion: p.descripcion,
            placeholders: p.placeholders,
            cuerpoPorDefecto: p.cuerpoPorDefecto,
            cuerpoPersonalizado: override?.cuerpo ?? null,
          };
        })}
        conteoDatosPrueba={conteoDatosPrueba}
      />
    </div>
  );
}
