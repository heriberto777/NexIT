import { prisma } from "@/lib/prisma";
import { requireUsuario } from "@/server/auth/session";
import { EditarPerfilForm } from "@/components/perfil/editar-perfil-form";
import { CambiarPasswordForm } from "@/components/perfil/cambiar-password-form";

export const dynamic = "force-dynamic";

const ROL_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  COORDINADOR: "Coordinador",
  TECNICO: "Técnico",
  CLIENTE: "Cliente",
};

export default async function PerfilPage() {
  const sesion = await requireUsuario();
  // SesionUsuario (JWT) no trae telegramChatId/whatsappTelefono — se lee fresco de BD
  // para que el formulario siempre muestre el valor real, no uno potencialmente
  // desactualizado desde el último login.
  const usuario = await prisma.usuario.findUniqueOrThrow({ where: { id: sesion.id } });

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500">{ROL_LABEL[usuario.rol] ?? usuario.rol}</p>
      </div>

      <EditarPerfilForm
        nombre={usuario.nombre}
        email={usuario.email}
        telegramChatId={usuario.telegramChatId}
        whatsappTelefono={usuario.whatsappTelefono}
      />
      <CambiarPasswordForm />
    </div>
  );
}
