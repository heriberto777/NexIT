import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TableScroll } from "@/components/ui/table-scroll";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";
import { EliminarContactoPendienteButton } from "@/components/admin/eliminar-contacto-pendiente-button";
import { PageContainer } from "@/components/layout/page-container";

export const dynamic = "force-dynamic";

export default async function ContactosPendientesPage() {
  const config = await obtenerConfiguracion();
  const FORMATO_FECHA = new Intl.DateTimeFormat(config.localeFecha, { dateStyle: "short", timeStyle: "short" });

  const [pendientes, recientes] = await Promise.all([
    prisma.contactoPendiente.findMany({
      where: { estado: "PENDIENTE" },
      orderBy: { fechaActualizacion: "asc" },
    }),
    prisma.contactoPendiente.findMany({
      where: { estado: "CONVERTIDO" },
      orderBy: { fechaActualizacion: "desc" },
      take: 10,
      include: { ticket: { select: { numeroTicket: true } } },
    }),
  ]);

  return (
    <PageContainer className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Contactos pendientes</h1>
        <p className="text-sm text-gray-500">
          Personas que escribieron por Telegram/WhatsApp sin estar vinculadas a ningún usuario de {config.empresaNombre}.
          Ya completaron sus datos — falta que alguien confirme el cliente real y les cree el ticket.
        </p>
      </div>

      <TableScroll>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Empresa (reportada)</th>
              <th className="px-3 py-2 font-medium">Teléfono</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Motivo</th>
              <th className="px-3 py-2 font-medium">Canal</th>
              <th className="px-3 py-2 font-medium">Recibido</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pendientes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">{c.nombre}</td>
                <td className="px-3 py-2 text-gray-700">{c.empresaReportada}</td>
                <td className="px-3 py-2 text-gray-600">{c.telefonoReportado}</td>
                <td className="px-3 py-2 text-gray-600">{c.correoReportado}</td>
                <td className="px-3 py-2 max-w-[220px] truncate text-gray-600" title={c.motivo ?? ""}>
                  {c.motivo}
                </td>
                <td className="px-3 py-2 text-gray-500">{c.canal}</td>
                <td className="px-3 py-2 text-gray-500">{FORMATO_FECHA.format(c.fechaActualizacion)}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <EliminarContactoPendienteButton id={c.id} nombre={c.nombre} />
                    <Link
                      href={`/tickets/nuevo?contactoPendienteId=${c.id}`}
                      className="whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                    >
                      Crear ticket con estos datos
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {pendientes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay contactos pendientes por atender.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableScroll>

      {recientes.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Convertidos recientemente</h2>
          <TableScroll>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Empresa (reportada)</th>
                  <th className="px-3 py-2 font-medium">Ticket</th>
                  <th className="px-3 py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recientes.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">{c.nombre}</td>
                    <td className="px-3 py-2 text-gray-600">{c.empresaReportada}</td>
                    <td className="px-3 py-2">
                      {c.ticket ? (
                        <Link href={`/tickets/${c.ticketId}`} className="text-blue-600 underline">
                          #{c.ticket.numeroTicket}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{FORMATO_FECHA.format(c.fechaActualizacion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}
    </PageContainer>
  );
}
