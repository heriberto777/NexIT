export interface TicketEjecucionData {
  id: string;
  numeroTicket: string;
  estado: string;
  titulo: string;
  descripcion: string;
  // Usados para reanudar el wizard en el paso correcto si el técnico recarga la página
  // o vuelve más tarde — ver calcularPasoInicial() en execution-wizard.tsx.
  fechaInicioAtencion: Date | null;
  tieneFirma: boolean;
  cliente: { nombre: string };
  sucursal: { nombre: string; direccion: string };
  activo: { id: string; marca: string; modelo: string; numeroSerie: string; categoriaId: string } | null;
}

export interface ChecklistItemPlano {
  id: string;
  descripcion: string;
  tipoRespuesta: "BOOLEANO" | "TEXTO" | "NUMERO" | "SELECCION";
  opciones: string[];
  orden: number;
}

export interface RepuestoPlano {
  id: string;
  nombre: string;
  codigo: string;
  stockActual: number;
  costoUnidad: number;
}

export interface EvidenciaPlana {
  id: string;
  tipo: "FOTO_ANTES" | "FOTO_DESPUES" | "DOCUMENTO" | "OTRO";
  urlArchivo: string;
}
