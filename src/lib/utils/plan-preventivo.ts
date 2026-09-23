export type EstadoVigenciaPlan = "vencido" | "proximo" | "programado";

const DIAS_VENTANA_PROXIMO = 7;

// "Vencido"/"Próximo a vencer" describen la VIGENCIA de la fecha (para alertar al
// coordinador), independiente del campo `estado` del plan (ACTIVO/PAUSADO, si el plan
// en sí está habilitado a generar tickets).
export function calcularVigenciaPlan(proximaFecha: Date): EstadoVigenciaPlan {
  const hoy = new Date();
  const diasRestantes = (proximaFecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);

  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= DIAS_VENTANA_PROXIMO) return "proximo";
  return "programado";
}
