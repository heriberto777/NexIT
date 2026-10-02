"use client";

import { useState } from "react";
import { BrandingForm, type BrandingValues } from "@/components/admin/configuracion/branding-form";
import { SmtpForm, type SmtpValues } from "@/components/admin/configuracion/smtp-form";
import { WebhooksForm, type WebhooksValues } from "@/components/admin/configuracion/webhooks-form";
import { ParametrosForm, type ParametrosValues } from "@/components/admin/configuracion/parametros-form";
import { CategoriasForm, type CategoriaActivoValue } from "@/components/admin/configuracion/categorias-form";
import { EspecialidadesForm, type EspecialidadValue } from "@/components/admin/configuracion/especialidades-form";
import { ZonaPeligroForm, type ConteoDatosPrueba } from "@/components/admin/configuracion/zona-peligro-form";

const TABS_BASE = [
  { id: "branding", label: "Perfil de la empresa" },
  { id: "smtp", label: "Servidor de correo" },
  { id: "webhooks", label: "Integraciones" },
  { id: "parametros", label: "Parámetros y SLA" },
  { id: "categorias", label: "Categorías de activo" },
  { id: "especialidades", label: "Especialidades" },
] as const;

type TabId = (typeof TABS_BASE)[number]["id"] | "zona-peligro";

interface Props {
  branding: BrandingValues;
  logoUrl: string | null;
  smtp: SmtpValues;
  webhooks: WebhooksValues;
  parametros: ParametrosValues;
  categorias: CategoriaActivoValue[];
  especialidades: EspecialidadValue[];
  // Presente solo cuando ALLOW_DATA_RESET="true" (ver configuracion/page.tsx) — su
  // ausencia es lo que oculta el tab entero, no un simple `if` de estilos.
  conteoDatosPrueba: ConteoDatosPrueba | null;
}

export function ConfiguracionTabs({ branding, logoUrl, smtp, webhooks, parametros, categorias, especialidades, conteoDatosPrueba }: Props) {
  const [tab, setTab] = useState<TabId>("branding");
  const tabs = conteoDatosPrueba
    ? [...TABS_BASE, { id: "zona-peligro" as const, label: "Zona de peligro" }]
    : TABS_BASE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id
                ? t.id === "zona-peligro"
                  ? "bg-red-600 text-white"
                  : "bg-blue-600 text-white"
                : t.id === "zona-peligro"
                  ? "text-red-700 hover:bg-red-50"
                  : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "branding" && <BrandingForm valores={branding} logoUrl={logoUrl} />}
      {tab === "smtp" && <SmtpForm valores={smtp} />}
      {tab === "webhooks" && <WebhooksForm valores={webhooks} />}
      {tab === "parametros" && <ParametrosForm valores={parametros} />}
      {tab === "categorias" && <CategoriasForm categorias={categorias} />}
      {tab === "especialidades" && <EspecialidadesForm especialidades={especialidades} />}
      {tab === "zona-peligro" && conteoDatosPrueba && <ZonaPeligroForm conteo={conteoDatosPrueba} />}
    </div>
  );
}
