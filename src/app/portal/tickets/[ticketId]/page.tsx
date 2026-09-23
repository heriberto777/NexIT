import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { ValidationActions } from "@/components/tickets/validation-actions";
import { ComentarioForm } from "@/components/portal/comentario-form";
import { CotizacionActions } from "@/components/portal/cotizacion-actions";
import { storageService } from "@/server/services/storage.service";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";

export const dynamic = "force-dynamic";

const ESTADO_COTIZACION_ESTILO: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800",
  APROBADO: "bg-green-100 text-green-800",
  RECHAZADO: "bg-red-100 text-red-800",
};

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

const PASOS_FLUJO = [
  { estado: "ABIERTO", label: "Recibido" },
  { estado: "ASIGNADO", label: "Asignado" },
  { estado: "EN_DIAGNOSTICO", label: "En diagnóstico" },
  { estado: "EN_EJECUCION", label: "En ejecución" },
  { estado: "ESPERANDO_VALIDACION", label: "Esperando tu validación" },
] as const;

const ESTADOS_DESCARGABLES = new Set(["RESUELTO", "CERRADO"]);

export default async function PortalTicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;
  const sesion = await getSesionActual();
  const config = await obtenerConfiguracion();
  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "medium", timeStyle: "short" });

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      sucursal: true,
      activo: { include: { categoria: true } },
      evidencias: { orderBy: { fechaCarga: "asc" } },
      firmas: { orderBy: { fecha: "asc" } },
      cotizaciones: { orderBy: { fecha: "desc" } },
      historial: { include: { usuario: true }, orderBy: { fecha: "asc" } },
    },
  });

  if (!ticket) notFound();
  // Aislamiento por tenant: aunque alguien adivine el id de un ticket ajeno, esta
  // pantalla nunca debe mostrarlo — un cliente solo ve SUS PROPIOS tickets.
  if (ticket.clienteId !== sesion!.clienteId) redirect("/portal/tickets");

  const pasoActualIndex = PASOS_FLUJO.findIndex((p) => p.estado === ticket.estado);
  const fueraDelFlujoPrincipal = pasoActualIndex === -1; // REABIERTO, RESUELTO, CERRADO, CANCELADO, ESPERANDO_REPUESTO

  const evidenciasResueltas = await Promise.all(
    ticket.evidencias.map(async (e) => ({ ...e, urlArchivo: await storageService.getPublicUrl(e.urlArchivo) })),
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <Link href="/portal/tickets" className="text-sm text-blue-600 underline">
        ← Volver a mis tickets
      </Link>

      <header className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-gray-900">#{ticket.numeroTicket}</h1>
          <div className="flex gap-2">
            <PrioridadBadge prioridad={ticket.prioridad} />
            <EstadoBadge estado={ticket.estado} />
          </div>
        </div>
        <p className="text-sm font-medium text-gray-900">{ticket.titulo}</p>
        <p className="text-sm text-gray-600">{ticket.descripcion}</p>
        <p className="text-xs text-gray-400">
          {ticket.sucursal.nombre} · Creado el {FORMATO_FECHA.format(ticket.fechaCreacion)}
        </p>

        {ticket.activo && (
          <p className="text-sm text-gray-600">
            Equipo: {ticket.activo.categoria.nombre} — {ticket.activo.marca} {ticket.activo.modelo}
          </p>
        )}

        {ESTADOS_DESCARGABLES.has(ticket.estado) && (
          <a href={`/api/tickets/${ticket.id}/pdf`} className="inline-block text-sm text-blue-600 underline">
            Descargar informe técnico (PDF)
          </a>
        )}

        {!fueraDelFlujoPrincipal && (
          <ol className="flex flex-wrap gap-2 pt-2">
            {PASOS_FLUJO.map((paso, i) => (
              <li
                key={paso.estado}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  i <= pasoActualIndex ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {paso.label}
              </li>
            ))}
          </ol>
        )}
      </header>

      <ValidationActions ticketId={ticket.id} estado={ticket.estado} rolActual={sesion!.rol} />

      {ticket.cotizaciones.length > 0 && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Cotizaciones</h2>
          <div className="divide-y divide-gray-100">
            {ticket.cotizaciones.map((c) => (
              <div key={c.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(c.monto.toNumber(), config.monedaSimbolo)}</p>
                    <p className="text-sm text-gray-600">{c.descripcion}</p>
                    <p className="text-xs text-gray-400">{FORMATO_FECHA.format(c.fecha)}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COTIZACION_ESTILO[c.estado]}`}>
                    {c.estado}
                  </span>
                </div>
                {c.estado === "PENDIENTE" && <CotizacionActions cotizacionId={c.id} />}
              </div>
            ))}
          </div>
        </section>
      )}

      {evidenciasResueltas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Fotos</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {evidenciasResueltas.map((e) => (
              <ImageThumbnail key={e.id} src={e.urlArchivo} alt="" className="aspect-square rounded-md object-cover" />
            ))}
          </div>
        </section>
      )}

      {ticket.firmas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Conformidad firmada</h2>
          {ticket.firmas.map((f) => (
            <p key={f.id} className="text-sm text-gray-600">
              {f.nombreFirmante}
              {f.cargoFirmante ? ` — ${f.cargoFirmante}` : ""} · {FORMATO_FECHA.format(f.fecha)}
            </p>
          ))}
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">Conversación e historial</h2>
        <ol className="space-y-3">
          {ticket.historial.map((h) => (
            <li key={h.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-xs text-gray-400">
                {h.usuario.nombre} · {FORMATO_FECHA.format(h.fecha)}
              </p>
              {h.comentario && <p className="text-sm text-gray-700">{h.comentario}</p>}
            </li>
          ))}
          {ticket.historial.length === 0 && <p className="text-sm text-gray-400">Aún no hay actividad.</p>}
        </ol>
        <ComentarioForm ticketId={ticket.id} />
      </section>
    </div>
  );
}
