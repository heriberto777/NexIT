// Shapes compartidos entre TareasTicketPanel y TareaDetalleModal — la página de detalle
// del ticket (Server Component) ya resuelve fechas/keys de storage antes de pasar esto.
export interface ActividadTareaUI {
  id: string;
  tipo: "CREACION" | "CAMBIO_ESTADO" | "REASIGNACION" | "COMENTARIO";
  comentario: string | null;
  fotoUrl: string | null;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
  fecha: string;
  usuarioNombre: string;
  mencionesNombres: string[];
}

export interface TareaUI {
  id: string;
  titulo: string;
  estado: "PENDIENTE" | "EN_PROGRESO" | "COMPLETADA" | "CANCELADA";
  asignadoA: { id: string; nombre: string } | null;
  creadoPorNombre: string;
  fechaCreacion: string;
  actividad: ActividadTareaUI[];
}

export interface CandidatoTareaUI {
  id: string;
  nombre: string;
}
