import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { CrearTicketForm } from "@/components/tickets/crear-ticket-form";

export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = new Set(["ADMIN", "COORDINADOR", "TECNICO"]);

export default async function NuevoTicketPage() {
  const sesion = await getSesionActual();
  if (!sesion || !ROLES_PERMITIDOS.has(sesion.rol)) {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">
          Crear tickets manualmente es solo para Admin, Coordinador o Técnico
          {sesion && ` (tu sesión actual es ${sesion.rol})`}.
        </p>
      </div>
    );
  }

  const clientes = await prisma.cliente.findMany({
    where: { estado: "ACTIVO" },
    include: { sucursales: { include: { activos: { include: { categoria: true } } } } },
    orderBy: { nombre: "asc" },
  });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <Link href="/tickets" className="text-sm text-blue-600 underline">
        ← Volver al listado
      </Link>
      <h1 className="text-lg font-semibold text-gray-900">Crear ticket (reporte telefónico)</h1>
      <p className="text-sm text-gray-500">
        Úsalo cuando un cliente llama en vez de reportar desde el portal. Queda registrado con origen &quot;Teléfono&quot;.
      </p>
      <CrearTicketForm
        clientes={clientes.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          sucursales: c.sucursales.map((s) => ({
            id: s.id,
            nombre: s.nombre,
            activos: s.activos.map((a) => ({
              id: a.id,
              label: `${a.categoria.nombre} — ${a.marca} ${a.modelo} (${a.numeroSerie})`,
            })),
          })),
        }))}
      />
    </div>
  );
}
