import { getSesionActual } from "@/server/auth/session";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { storageService } from "@/server/services/storage.service";
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

  const config = await obtenerConfiguracion();
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
          monedaCodigo: config.monedaCodigo,
          monedaSimbolo: config.monedaSimbolo,
          localeFecha: config.localeFecha,
        }}
      />
    </div>
  );
}
