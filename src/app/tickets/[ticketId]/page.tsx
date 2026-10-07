import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";
import { ValidationActions } from "@/components/tickets/validation-actions";
import { GestionTicketPanel } from "@/components/tickets/gestion-ticket-panel";
import { SolicitarCotizacionModal } from "@/components/tickets/solicitar-cotizacion-modal";
import { CrearTicketInstalacionButton } from "@/components/tickets/crear-ticket-instalacion-button";
import { MarcarEnvioCotizacionButton } from "@/components/tickets/marcar-envio-cotizacion-button";
import { storageService } from "@/server/services/storage.service";
import { ESTADOS_CON_WIZARD_ACTIVO, ESTADOS_TERMINALES } from "@/lib/utils/ticket-estado";
import { formatCurrency } from "@/lib/utils/currency";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { ImageThumbnail } from "@/components/ui/image-thumbnail";
import { tieneAccesoAlTicket } from "@/server/services/ticket-acceso.service";
import { TareasTicketPanel } from "@/components/tickets/tareas/tareas-ticket-panel";
import type { TareaUI } from "@/components/tickets/tareas/types";

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
      sistemaSoftware: true,
      tecnicoAsignado: true,
      creadoPor: true,
      checklistRespuestas: { include: { checklistItem: true } },
      evidencias: { orderBy: { fechaCarga: "asc" } },
      firmas: { orderBy: { fecha: "asc" } },
      repuestos: { include: { repuesto: true } },
      cotizaciones: {
        include: { repuesto: true, ticketInstalacion: { select: { id: true, numeroTicket: true } } },
        orderBy: { fecha: "desc" },
      },
      historial: { include: { usuario: true }, orderBy: { fecha: "asc" } },
      colaboradores: { include: { usuario: true } },
      tareas: {
        include: {
          asignadoA: { select: { id: true, nombre: true } },
          creadoPor: { select: { nombre: true } },
          actividad: {
            include: { usuario: { select: { nombre: true } }, menciones: { include: { usuario: { select: { nombre: true } } } } },
            orderBy: { fecha: "asc" },
          },
        },
        orderBy: { fechaCreacion: "asc" },
      },
    },
  });

  if (!ticket) notFound();

  const sesion = await getSesionActual();

  // El técnico solo puede ver el detalle de SUS propios tickets (como responsable o como
  // colaborador) — antes cualquier técnico autenticado podía abrir el de cualquier otro
  // solo conociendo el ticketId.
  if (sesion?.rol === "TECNICO" && !tieneAccesoAlTicket(ticket, sesion.id)) {
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

  const esAdminOCoordinador = sesion?.rol === "ADMIN" || sesion?.rol === "COORDINADOR";
  const esStaff = esAdminOCoordinador || sesion?.rol === "TECNICO";
  const puedeGestionar = esAdminOCoordinador && ESTADOS_GESTIONABLES.has(ticket.estado);
  // Tareas no está acotado a ESTADOS_GESTIONABLES como "Gestionar ticket": a propósito
  // sigue usable aunque el ticket ya esté RESUELTO (ej. terminar de comprar una licencia
  // después de la visita) — ver análisis "Tareas dentro de un ticket".
  const esResponsableDelTicket = Boolean(sesion && ticket.tecnicoAsignadoId === sesion.id);
  // Incluye Admin/Coordinador en el selector — un Admin a veces necesita atender él
  // mismo un ticket (ver asignar-tecnico.ts), no solo asignarlo a un Técnico.
  const tecnicos = esStaff
    ? await prisma.usuario.findMany({
        where: { rol: { in: ["TECNICO", "COORDINADOR", "ADMIN"] }, estado: "ACTIVO" },
        orderBy: { nombre: "asc" },
      })
    : [];

  // Cualquiera de los tres roles de staff puede pedir una cotización — el técnico solo
  // sobre su propio ticket (ya está garantizado porque, si es técnico, esta pantalla ya
  // le habría bloqueado el acceso más arriba cuando el ticket no es suyo).
  const puedeSolicitarCotizacion =
    (sesion?.rol === "TECNICO" || sesion?.rol === "COORDINADOR" || sesion?.rol === "ADMIN") &&
    !ESTADOS_TERMINALES.has(ticket.estado);
  // Catálogo para el modo "Un producto" del modal de cotización — el monto sale de acá,
  // nunca se escribe a mano (ver análisis "¿de dónde sale el monto de la cotización?").
  const productosCotizables = puedeSolicitarCotizacion
    ? (
        await prisma.repuesto.findMany({
          orderBy: { nombre: "asc" },
          select: { id: true, nombre: true, costoUnidad: true, precioVenta: true, unidadMedida: true },
        })
      ).map((p) => ({
        id: p.id,
        nombre: p.nombre,
        costoUnidad: p.costoUnidad.toNumber(),
        precioVenta: p.precioVenta?.toNumber() ?? null,
        unidadMedida: p.unidadMedida,
      }))
    : [];

  // Las columnas urlArchivo/urlFirmaImagen guardan la KEY del storage, no una URL
  // usable directo — se resuelve aquí, una vez por carga de la página.
  const [evidenciasResueltas, firmasResueltas, checklistConFoto, tareasUI] = await Promise.all([
    Promise.all(ticket.evidencias.map(async (e) => ({ ...e, urlArchivo: await storageService.getPublicUrl(e.urlArchivo) }))),
    Promise.all(ticket.firmas.map(async (f) => ({ ...f, urlFirmaImagen: await storageService.getPublicUrl(f.urlFirmaImagen) }))),
    Promise.all(
      ticket.checklistRespuestas.map(async (r) => ({
        ...r,
        fotoUrl: r.fotoArchivo ? await storageService.getPublicUrl(r.fotoArchivo) : null,
      })),
    ),
    Promise.all(
      ticket.tareas.map(async (t): Promise<TareaUI> => ({
        id: t.id,
        titulo: t.titulo,
        estado: t.estado,
        asignadoA: t.asignadoA,
        creadoPorNombre: t.creadoPor.nombre,
        fechaCreacion: FORMATO_FECHA.format(t.fechaCreacion),
        actividad: await Promise.all(
          t.actividad.map(async (a) => ({
            id: a.id,
            tipo: a.tipo,
            comentario: a.comentario,
            fotoUrl: a.fotoArchivo ? await storageService.getPublicUrl(a.fotoArchivo) : null,
            estadoAnterior: a.estadoAnterior,
            estadoNuevo: a.estadoNuevo,
            fecha: FORMATO_FECHA.format(a.fecha),
            usuarioNombre: a.usuario.nombre,
            mencionesNombres: a.menciones.map((m) => m.usuario.nombre),
          })),
        ),
      })),
    ),
  ]);

  const fotosAntes = evidenciasResueltas.filter((e) => e.tipo === "FOTO_ANTES");
  const fotosDespues = evidenciasResueltas.filter((e) => e.tipo === "FOTO_DESPUES");
  const checklistOrdenado = [...checklistConFoto].sort(
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
        <p className="break-words text-sm font-medium text-gray-900">{ticket.titulo}</p>
        <p className="break-words text-sm text-gray-700">{ticket.descripcion}</p>
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
          {ticket.colaboradores.length > 0 && (
            <div>
              <dt className="font-medium text-gray-400">Colaboradores</dt>
              <dd className="text-gray-700">{ticket.colaboradores.map((c) => c.usuario.nombre).join(", ")}</dd>
            </div>
          )}
          <div>
            <dt className="font-medium text-gray-400">Creado</dt>
            <dd className="text-gray-700">{FORMATO_FECHA.format(ticket.fechaCreacion)}</dd>
          </div>
        </dl>
      </header>

      {ticket.sugerenciaIA && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700">🤖 Sugerencia de la IA (solo staff/técnico)</p>
          <p className="text-sm text-violet-900">{ticket.sugerenciaIA}</p>
        </div>
      )}

      {sesion && tieneAccesoAlTicket(ticket, sesion.id) && ESTADOS_CON_WIZARD_ACTIVO.has(ticket.estado) && (
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

      {ticket.sistemaSoftware && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Sistema</h2>
          <p className="text-sm text-gray-700">{ticket.sistemaSoftware.nombre}</p>
          {ticket.sistemaSoftware.proveedor && <p className="text-xs text-gray-500">Proveedor: {ticket.sistemaSoftware.proveedor}</p>}
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
          tecnicos={tecnicos.map((t) => ({ id: t.id, nombre: t.nombre, rol: t.rol }))}
          colaboradoresIniciales={ticket.colaboradores.map((c) => c.usuarioId)}
          hayTrabajoEnProgreso={ticket.evidencias.length > 0 || ticket.checklistRespuestas.length > 0}
        />
      )}

      {esStaff && sesion && (
        <TareasTicketPanel
          ticketId={ticket.id}
          tareas={tareasUI}
          candidatos={tecnicos.map((t) => ({ id: t.id, nombre: t.nombre }))}
          usuarioActualId={sesion.id}
          esAdminOCoordinador={esAdminOCoordinador}
          esResponsableDelTicket={esResponsableDelTicket}
        />
      )}

      <ValidationActions ticketId={ticket.id} estado={ticket.estado} rolActual={sesion?.rol ?? null} />

      {(ticket.cotizaciones.length > 0 || puedeSolicitarCotizacion) && (
        <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">Cotizaciones</h2>
          {ticket.cotizaciones.length > 0 && (
            <div className="divide-y divide-gray-100">
              {ticket.cotizaciones.map((c) => (
                <div key={c.id} className="space-y-2 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{formatCurrency(c.monto.toNumber(), config.monedaSimbolo)}</p>
                      <p className="break-words text-sm text-gray-600">{c.descripcion}</p>
                      <p className="text-xs text-gray-400">{FORMATO_FECHA.format(c.fecha)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO_COTIZACION_ESTILO[c.estado]}`}>
                      {c.estado}
                    </span>
                  </div>
                  {esAdminOCoordinador && c.estado === "APROBADO" && c.repuestoId && (
                    <div className="flex flex-wrap items-start gap-3">
                      {c.ticketInstalacion ? (
                        <Link href={`/tickets/${c.ticketInstalacion.id}`} className="text-xs text-blue-600 underline">
                          Ver ticket de instalación ({c.ticketInstalacion.numeroTicket}) →
                        </Link>
                      ) : c.medioEnvio ? (
                        <MarcarEnvioCotizacionButton
                          cotizacionId={c.id}
                          envioActual={{ medioEnvio: c.medioEnvio, detalleEnvio: c.detalleEnvio ?? "" }}
                        />
                      ) : (
                        <>
                          <CrearTicketInstalacionButton cotizacionId={c.id} />
                          <MarcarEnvioCotizacionButton cotizacionId={c.id} envioActual={null} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {puedeSolicitarCotizacion && (
            <SolicitarCotizacionModal
              ticketId={ticket.id}
              monedaSimbolo={config.monedaSimbolo}
              productos={productosCotizables}
              puedeCrearProducto={esAdminOCoordinador}
            />
          )}
        </section>
      )}

      {checklistOrdenado.length > 0 && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Checklist de mantenimiento</h2>
          <div className="divide-y divide-gray-100">
            {checklistOrdenado.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-4 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-gray-800">{r.checklistItem.descripcion}</p>
                  {r.observacion && <p className="break-words text-xs text-gray-500">{r.observacion}</p>}
                  {r.fotoUrl && (
                    <div className="mt-1.5">
                      <ImageThumbnail src={r.fotoUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
                    </div>
                  )}
                </div>
                <span className="shrink-0 font-medium text-gray-900">{r.respuesta}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {(evidenciasResueltas.length > 0 || ticket.evidenciaNoAplica) && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Evidencia fotográfica</h2>
          {ticket.evidenciaNoAplica && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ El técnico marcó que este ticket no requería evidencia fotográfica. Motivo:{" "}
              {ticket.evidenciaNoAplicaMotivo}
            </p>
          )}
          {evidenciasResueltas.length > 0 && (
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
          )}
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
              <p className="break-words text-sm text-gray-700">
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
              {h.comentario && <p className="break-words text-sm text-gray-600">{h.comentario}</p>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
