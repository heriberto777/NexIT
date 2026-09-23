"use client";

import { useRouter } from "next/navigation";

interface Props {
  usuarios: { email: string; nombre: string; clienteNombre: string }[];
  emailActual: string;
}

// Dev-only: cambiar rápido de "empresa cliente" sin editar cookies a mano — útil para
// probar que el filtrado por clienteId realmente aísla los datos entre tenants.
export function DevUserSwitcher({ usuarios, emailActual }: Props) {
  const router = useRouter();

  function handleChange(email: string) {
    document.cookie = `x-dev-user-email=${email}; path=/`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
      <span className="font-medium">Dev: impersonando</span>
      <select
        value={emailActual}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-amber-300 bg-white px-1.5 py-0.5 text-xs"
      >
        {usuarios.map((u) => (
          <option key={u.email} value={u.email}>
            {u.nombre} — {u.clienteNombre}
          </option>
        ))}
      </select>
    </div>
  );
}
