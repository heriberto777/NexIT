import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { CrearTicketForm } from "@/components/tickets/crear-ticket-form";

export const dynamic = "force-dynamic";

const ROLES_PERMITIDOS = new Set(["ADMIN", "COORDINADOR", "TECNICO"]);

interface PageProps {
  searchParams: Promise<{ contactoPendienteId?: string }>;
}

export default async function NuevoTicketPage({ searchParams }: PageProps) {
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

  const { contactoPendienteId } = await searchParams;

  const [clientes, contactoPendiente] = await Promise.all([
    prisma.cliente.findMany({
      where: { estado: "ACTIVO" },
      // Un activo dado de baja no debería recibir tickets nuevos — pero uno "fuera de
      // servicio" sí (justamente es el estado de algo roto que hay que reportar/arreglar).
      include: {
        sucursales: { include: { activos: { where: { estado: { not: "DADO_DE_BAJA" } }, include: { categoria: true } } } },
        sistemasSoftware: { where: { estado: "ACTIVO" }, orderBy: { nombre: "asc" } },
      },
      orderBy: { nombre: "asc" },
    }),
    // Solo prellena si sigue PENDIENTE — si ya se convirtió (por otra pestaña, o porque
    // alguien volvió a entrar con el mismo link), el formulario arranca en blanco.
    contactoPendienteId
      ? prisma.contactoPendiente.findFirst({ where: { id: contactoPendienteId, estado: "PENDIENTE" } })
      : Promise.resolve(null),
  ]);

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
          sistemasSoftware: c.sistemasSoftware.map((s) => ({ id: s.id, nombre: s.nombre })),
        }))}
        contactoInicial={
          contactoPendiente
            ? {
                id: contactoPendiente.id,
                nombre: contactoPendiente.nombre ?? "",
                empresaReportada: contactoPendiente.empresaReportada,
                correo: contactoPendiente.correoReportado ?? "",
                telefono: contactoPendiente.telefonoReportado,
                motivo: contactoPendiente.motivo ?? "",
              }
            : null
        }
      />
    </div>
  );
}
