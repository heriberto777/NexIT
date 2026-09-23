import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

// Sin esto, Next.js pre-renderiza esta página como estática en build y congela
// `process.env.ALLOW_DEV_IMPERSONATION` con el valor que tenía en ESE momento —
// el .env real del contenedor en runtime (via env_file) nunca se vuelve a leer.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm allowDevImpersonation={process.env.ALLOW_DEV_IMPERSONATION === "true"} />
      </Suspense>
    </div>
  );
}
