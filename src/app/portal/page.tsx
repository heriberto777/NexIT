import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { calcularEstadoSla } from "@/lib/utils/sla";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { EstadoBadge } from "@/components/tickets/estado-badge";
import { PrioridadBadge } from "@/components/tickets/prioridad-badge";

export const dynamic = "force-dynamic";

const ESTADOS_ACTIVOS = ["ABIERTO", "ASIGNADO", "EN_DIAGNOSTICO", "ESPERANDO_REPUESTO", "EN_EJECUCION", "ESPERANDO_VALIDACION", "REABIERTO"];
const ESTADOS_RESUELTOS = ["RESUELTO", "CERRADO"];

export default async function PortalDashboardPage() {
  const sesion = await getSesionActual();
  const clienteId = sesion!.clienteId!;

  const [tickets, config] = await Promise.all([
    prisma.ticket.findMany({
      where: { clienteId },
      include: { sucursal: true, sla: true },
      orderBy: { fechaCreacion: "desc" },
    }),
    obtenerConfiguracion(),
  ]);
  const defaultsHoras = slaHorasPorPrioridad(config);

  const activos = tickets.filter((t) => ESTADOS_ACTIVOS.includes(t.estado));
  const enRevision = tickets.filter((t) => t.estado === "ESPERANDO_VALIDACION");
  const resueltos = tickets.filter((t) => ESTADOS_RESUELTOS.includes(t.estado));
  const vencidos = tickets.filter((t) => calcularEstadoSla(t, defaultsHoras) === "vencido");
  const recientes = tickets.slice(0, 5);

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Hola, {sesion!.nombre.split(" ")[0]}</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/portal/tickets?estado=activos" className="rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-300">
          <p className="text-xs text-gray-500">Activos</p>
          <p className="text-2xl font-semibold text-gray-900">{activos.length}</p>
        </Link>
        <Link href="/portal/tickets?estado=ESPERANDO_VALIDACION" className="rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-300">
          <p className="text-xs text-gray-500">En revisión</p>
          <p className="text-2xl font-semibold text-amber-600">{enRevision.length}</p>
        </Link>
        <Link href="/portal/tickets?estado=resueltos" className="rounded-xl border border-gray-200 bg-white p-3 hover:border-blue-300">
          <p className="text-xs text-gray-500">Resueltos</p>
          <p className="text-2xl font-semibold text-green-600">{resueltos.length}</p>
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs text-gray-500">Vencidos</p>
          <p className="text-2xl font-semibold text-red-600">{vencidos.length}</p>
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Solicitudes recientes</h2>
          <Link href="/portal/tickets" className="text-sm text-blue-600 hover:underline">
            Ver todas
          </Link>
        </div>
        <ul className="divide-y divide-gray-100">
          {recientes.map((t) => (
            <li key={t.id}>
              <Link href={`/portal/tickets/${t.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    #{t.numeroTicket} — {t.titulo}
                  </p>
                  <p className="text-xs text-gray-500">{t.sucursal.nombre}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <PrioridadBadge prioridad={t.prioridad} />
                  <EstadoBadge estado={t.estado} />
                </div>
              </Link>
            </li>
          ))}
          {recientes.length === 0 && <p className="py-6 text-center text-sm text-gray-400">Aún no tienes solicitudes registradas.</p>}
        </ul>
      </section>
    </div>
  );
}
