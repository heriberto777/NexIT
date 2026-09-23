"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/server/actions/auth/login";
import { Button } from "@/components/ui/button";

export function LoginForm({ allowDevImpersonation }: { allowDevImpersonation: boolean }) {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const [state, formAction, isPending] = useActionState(login, { error: null });

  return (
    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">NexIT</h1>
        <p className="text-sm text-gray-500">Inicia sesión para continuar</p>
      </div>

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />

        {state.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Correo</label>
          <input
            type="email"
            name="email"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="tecnico@nexit.dev"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contraseña</label>
          <input
            type="password"
            name="password"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="••••••••"
          />
        </div>

        <Button type="submit" disabled={isPending} className="w-full">
          {isPending ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>

      {allowDevImpersonation && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Modo desarrollo: también puedes navegar directo a /admin, /portal o /tickets y usar el selector de
          impersonación en pantalla, sin necesidad de iniciar sesión aquí.
        </p>
      )}
    </div>
  );
}
