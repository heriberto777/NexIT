import { prisma } from "@/lib/prisma";

// Correlativo simple TCK-0001, TCK-0002... Aceptable para este volumen de dev/demo;
// en producción con escritura concurrente real convendría una secuencia de BD.
export async function siguienteNumeroTicket(): Promise<string> {
  const total = await prisma.ticket.count();
  return `TCK-${String(total + 1).padStart(4, "0")}`;
}
