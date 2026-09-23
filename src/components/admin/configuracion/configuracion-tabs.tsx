"use client";

import { useState } from "react";
import { BrandingForm, type BrandingValues } from "@/components/admin/configuracion/branding-form";
import { SmtpForm, type SmtpValues } from "@/components/admin/configuracion/smtp-form";
import { WebhooksForm, type WebhooksValues } from "@/components/admin/configuracion/webhooks-form";
import { ParametrosForm, type ParametrosValues } from "@/components/admin/configuracion/parametros-form";

const TABS = [
  { id: "branding", label: "Perfil de la empresa" },
  { id: "smtp", label: "Servidor de correo" },
  { id: "webhooks", label: "Integraciones" },
  { id: "parametros", label: "Parámetros y SLA" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props {
  branding: BrandingValues;
  logoUrl: string | null;
  smtp: SmtpValues;
  webhooks: WebhooksValues;
  parametros: ParametrosValues;
}

export function ConfiguracionTabs({ branding, logoUrl, smtp, webhooks, parametros }: Props) {
  const [tab, setTab] = useState<TabId>("branding");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t.id ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-100"
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
    </div>
  );
}
