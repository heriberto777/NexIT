// Estados en los que el wizard de ejecución (/tickets/[id]/ejecucion) sigue siendo el
// paso activo del técnico — antes de esperar validación del cliente o quedar cerrado.
// Fuente única: se usa tanto en el listado (link directo al wizard) como en el detalle
// (botón "Continuar atención") para que ambos decidan exactamente lo mismo.
export const ESTADOS_CON_WIZARD_ACTIVO = new Set([
  "ASIGNADO",
  "EN_DIAGNOSTICO",
  "ESPERANDO_REPUESTO",
  "EN_EJECUCION",
  "REABIERTO",
]);

// Estados en los que ya no tiene sentido asignar, editar o cancelar un ticket.
export const ESTADOS_TERMINALES = new Set(["RESUELTO", "CERRADO", "CANCELADO"]);
