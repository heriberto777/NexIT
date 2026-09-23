@AGENTS.md

# NexIT — Contexto del proyecto

IT Service Desk / Field Service Management SaaS multi-tenant. Un cliente (empresa)
tiene sucursales, activos, contratos con SLA por prioridad, y técnicos que atienden
tickets (correctivos, preventivos, instalaciones) desde captación hasta cierre con
checklist, evidencias fotográficas, firma digital y repuestos.

Ver también [`MEMORY.md`](./MEMORY.md) — decisiones de arquitectura y el porqué detrás
de patrones no evidentes con solo leer el código.

## Stack

- Next.js 16 (App Router, Turbopack, Server Actions) + React 19 + TypeScript
- Prisma 6 + PostgreSQL (sin Row-Level Security — el aislamiento multi-tenant es
  100% a nivel de aplicación, vía `clienteId` en cada query)
- Auth.js v5 (`next-auth@beta`), sesión JWT
- Zod para validación de todos los Server Actions
- Tailwind CSS v4
- `@react-pdf/renderer` para informes de servicio en PDF
- `nodemailer` para SMTP, webhooks salientes propios (sin cola/broker) hacia n8n

## Roles y autorización

`RolUsuario`: `ADMIN`, `COORDINADOR`, `CLIENTE`, `TECNICO`.

- `src/middleware.ts` — gate por prefijo de ruta (`/admin`, `/portal`, `/tickets`) según
  rol. Corre en Edge Runtime, así que **no** puede consultar Prisma — solo valida la
  sesión real de Auth.js o la presencia de cookies de impersonación dev.
- `src/server/auth/session.ts` — `getSesionActual()` / `requireUsuario(rolRequerido?)`
  son el único contrato que debe usar el resto del código (Server Actions, páginas).
  Internamente decide entre la sesión real de Auth.js y, solo si
  `ALLOW_DEV_IMPERSONATION="true"` **y** no hay sesión real, un
  `MockDevAuthProvider` que impersona un usuario sembrado (por `x-dev-user-email` o
  `x-dev-user-role`). Este flag debe estar apagado/ausente en producción.
- **Todo Server Action que actúa sobre un ticket asignado a un técnico debe verificar
  explícitamente `ticket.tecnicoAsignadoId === usuario.id`** — el middleware/layout
  solo valida el rol, no la propiedad del recurso. (Ver `MEMORY.md` — esto fue un gap
  de seguridad real, ya corregido en todas las acciones del wizard de ejecución.)
- El técnico no tiene prefijo de URL propio: su pantalla de ejecución vive en
  `/tickets/[id]/ejecucion` dentro del route group `(tecnico)` (no aparece en la URL).

## Convenciones que no son obvias leyendo un solo archivo

- **Multi-tenancy**: siempre filtrar por `clienteId` en las queries — no hay ninguna
  política de RLS en Postgres que lo haga por ti.
- **Storage**: `storageService.upload()` devuelve una `key` estable — eso es lo que se
  persiste en BD (`Evidencia.urlArchivo`, `FirmaDigital.urlFirmaImagen`,
  `ConfiguracionSistema.empresaLogoUrl`), **nunca** una URL ya resuelta (una URL
  firmada de S3 expira). `getPublicUrl(key)` resuelve la key a algo mostrable en cada
  lectura.
- **Updates de stock/inventario**: usar siempre `updateMany({ where: { id, stockActual:
  { gte: cantidad } } })` (condición evaluada por Postgres al escribir), nunca
  leer-decidir-escribir — corrige una race condition real bajo escritura concurrente.
- **`ConfiguracionSistema`**: fila singleton (`id: "singleton"`), leída vía
  `obtenerConfiguracion()` (`src/server/services/configuracion.service.ts`), con cache
  en memoria de 5s y fallback a variables de entorno si la fila aún no tiene un campo
  seteado. Nunca leer `process.env` directamente para branding/SMTP/webhooks/SLA
  defaults fuera de ese service.
- **Webhooks**: `emitirEvento()` es fire-and-forget — nunca `await`ado por quien lo
  llama. Firma HMAC-SHA256 (`X-NexIT-Signature`) + Bearer token. Nunca apuntar
  `WEBHOOK_N8N_URL` a una ruta de esta misma app que a su vez emita webhooks (riesgo de
  loop — ya ocurrió una vez en pruebas).
- **Wizard de ejecución** (`execution-wizard.tsx`): el paso inicial se deriva de estado
  real del servidor (`fechaInicioAtencion`, `tieneFirma`, evidencias) vía
  `calcularPasoInicial()`, nunca de un `useState` reseteado a 1 — evita duplicar
  entradas de historial al recargar la página.
- **Preventivos**: `proximaFechaFutura()` hace *loop* hasta que la fecha calculada es
  realmente futura (no solo un salto de frecuencia) — un plan atrasado varios períodos
  se pone al día en una sola corrida.
- **`react-hooks/set-state-in-effect`**: este proyecto usa la regla estricta de ESLint
  que prohíbe `setState` síncrono dentro de un `useEffect`. Envolver esas llamadas en
  `queueMicrotask(() => { ... })`.

## Estructura

```
src/
  app/            Rutas (App Router). (tecnico)/ es un route group sin segmento propio.
  auth.ts         Config de Auth.js v5
  middleware.ts   Gate de rutas por rol (Edge Runtime)
  components/     UI, agrupada por dominio (admin/, checklist/, portal/, tickets/, ui/)
  lib/
    prisma.ts     Cliente Prisma singleton
    zod/          Schemas de validación, uno por dominio
    utils/        Helpers puros (sla.ts, ticket-estado.ts, plan-preventivo.ts, cn.ts)
  server/
    actions/      Server Actions, organizadas por dominio/rol (admin/, tickets/, portal/, auth/)
    auth/         session.ts (contrato de sesión)
    services/     Lógica de negocio sin UI (webhook, sla-monitor, preventivos, storage,
                  configuracion, email, pdf/)
  types/          Tipos compartidos que no calzan en un modelo Prisma directo
prisma/
  schema.prisma   Fuente de verdad del modelo de datos
  seed.ts         Datos de ejemplo (clientes/usuarios/tickets)
```

## Comandos

```bash
# Desarrollo directo en host (requiere Postgres/Redis de C:\dev-infra corriendo)
npm run dev

# Desarrollo en Docker (hot-reload vía bind mount, mismo Postgres de dev-infra
# alcanzado vía host.docker.internal)
docker compose up -d
docker compose logs -f nexit-dev

# Prisma
npx prisma migrate dev        # nueva migración en desarrollo
npx prisma db seed            # datos de ejemplo
npx prisma studio

# Producción — NUNCA build local, siempre imagen de GHCR (ver .github/workflows/deploy-prod.yml)
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Ver [`DEPLOYMENT.md`](./DEPLOYMENT.md) para el despliegue completo en Proxmox y
[`N8N_INTEGRATION.md`](./N8N_INTEGRATION.md) para la integración de webhooks con n8n.

## Al trabajar en este repo

- Antes de dar por buena una funcionalidad que toca UI, verificar en navegador real
  (Chrome DevTools MCP), no solo con tipos/build.
- Antes de cambiar algo relacionado a `docker-compose.yml` vs `docker-compose.prod.yml`,
  confirmar cuál de los dos aplica — son intencionalmente distintos (dev = build local
  + host.docker.internal: prod = imagen GHCR + red `dev-network` real del servidor).
- Nunca reutilizar credenciales de otro proyecto que viva en el mismo Postgres
  compartido de `dev-infra` (ver `.env`, comentarios sobre `nexit_user`/`nexit_db`).
