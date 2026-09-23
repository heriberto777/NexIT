import { prisma } from "@/lib/prisma";
import { getSesionActual } from "@/server/auth/session";
import { rolUsuarioSchema, estadoUsuarioSchema } from "@/lib/zod/usuario.schema";
import { UsuarioFormModal } from "@/components/admin/usuario-form-modal";
import { UsuarioEstadoToggle } from "@/components/admin/usuario-estado-toggle";
import { ResetearPasswordButton } from "@/components/admin/resetear-password-button";

export const dynamic = "force-dynamic";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { dateStyle: "short", timeStyle: "short" });

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  COORDINADOR: "Coordinador",
  TECNICO: "Técnico",
  CLIENTE: "Cliente",
};

interface PageProps {
  searchParams: Promise<{ rol?: string; estado?: string; q?: string }>;
}

export default async function UsuariosPage({ searchParams }: PageProps) {
  const sesion = await getSesionActual();
  if (sesion?.rol !== "ADMIN") {
    return (
      <div className="mx-auto max-w-md space-y-2 px-4 py-10 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Acceso restringido</h1>
        <p className="text-sm text-gray-600">La gestión de usuarios es solo para el rol Admin{sesion && ` (tu sesión actual es ${sesion.rol})`}.</p>
      </div>
    );
  }

  const params = await searchParams;
  const rol = rolUsuarioSchema.safeParse(params.rol).success ? params.rol : undefined;
  const estado = estadoUsuarioSchema.safeParse(params.estado).success ? params.estado : undefined;
  const q = params.q?.trim() || undefined;

  const [usuarios, clientes] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        rol: rol as never,
        estado: estado as never,
        OR: q ? [{ nombre: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] : undefined,
      },
      include: { cliente: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.cliente.findMany({ orderBy: { nombre: "asc" } }),
  ]);

  const hayFiltros = Boolean(rol || estado || q);

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Usuarios</h1>
        <UsuarioFormModal clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} />
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-gray-200 bg-white p-3" method="GET">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">Buscar</label>
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nombre o correo..."
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Rol</label>
          <select name="rol" defaultValue={rol ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {rolUsuarioSchema.options.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Estado</label>
          <select name="estado" defaultValue={estado ?? ""} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Filtrar
        </button>
        {hayFiltros && (
          <a href="/admin/usuarios" className="text-sm text-gray-500 underline">
            Limpiar filtros
          </a>
        )}
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
              <th className="px-3 py-2 font-medium">Nombre</th>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Rol</th>
              <th className="px-3 py-2 font-medium">Empresa</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Último acceso</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">{u.nombre}</td>
                <td className="px-3 py-2 text-gray-600">{u.email}</td>
                <td className="px-3 py-2 text-gray-600">{ROL_LABEL[u.rol]}</td>
                <td className="px-3 py-2 text-gray-600">{u.cliente?.nombre ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.estado === "ACTIVO" ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {u.estado}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{u.ultimoAccesoAt ? FORMATO_FECHA.format(u.ultimoAccesoAt) : "Nunca"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <UsuarioFormModal
                      clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))}
                      usuarioExistente={{
                        id: u.id,
                        nombre: u.nombre,
                        email: u.email,
                        rol: u.rol,
                        clienteId: u.clienteId,
                        especialidad: u.especialidad,
                      }}
                    />
                    <ResetearPasswordButton id={u.id} nombre={u.nombre} />
                    <UsuarioEstadoToggle id={u.id} estado={u.estado} />
                  </div>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-400">
                  No hay usuarios que coincidan con los filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
