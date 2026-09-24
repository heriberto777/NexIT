import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { ExecutionWizard } from "@/components/checklist/execution-wizard";
import { storageService } from "@/server/services/storage.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// Esta pantalla depende de datos siempre frescos del ticket (estado, evidencias, firma)
// y de sesión del técnico — nunca debe pre-renderizarse estáticamente en el build.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

export default async function EjecucionPage({ params }: PageProps) {
  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      cliente: true,
      sucursal: true,
      activo: true,
      evidencias: true,
      firmas: true,
    },
  });

  if (!ticket) {
    notFound();
  }

  // Cada acción del wizard (guardar-diagnostico, guardar-checklist, capturar-firma,
  // registrar-repuesto, finalizar-visita) ya valida esto por su cuenta, pero sin este
  // check aquí la PANTALLA seguía siendo visible para cualquier técnico que conociera
  // el ticketId — no llegaba a mutar nada, pero sí exponía el detalle del caso.
  const sesion = await getSesionActual();
  if (sesion?.rol !== "TECNICO" || ticket.tecnicoAsignadoId !== sesion.id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">
          Esta pantalla de ejecución es solo para el técnico asignado a este ticket.
        </p>
        <Link href={`/tickets/${ticket.id}`} className="text-sm text-blue-600 underline">
          Ver el detalle del ticket
        </Link>
      </div>
    );
  }

  // El checklist depende de la categoría del activo; se toma siempre la última versión
  // del template para esa categoría (ChecklistTemplate.version).
  const template = ticket.activo
    ? await prisma.checklistTemplate.findFirst({
        where: { categoriaActivoId: ticket.activo.categoriaId },
        orderBy: { version: "desc" },
        include: { items: { orderBy: { orden: "asc" } } },
      })
    : null;

  const [repuestos, config] = await Promise.all([
    prisma.repuesto.findMany({ orderBy: { nombre: "asc" } }),
    obtenerConfiguracion(),
  ]);

  return (
    <ExecutionWizard
      fotosMinimasEvidencia={config.fotosMinimasEvidencia}
      ticket={{
        id: ticket.id,
        numeroTicket: ticket.numeroTicket,
        estado: ticket.estado,
        titulo: ticket.titulo,
        descripcion: ticket.descripcion,
        fechaInicioAtencion: ticket.fechaInicioAtencion,
        tieneFirma: ticket.firmas.length > 0,
        cliente: { nombre: ticket.cliente.nombre },
        sucursal: { nombre: ticket.sucursal.nombre, direccion: ticket.sucursal.direccion },
        activo: ticket.activo
          ? {
              id: ticket.activo.id,
              marca: ticket.activo.marca,
              modelo: ticket.activo.modelo,
              numeroSerie: ticket.activo.numeroSerie,
              categoriaId: ticket.activo.categoriaId,
            }
          : null,
      }}
      checklistItems={
        template?.items.map((item) => ({
          id: item.id,
          descripcion: item.descripcion,
          tipoRespuesta: item.tipoRespuesta,
          opciones: item.opciones,
          orden: item.orden,
        })) ?? []
      }
      repuestosDisponibles={repuestos.map((r) => ({
        id: r.id,
        nombre: r.nombre,
        codigo: r.codigo,
        stockActual: r.stockActual,
        costoUnidad: r.costoUnidad.toNumber(),
      }))}
      evidenciasIniciales={await Promise.all(
        ticket.evidencias.map(async (e) => ({
          id: e.id,
          tipo: e.tipo,
          urlArchivo: await storageService.getPublicUrl(e.urlArchivo),
        })),
      )}
    />
  );
}
