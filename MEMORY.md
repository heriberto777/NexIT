# NexIT — Memoria de decisiones de arquitectura

Este documento no es un changelog cronológico ni un resumen de conversaciones — registra
**decisiones y el porqué detrás de ellas**, para que cualquiera (humano o agente) que
retome el proyecto entienda las restricciones sin tener que re-derivarlas leyendo commits
sueltos. Actualízalo cuando se tome una decisión de arquitectura nueva o se corrija una
equivocada; no lo uses para tareas en progreso ni para detalles que ya están claros en
el código.

## Multi-tenancy: aplicación, no RLS

El aislamiento entre clientes (empresas) es 100% vía `clienteId` en las queries de
Prisma — **no** hay Row-Level Security en Postgres. Se evaluó explícitamente al migrar
a un Postgres compartido (`dev-infra`) y se confirmó que no hace falta `BYPASSRLS` ni
ningún privilegio especial para el rol `nexit_user`, precisamente porque no hay
políticas RLS activas. Si en algún momento se agrega RLS forzado, hay que revisar ese
permiso explícitamente — no está cubierto por el modelo actual.

## Storage: se persiste la `key`, nunca la URL resuelta

`StorageProvider.upload()` devuelve una key estable, y es eso lo que va a la base de
datos (`Evidencia.urlArchivo`, `FirmaDigital.urlFirmaImagen`,
`ConfiguracionSistema.empresaLogoUrl`). Una URL firmada de S3/R2 expira (1h); si se
persistiera directamente, el dato quedaría roto a las pocas horas. La resolución a URL
mostrable ocurre en cada lectura vía `getPublicUrl(key)`.

## Autorización: rol vs. propiedad del recurso

El middleware y los layouts solo validan **rol** (¿puede este usuario entrar a
`/tickets/*`?). La propiedad del recurso (¿es *este* técnico el asignado a *este*
ticket?) debe validarse dentro de cada Server Action. Se encontró y corrigió un gap real
donde 5 de 6 Server Actions del wizard de ejecución (diagnóstico, checklist, firma,
repuestos, finalizar visita) no verificaban `ticket.tecnicoAsignadoId === usuario.id` —
solo `iniciar-atencion.ts` lo hacía. Cualquier técnico autenticado podía mutar el ticket
de otro con solo conocer su ID. Lección: al agregar una Server Action nueva sobre un
ticket ya asignado, copiar el chequeo de propiedad explícitamente — no asumir que algo
más arriba en la cadena ya lo cubre.

## Inventario: updates atómicos, no leer-decidir-escribir

`registrar-repuesto.ts` y `registrar-movimiento-inventario.ts` originalmente leían
`stockActual`, decidían en memoria si alcanzaba, y luego escribían — vulnerable a dos
requests concurrentes pasando ambas la validación con el mismo stock stale. Se corrigió
con `updateMany({ where: { id, stockActual: { gte: cantidad } } })`: la condición la
evalúa Postgres en el momento de escribir, no el proceso Node de antemano. Verificado
con un test real de `Promise.all` concurrente.

## Wizard de ejecución: el estado inicial se deriva del servidor

`execution-wizard.tsx` originalmente arrancaba siempre en el paso 1 vía `useState`, sin
importar el estado real del ticket. Recargar la página de un ticket ya "check-in"
permitía volver a pulsar "Iniciar Atención", sobrescribiendo `fechaInicioAtencion` y
duplicando entradas de historial. Se corrigió con `calcularPasoInicial()`, que deriva el
paso desde `fechaInicioAtencion`, `tieneFirma` y conteo de evidencias reales — nunca
confiar en estado de componente para algo que el servidor ya sabe con certeza.

## Checklist vacío no es un caso de error

Un ticket puede no tener `ChecklistTemplate` asociado (categoría de activo sin plantilla
definida). Eso es válido, no un caso excepcional — el wizard debe permitir continuar sin
checklist (`"Continuar sin checklist"`) y `guardarChecklistSchema` no debe exigir al
menos 1 respuesta.

## Preventivos: ponerse al día de una sola corrida

