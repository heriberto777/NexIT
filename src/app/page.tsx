import { redirect } from "next/navigation";
import { getSesionActual } from "@/server/auth/session";

const HOME_POR_ROL: Record<string, string> = {
  CLIENTE: "/portal",
  TECNICO: "/tickets",
  COORDINADOR: "/admin",
  ADMIN: "/admin",
};

export default async function Home() {
  const sesion = await getSesionActual();

  if (!sesion) redirect("/login");
  redirect(HOME_POR_ROL[sesion.rol] ?? "/tickets");
}
