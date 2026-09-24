export type EstadoVigenciaPlan = "vencido" | "proximo" | "programado";

const DIAS_VENTANA_PROXIMO_FALLBACK = 7;

// "Vencido"/"Próximo a vencer" describen la VIGENCIA de la fecha (para alertar al
// coordinador), independiente del campo `estado` del plan (ACTIVO/PAUSADO, si el plan
// en sí está habilitado a generar tickets). `diasVentanaProximo` viene de
// ConfiguracionSistema.diasVentanaProximoPreventivo — el fallback solo aplica si el
// caller no lo tiene a mano (no debería pasar en código nuevo).
export function calcularVigenciaPlan(proximaFecha: Date, diasVentanaProximo: number = DIAS_VENTANA_PROXIMO_FALLBACK): EstadoVigenciaPlan {
  const hoy = new Date();
  const diasRestantes = (proximaFecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);

  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= diasVentanaProximo) return "proximo";
  return "programado";
}
