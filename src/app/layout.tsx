import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Dinámico (no un objeto `metadata` estático) porque el nombre viene de
// ConfiguracionSistema.empresaNombre (editable desde /admin/configuracion →
// "Perfil de la empresa", con fallback a la env var EMPRESA_NOMBRE) — nunca un valor
// fijo en código, mismo criterio que el resto del branding (logo, PDF, etc.).
export async function generateMetadata(): Promise<Metadata> {
  const config = await obtenerConfiguracion();
  return {
    title: config.empresaNombre,
    description: `Sistema de gestión de servicio técnico — ${config.empresaNombre}`,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* suppressHydrationWarning: extensiones de navegador (ej. ClickUp) inyectan clases
          en <body> antes de que React hidrate — no es un mismatch real de la app. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
