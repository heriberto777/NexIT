import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { obtenerConfiguracion, slaHorasPorPrioridad } from "@/server/services/configuracion.service";
import { cumplioSla } from "@/lib/utils/sla";
import { calcularVigenciaPlan } from "@/lib/utils/plan-preventivo";
import { formatCurrency } from "@/lib/utils/currency";
import { estadoTicketSchema, prioridadSchema } from "@/lib/zod/ticket.schema";
import { TicketsEstadoChart } from "@/components/admin/dashboard/tickets-estado-chart";
import { TicketsPrioridadChart } from "@/components/admin/dashboard/tickets-prioridad-chart";
import { SlaCumplimientoChart, TiempoResolucionChart } from "@/components/admin/dashboard/sla-chart";
import { CargaTecnicoChart } from "@/components/admin/dashboard/carga-tecnico-chart";
import { PreventivosChart } from "@/components/admin/dashboard/preventivos-chart";

export const dynamic = "force-dynamic";

const ESTADOS_TERMINALES = new Set(["RESUELTO", "CERRADO", "CANCELADO"]);
const DIAS_CARGA_TECNICO = 30;

// Función aparte (no inline en el cuerpo del Server Component): la regla de pureza de
// React Compiler marca Date.now()/new Date() como impuro dentro de un componente, aunque
// aquí no aplique de verdad (un Server Component se ejecuta una vez por request, no se
// memoiza como un componente cliente).
function fechaHaceNDias(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

export default async function AdminDashboardPage() {
  const sesion = await getSesionActual();
  if (sesion?.rol !== "ADMIN" && sesion?.rol !== "COORDINADOR") {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">
          El dashboard es solo para Admin o Coordinador{sesion && ` (tu sesión actual es ${sesion.rol})`}.
        </p>
      </div>
    );
  }

  const hace30Dias = fechaHaceNDias(DIAS_CARGA_TECNICO);

  const [tickets, planes, repuestos, config] = await Promise.all([
    prisma.ticket.findMany({
      select: {
        estado: true,
        prioridad: true,
        fechaCreacion: true,
        fechaResolucion: true,
        tecnicoAsignado: { select: { id: true, nombre: true } },
        sla: { select: { tiempoResolucionMin: true } },
      },
    }),
    prisma.planMantenimientoPreventivo.findMany({ where: { estado: "ACTIVO" }, select: { proximaFecha: true } }),
    prisma.repuesto.findMany({ select: { stockActual: true, stockMinimo: true, costoUnidad: true } }),
    obtenerConfiguracion(),
  ]);

  const defaultsHoras = slaHorasPorPrioridad(config);

  // --- Tickets por estado (todos los estados posibles, con 0 los que no tengan) ---
  const porEstado = estadoTicketSchema.options.map((estado) => ({
    estado,
    cantidad: tickets.filter((t) => t.estado === estado).length,
  }));

  // --- Tickets abiertos por prioridad ---
  const ticketsActivos = tickets.filter((t) => !ESTADOS_TERMINALES.has(t.estado));
  const porPrioridad = prioridadSchema.options.map((prioridad) => ({
    prioridad,
    cantidad: ticketsActivos.filter((t) => t.prioridad === prioridad).length,
  }));

  // --- Cumplimiento de SLA (tickets ya resueltos/cerrados) ---
  const resueltos = tickets.filter((t) => t.fechaResolucion !== null);
  const cumplidos = resueltos.filter((t) => cumplioSla(t, defaultsHoras) === true).length;
  const vencidos = resueltos.length - cumplidos;

  // --- Tiempo promedio de resolución por prioridad (horas) ---
  const tiempoResolucion = prioridadSchema.options.map((prioridad) => {
    const deEstaPrioridad = resueltos.filter((t) => t.prioridad === prioridad);
    const horasPromedio =
      deEstaPrioridad.length === 0
        ? 0
        : deEstaPrioridad.reduce((acc, t) => acc + (t.fechaResolucion!.getTime() - t.fechaCreacion.getTime()) / 3_600_000, 0) /
          deEstaPrioridad.length;
    return { prioridad, horasPromedio };
  });

  // --- Carga por técnico ---
  const tecnicosMap = new Map<string, { tecnico: string; activos: number; resueltosUltimos30Dias: number }>();
  for (const t of tickets) {
    if (!t.tecnicoAsignado) continue;
    const entry = tecnicosMap.get(t.tecnicoAsignado.id) ?? { tecnico: t.tecnicoAsignado.nombre, activos: 0, resueltosUltimos30Dias: 0 };
    if (!ESTADOS_TERMINALES.has(t.estado)) entry.activos += 1;
    if (t.fechaResolucion && t.fechaResolucion >= hace30Dias) entry.resueltosUltimos30Dias += 1;
    tecnicosMap.set(t.tecnicoAsignado.id, entry);
  }
  const cargaTecnico = [...tecnicosMap.values()]
    .filter((t) => t.activos > 0 || t.resueltosUltimos30Dias > 0)
    .sort((a, b) => b.activos - a.activos);

  // --- Preventivos por vigencia ---
  const vigenciaLabel: Record<string, "Vencido" | "Próximo a vencer" | "Programado"> = {
    vencido: "Vencido",
    proximo: "Próximo a vencer",
    programado: "Programado",
  };
  const conteoVigencia = { Vencido: 0, "Próximo a vencer": 0, Programado: 0 };
  for (const p of planes) {
    conteoVigencia[vigenciaLabel[calcularVigenciaPlan(p.proximaFecha, config.diasVentanaProximoPreventivo)]] += 1;
  }
  const preventivosPorVigencia = (Object.entries(conteoVigencia) as [keyof typeof conteoVigencia, number][]).map(
    ([vigencia, cantidad]) => ({ vigencia, cantidad }),
  );

  // --- Inventario ---
  const repuestosCriticos = repuestos.filter((r) => r.stockActual <= r.stockMinimo).length;
  const valorInventario = repuestos.reduce((acc, r) => acc + r.stockActual * r.costoUnidad.toNumber(), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-4 bg-gray-50 px-4 py-6">
      <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Tickets activos" value={ticketsActivos.length} />
        <KpiCard label="Repuestos con stock crítico" value={repuestosCriticos} tone={repuestosCriticos > 0 ? "red" : undefined} />
        <KpiCard label="Valor de inventario" value={formatCurrency(valorInventario, config.monedaSimbolo)} />
        <KpiCard label="Preventivos vencidos" value={conteoVigencia.Vencido} tone={conteoVigencia.Vencido > 0 ? "red" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TicketsEstadoChart data={porEstado} />
        <TicketsPrioridadChart data={porPrioridad} />
        <SlaCumplimientoChart cumplidos={cumplidos} vencidos={vencidos} />
        <TiempoResolucionChart data={tiempoResolucion} />
        <CargaTecnicoChart data={cargaTecnico} />
        <PreventivosChart data={preventivosPorVigencia} />
      </div>
    </div>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: number | string; tone?: "red" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "red" ? "text-red-600" : "text-gray-900"}`}>{value}</p>
    </div>
  );
}
