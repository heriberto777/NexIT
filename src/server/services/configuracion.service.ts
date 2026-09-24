import { prisma } from "@/lib/prisma";
import type { ConfiguracionSistema } from "@prisma/client";

const SINGLETON_ID = "singleton";

// Defaults cuando la fila aún no existe (BD recién migrada, antes del primer guardado
// desde /admin/configuracion) — construidos desde .env para que el sistema siga
// funcionando igual que antes de este módulo, sin exigir configurarlo de nuevo a mano.
function defaultsDesdeEnv(): Omit<ConfiguracionSistema, "id" | "actualizadoEn"> {
  return {
    empresaNombre: process.env.EMPRESA_NOMBRE ?? "NexIT",
    empresaRnc: null,
    empresaLogoUrl: null,
    empresaTelefono: null,
    empresaEmail: null,
    empresaDireccion: null,
    webhookUrl: process.env.WEBHOOK_N8N_URL ?? null,
    webhookSecret: process.env.WEBHOOK_SECRET ?? null,
    webhooksHabilitados: Boolean(process.env.WEBHOOK_N8N_URL),
    smtpHost: process.env.SMTP_HOST ?? null,
    smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null,
    smtpUser: process.env.SMTP_USER ?? null,
    smtpPass: process.env.SMTP_PASS ?? null,
    smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? null,
    smtpFromName: process.env.SMTP_FROM_NAME ?? null,
    smtpSsl: process.env.SMTP_SSL !== "false",
    slaHorasCritica: 4,
    slaHorasAlta: 8,
    slaHorasMedia: 24,
    slaHorasBaja: 48,
    diasAnticipacionPreventivos: 7,
    monedaCodigo: process.env.MONEDA_CODIGO ?? "DOP",
    monedaSimbolo: process.env.MONEDA_SIMBOLO ?? "RD$",
    localeFecha: process.env.LOCALE_FECHA ?? "es-DO",
    fotosMinimasEvidencia: process.env.FOTOS_MINIMAS_EVIDENCIA ? Number(process.env.FOTOS_MINIMAS_EVIDENCIA) : 1,
  };
}

// Cache corto en memoria del proceso: evita una query a BD en cada request que use la
// config (webhook, PDF, cálculo de SLA en cada listado de tickets), sin quedar
// desactualizado más de unos segundos tras guardar cambios desde /admin/configuracion.
let cache: { valor: ConfiguracionSistema; expira: number } | null = null;
const TTL_MS = 5000;

export async function obtenerConfiguracion(): Promise<ConfiguracionSistema> {
  if (cache && cache.expira > Date.now()) return cache.valor;

  let fila: ConfiguracionSistema | null = null;
  try {
    fila = await prisma.configuracionSistema.findUnique({ where: { id: SINGLETON_ID } });
  } catch (error) {
    // Tabla aún no migrada en este entorno (o BD caída) — cae a defaults/env en vez de
    // tumbar al caller (webhook, generación de PDF, chequeo de SLA).
    console.error("[configuracion] No se pudo leer ConfiguracionSistema, usando defaults/env:", error);
  }

  const valor: ConfiguracionSistema = fila ?? { id: SINGLETON_ID, actualizadoEn: new Date(), ...defaultsDesdeEnv() };
  cache = { valor, expira: Date.now() + TTL_MS };
  return valor;
}

export function invalidarCacheConfiguracion(): void {
  cache = null;
}

type ActualizarConfiguracionInput = Partial<Omit<ConfiguracionSistema, "id" | "actualizadoEn">>;

export async function actualizarConfiguracion(data: ActualizarConfiguracionInput): Promise<ConfiguracionSistema> {
  const fila = await prisma.configuracionSistema.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, ...defaultsDesdeEnv(), ...data },
    update: data,
  });
  invalidarCacheConfiguracion();
  return fila;
}

export function slaHorasPorPrioridad(config: ConfiguracionSistema): Record<"CRITICA" | "ALTA" | "MEDIA" | "BAJA", number> {
  return {
    CRITICA: config.slaHorasCritica,
    ALTA: config.slaHorasAlta,
    MEDIA: config.slaHorasMedia,
    BAJA: config.slaHorasBaja,
  };
}
