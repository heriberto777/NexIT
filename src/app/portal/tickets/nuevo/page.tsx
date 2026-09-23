import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { NuevoTicketWizard } from "@/components/portal/nuevo-ticket-wizard";

export const dynamic = "force-dynamic";

export default async function NuevoTicketPortalPage() {
  const sesion = await getSesionActual();
  const clienteId = sesion!.clienteId!;

  const sucursales = await prisma.sucursal.findMany({
    where: { clienteId },
    include: { activos: { include: { categoria: true } } },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Reportar una falla</h1>
      <NuevoTicketWizard
        sucursales={sucursales.map((s) => ({ id: s.id, nombre: s.nombre }))}
        activos={sucursales.flatMap((s) =>
          s.activos.map((a) => ({
            id: a.id,
            sucursalId: s.id,
            label: `${a.categoria.nombre} — ${a.marca} ${a.modelo} (${a.numeroSerie})`,
          })),
        )}
      />
    </div>
  );
}