Un plan de mantenimiento preventivo atrasado varios períodos (ej. el cron no corrió en
4 meses) solo avanzaba `proximaFecha` un período por ejecución, quedando en el pasado
y generando tickets duplicados/atrasados en corridas sucesivas. `proximaFechaFutura()`
hace loop hasta que la fecha calculada es realmente futura, en una sola llamada.

## `ConfiguracionSistema`: singleton con fallback a `.env`

Branding, SMTP, webhooks y defaults de SLA viven en una fila singleton
(`id: "singleton"`) en vez de variables de entorno puras, para que un ADMIN los edite
desde `/admin/configuracion` sin redeploy. `obtenerConfiguracion()` cachea 5s en
memoria y cae a `.env` campo por campo si la fila aún no tiene ese valor seteado —
nunca leer `process.env` directamente para estos valores fuera de ese service, o se
rompe la consistencia entre lo que el ADMIN ve configurado y lo que realmente se usa.

## Webhooks: fire-and-forget, y nunca apuntarlos a esta misma app

`emitirEvento()` nunca se `await`ea desde el caller — un webhook lento o caído no debe
bloquear la respuesta al usuario. Firma HMAC-SHA256 + Bearer token, ambos derivados de
`WEBHOOK_SECRET` en `ConfiguracionSistema`. Incidente real durante pruebas: se apuntó
`WEBHOOK_N8N_URL` al propio endpoint `/api/cron/sla-check` de esta app (que a su vez
emite webhooks `SLA_EN_RIESGO`), generando un loop de requests en cascada. Se resolvió
apagando `webhooksHabilitados` directo en BD y reiniciando el servidor. Nunca apuntar el
webhook de esta app a una ruta de esta misma app que también dispare webhooks.

## Docker: dev vs. prod son intencionalmente dos compose distintos

- `docker-compose.yml` (raíz) — **solo desarrollo local**. Construye desde
  `Dockerfile` (single-stage, `npm run dev`, bind mount para hot-reload real de
  Turbopack). Reconstruye su propia `DATABASE_URL`/`REDIS_URL` con
  `host.docker.internal` a partir de `NEXIT_DB_USER`/`NEXIT_DB_PASSWORD`/`NEXIT_DB_NAME`
  en `.env`, porque el `127.0.0.1` que usa `npm run dev` en el host apunta al
  contenedor mismo si se usa sin cambios dentro de Docker.
- `docker-compose.prod.yml` — **solo producción**. Consume la imagen ya construida y
  publicada en GHCR (`.github/workflows/deploy-prod.yml`, dispara en push a
  `main`/tag `v*`), nunca hace build local. Se conecta a la red externa `dev-network`
  del servidor real (Proxmox), distinta del `dev-infra` local de desarrollo aunque el
  nombre sea parecido — no confundir ambos contextos.
- Mismo patrón usado en `sistema-del-sol` (otro proyecto del mismo autor) — se copió
  deliberadamente para mantener consistencia operativa entre proyectos en el mismo
  servidor.
- El contenedor de producción se sigue llamando `nexit` en ambos esquemas (compatibilidad
  de `docker logs`/`docker exec`), pero **siempre** hay que pasar
  `-f docker-compose.prod.yml` explícito en el servidor — sin ese flag, Compose usaría
  por defecto el `docker-compose.yml` de desarrollo.

## Postgres/Redis compartidos (`dev-infra`)

NexIT no tiene su propio contenedor de Postgres/Redis en desarrollo — usa el stack
compartido de `C:\dev-infra` (Postgres 16 @5432, Redis @6379), con un rol/base propios
(`nexit_user`/`nexit_db`), nunca las credenciales de otro proyecto que viva en el mismo
Postgres compartido (ej. `sol`/`sistema_del_sol`, que es de otro proyecto). El
contenedor propio anterior (`nexit-postgres-dev`) se dejó detenido sin borrar como
respaldo, no se eliminó su volumen.

## Deuda técnica conocida, sin acción pendiente

- 3 schemas Zod huérfanos (`crearTicketSchema`, `cambiarEstadoTicketSchema`,
  `registrarEvidenciaSchema`) definidos pero nunca importados por ningún Server Action.
  Bajo riesgo, no se ha pedido limpiarlos.
- La aprobación de `Cotizacion` no emite ningún evento webhook — quedó fuera de alcance
  explícito cuando se diseñó esa funcionalidad.
