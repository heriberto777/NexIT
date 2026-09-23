import { logout } from "@/server/actions/auth/logout";

export function LogoutButton() {
  return (
    <form action={logout}>
      <button type="submit" className="text-sm text-gray-500 hover:text-red-600">
        Cerrar sesión
      </button>
    </form>
  );
}
