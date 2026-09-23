export type EstadoSla = "ok" | "en_riesgo" | "vencido";

const ESTADOS_CERRADOS = new Set(["RESUELTO", "CERRADO", "CANCELADO"]);

// Fallback si ni siquiera existe la fila de ConfiguracionSistema (BD recién migrada,
// antes del primer guardado en /admin/configuracion) — el caller normal siempre debería
// pasar `defaultsHoras` resuelto desde ahí; esto es el último resorte.
const FALLBACK_HORAS: Record<Prioridad, number> = { CRITICA: 4, ALTA: 8, MEDIA: 24, BAJA: 48 };

type Prioridad = "CRITICA" | "ALTA" | "MEDIA" | "BAJA";

interface TicketConSla {
  estado: string;
  prioridad: Prioridad;
  fechaCreacion: Date;
  sla: { tiempoResolucionMin: number } | null;
}

// El tiempo de resolución es el del contrato del cliente (ContratoSla) si el ticket
// tiene uno asignado; si no, el default global por prioridad configurado en
// /admin/configuracion — antes, un ticket sin contrato simplemente no tenía NINGUNA
// alerta de SLA, lo cual dejaba pasar casos reales sin aviso.
// En riesgo a partir del 80% del tiempo consumido; vencido al 100%. Un ticket ya
// cerrado/resuelto no tiene alerta de SLA activa.
export function calcularEstadoSla(ticket: TicketConSla, defaultsHoras: Record<Prioridad, number> = FALLBACK_HORAS): EstadoSla | null {
  if (ESTADOS_CERRADOS.has(ticket.estado)) return null;

  const tiempoResolucionMin = ticket.sla?.tiempoResolucionMin ?? defaultsHoras[ticket.prioridad] * 60;

  const minutosTranscurridos = (Date.now() - ticket.fechaCreacion.getTime()) / 60_000;
  const porcentaje = minutosTranscurridos / tiempoResolucionMin;

  if (porcentaje >= 1) return "vencido";
  if (porcentaje >= 0.8) return "en_riesgo";
  return "ok";
}
