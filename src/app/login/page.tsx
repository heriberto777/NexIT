import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

// Sin esto, Next.js pre-renderiza esta página como estática en build y congela
// `process.env.ALLOW_DEV_IMPERSONATION` con el valor que tenía en ESE momento —
// el .env real del contenedor en runtime (via env_file) nunca se vuelve a leer.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const config = await obtenerConfiguracion();
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm allowDevImpersonation={process.env.ALLOW_DEV_IMPERSONATION === "true"} empresaNombre={config.empresaNombre} />
      </Suspense>
    </div>
  );
}
