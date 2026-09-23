import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { ValidationActions } from "@/components/tickets/validation-actions";
import { GestionTicketPanel } from "@/components/tickets/gestion-ticket-panel";
import { SolicitarCotizacionModal } from "@/components/tickets/solicitar-cotizacion-modal";
import { storageService } from "@/server/services/storage.service";
import { ESTADOS_CON_WIZARD_ACTIVO, ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";

const ESTADOS_GESTIONABLES = new Set(["ABIERTO", "ASIGNADO", "EN_DIAGNOSTICO", "ESPERANDO_REPUESTO", "EN_EJECUCION", "REABIERTO"]);

const ESTADO_COTIZACION_ESTILO: Record<string, string> = {
  PENDIENTE: "bg-amber-100 text-amber-800",
  APROBADO: "bg-green-100 text-green-800",
  RECHAZADO: "bg-red-100 text-red-800",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ ticketId: string }>;
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { ticketId } = await params;

  const config = await obtenerConfiguracion();
  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      cliente: true,
      sucursal: true,
      activo: { include: { categoria: true } },
      tecnicoAsignado: true,
      creadoPor: true,
      checklistRespuestas: { include: { checklistItem: true } },
      evidencias: { orderBy: { fechaCarga: "asc" } },
      firmas: { orderBy: { fecha: "asc" } },
      repuestos: { include: { repuesto: true } },
      cotizaciones: { orderBy: { fecha: "desc" } },
      historial: { include: { usuario: true }, orderBy: { fecha: "asc" } },
    },
  });

  if (!ticket) notFound();

  const sesion = await getSesionActual();

  // El técnico solo puede ver el detalle de SUS propios tickets — antes cualquier
  // técnico autenticado podía abrir el de cualquier otro solo conociendo el ticketId.
  if (sesion?.rol === "TECNICO" && ticket.tecnicoAsignadoId !== sesion.id) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">Este ticket no está asignado a ti.</p>
        <Link href="/tickets" className="text-sm text-blue-600 underline">
          Ver mis tickets
        </Link>
      </div>
    );
  }

  const puedeGestionar =
    (sesion?.rol === "COORDINADOR" || sesion?.rol === "ADMIN") && ESTADOS_GESTIONABLES.has(ticket.estado);
  const tecnicos = puedeGestionar
    ? await prisma.usuario.findMany({ where: { rol: "TECNICO", estado: "ACTIVO" }, orderBy: { nombre: "asc" } })
    : [];

  // Cualquiera de los tres roles de staff puede pedir una cotización — el técnico solo
  // sobre su propio ticket (ya está garantizado porque, si es técnico, esta pantalla ya
  // le habría bloqueado el acceso más arriba cuando el ticket no es suyo).
  const puedeSolicitarCotizacion =
    (sesion?.rol === "TECNICO" || sesion?.rol === "COORDINADOR" || sesion?.rol === "ADMIN") &&
    !ESTADOS_TERMINALES.has(ticket.estado);

  // Las columnas urlArchivo/urlFirmaImagen guardan la KEY del storage, no una URL
  // usable directo — se resuelve aquí, una vez por carga de la página.
  const [evidenciasResueltas, firmasResueltas] = await Promise.all([
    Promise.all(ticket.evidencias.map(async (e) => ({ ...e, urlArchivo: await storageService.getPublicUrl(e.urlArchivo) }))),
    Promise.all(ticket.firmas.map(async (f) => ({ ...f, urlFirmaImagen: await storageService.getPublicUrl(f.urlFirmaImagen) }))),
  ]);

  const fotosAntes = evidenciasResueltas.filter((e) => e.tipo === "FOTO_ANTES");
  const fotosDespues = evidenciasResueltas.filter((e) => e.tipo === "FOTO_DESPUES");
  const checklistOrdenado = [...ticket.checklistRespuestas].sort(
    (a, b) => a.checklistItem.orden - b.checklistItem.orden,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 bg-gray-50 px-4 py-6">
      <div className="flex items-center justify-between">
        <Link href="/tickets" className="text-sm text-blue-600 underline">
          ← Volver al listado
        </Link>
        <a
          href={`/api/tickets/${ticket.id}/pdf`}
          className="whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Descargar informe PDF
        </a>
      </div>

      <header className="space-y-2 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-gray-900">#{ticket.numeroTicket}</h1>
          <div className="flex gap-2">
            <PrioridadBadge prioridad={ticket.prioridad} />
            <EstadoBadge estado={ticket.estado} />
          </div>
        </div>
        <p className="text-sm text-gray-600">
          {ticket.cliente.nombre} · {ticket.sucursal.nombre}, {ticket.sucursal.direccion}
        </p>
        <p className="text-sm font-medium text-gray-900">{ticket.titulo}</p>
        <p className="text-sm text-gray-700">{ticket.descripcion}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2 text-xs text-gray-500 sm:grid-cols-4">
          <div>
            <dt className="font-medium text-gray-400">Tipo</dt>
            <dd className="text-gray-700">{ticket.tipo}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-400">Categoría</dt>
            <dd className="text-gray-700">{ticket.categoriaSoporte}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-400">Técnico</dt>
            <dd className="text-gray-700">{ticket.tecnicoAsignado?.nombre ?? "Sin asignar"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-400">Creado</dt>
            <dd className="text-gray-700">{FORMATO_FECHA.format(ticket.fechaCreacion)}</dd>
          </div>
        </dl>
      </header>

      {sesion?.rol === "TECNICO" && ESTADOS_CON_WIZARD_ACTIVO.has(ticket.estado) && (
        <Link
          href={`/tickets/${ticket.id}/ejecucion`}
          className="block rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Continuar atención →
        </Link>
      )}

      {ticket.activo && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Activo</h2>
          <p className="text-sm text-gray-700">
            {ticket.activo.categoria.nombre} — {ticket.activo.marca} {ticket.activo.modelo}
          </p>
          <p className="text-xs text-gray-500">
            Serie #{ticket.activo.numeroSerie} · {ticket.activo.ubicacionEspecifica ?? "sin ubicación específica"}
          </p>
        </section>
      )}

      {puedeGestionar && (
        <GestionTicketPanel
          ticket={{
            id: ticket.id,
            titulo: ticket.titulo,
            descripcion: ticket.descripcion,
            prioridad: ticket.prioridad,
            tecnicoAsignadoId: ticket.tecnicoAsignadoId,
          }}
          tecnicos={tecnicos.map((t) => ({ id: t.id, nombre: t.nombre }))}
        />
      )}

      <ValidationActions ticketId={ticket.id} estado={ticket.estado} rolActual={sesion?.rol ?? null} />

      {(ticket.cotizaciones.length > 0 || puedeSolicitarCotizacion) && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Cotizaciones</h2>
          {ticket.cotizaciones.length > 0 && (
            <div className="divide-y divide-gray-100">
              {ticket.cotizaciones.map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{formatCurrency(c.monto.toNumber(), config.monedaSimbolo)}</p>
                    <p className="text-sm text-gray-600">{c.descripcion}</p>
                    <p className="text-xs text-gray-400">{FORMATO_FECHA.format(c.fecha)}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COTIZACION_ESTILO[c.estado]}`}>
                    {c.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
          {puedeSolicitarCotizacion && <SolicitarCotizacionModal ticketId={ticket.id} monedaSimbolo={config.monedaSimbolo} />}
        </section>
      )}

      {checklistOrdenado.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Checklist de mantenimiento</h2>
          <div className="divide-y divide-gray-100">
            {checklistOrdenado.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                <div>
                  <p className="text-gray-800">{r.checklistItem.descripcion}</p>
                  {r.observacion && <p className="text-xs text-gray-500">{r.observacion}</p>}
                </div>
                <span className="shrink-0 font-medium text-gray-900">{r.respuesta}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {evidenciasResueltas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Evidencia fotográfica</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Antes ({fotosAntes.length})</p>
              <div className="grid grid-cols-3 gap-1.5">
                {fotosAntes.map((f) => (
                  <ImageThumbnail key={f.id} src={f.urlArchivo} alt="" className="aspect-square rounded-md object-cover" />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Después ({fotosDespues.length})</p>
              <div className="grid grid-cols-3 gap-1.5">
                {fotosDespues.map((f) => (
                  <ImageThumbnail key={f.id} src={f.urlArchivo} alt="" className="aspect-square rounded-md object-cover" />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {ticket.repuestos.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Repuestos utilizados</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="pb-1 font-medium">Repuesto</th>
                <th className="pb-1 font-medium">Cant.</th>
                <th className="pb-1 font-medium">Costo</th>
                <th className="pb-1 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ticket.repuestos.map((r) => (
                <tr key={r.id}>
                  <td className="py-1.5 text-gray-800">{r.repuesto.nombre}</td>
                  <td className="py-1.5 text-gray-600">{r.cantidad}</td>
                  <td className="py-1.5 text-gray-600">{formatCurrency(r.costoTotal.toNumber(), config.monedaSimbolo)}</td>
                  <td className="py-1.5 text-gray-600">{r.estadoAprobacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {firmasResueltas.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Firma de conformidad</h2>
          {firmasResueltas.map((f) => (
            <div key={f.id} className="space-y-2">
              <p className="text-sm text-gray-700">
                {f.nombreFirmante}
                {f.cargoFirmante ? ` — ${f.cargoFirmante}` : ""}
              </p>
              <p className="text-xs text-gray-500">{FORMATO_FECHA.format(f.fecha)}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- firma capturada por el usuario */}
              <img src={f.urlFirmaImagen} alt="Firma" className="h-24 rounded-md border border-gray-200 bg-white" />
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Historial de auditoría</h2>
        <ol className="space-y-3 border-l border-gray-200 pl-4">
          {ticket.historial.map((h) => (
            <li key={h.id} className="relative">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-500" />
              <p className="text-xs text-gray-400">{FORMATO_FECHA.format(h.fecha)}</p>
              <p className="text-sm text-gray-800">
                {h.usuario.nombre}
                {h.estadoNuevo && (
                  <>
                    {" "}
                    → <span className="font-medium">{h.estadoNuevo.replaceAll("_", " ")}</span>
                  </>
                )}
              </p>
              {h.comentario && <p className="text-sm text-gray-600">{h.comentario}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
