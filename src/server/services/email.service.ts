import nodemailer from "nodemailer";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export interface ResultadoPruebaSmtp {
  ok: boolean;
  mensaje: string;
}

function construirTransporte(config: {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpSsl: boolean;
}) {
  if (!config.smtpHost || !config.smtpPort) return null;
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSsl,
    auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass ?? "" } : undefined,
  });
}

// "Probar Envío de Correo" en /admin/configuracion: manda un correo real de prueba al
// propio remitente configurado (smtpFromEmail) para confirmar que las credenciales
// SMTP funcionan de punta a punta, no solo que el formulario se guardó bien.
export async function probarEnvioSmtp(): Promise<ResultadoPruebaSmtp> {
  const config = await obtenerConfiguracion();
  const transporte = construirTransporte(config);

  if (!transporte) {
    return { ok: false, mensaje: "Falta configurar host y puerto SMTP." };
  }
  if (!config.smtpFromEmail) {
    return { ok: false, mensaje: "Falta configurar el correo remitente (smtpFromEmail)." };
  }

  try {
    await transporte.sendMail({
      from: config.smtpFromName ? `"${config.smtpFromName}" <${config.smtpFromEmail}>` : config.smtpFromEmail,
      to: config.smtpFromEmail,
      subject: `Prueba de correo — ${config.empresaNombre}`,
      text: "Este es un correo de prueba enviado desde /admin/configuracion en NexIT. Si lo recibiste, tu configuración SMTP funciona correctamente.",
    });
    return { ok: true, mensaje: `Correo de prueba enviado a ${config.smtpFromEmail}.` };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "Error desconocido";
    return { ok: false, mensaje: `No se pudo enviar: ${detalle}` };
  }
}
