# Despliegue de NexIT en Proxmox (LXC/VM) + Docker

Guía paso a paso para desplegar NexIT en producción sobre un host Proxmox (contenedor
LXC sin privilegios con Docker, o una VM dedicada), usando Docker Compose y conectado a
la red compartida `dev-network` donde ya corre `postgres-core`.

## Requisitos previos en el host

- Docker Engine + Docker Compose plugin instalados.
- La red externa `dev-network` ya creada, con el contenedor `postgres-core` corriendo y
  accesible por ese nombre dentro de esa red.
- Un dominio (o subdominio) apuntando a la IP pública del host, si vas a exponer NexIT
  con TLS detrás de Nginx / Nginx Proxy Manager (recomendado).
- Sesión con permiso de `read:packages` en GHCR, si el repositorio es privado (mismo
  patrón que sistema-del-sol/bonifapp/ciguacash/ciguainv en este servidor):
  ```bash
  echo "$GHCR_TOKEN" | docker login ghcr.io -u <tu-usuario-github> --password-stdin
  ```

```bash
docker network create dev-network   # solo si aún no existe
```

## a) Clonar el repositorio y configurar `.env`

```bash
git clone <url-de-tu-repositorio> nexit
cd nexit
cp .env.example .env
```

Edita `.env` con los valores **reales de producción**. Los que más importa revisar:

| Variable | Valor esperado en producción | Por qué importa |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres-core:5432/nexit_db?schema=public` | El host `postgres-core` solo resuelve **dentro** de `dev-network` — ajusta usuario/contraseña/DB reales del servicio central. |
| `NEXTAUTH_URL` | La URL pública real, ej. `https://nexit.tuempresa.com` | Auth.js la usa como base absoluta para las redirecciones de login/logout. Si no coincide con la URL por la que entran los usuarios, el login queda "colgado" redirigiendo al lugar equivocado. |
| `AUTH_SECRET` | Un secreto único generado para este entorno: `openssl rand -base64 32` | Nunca reutilices el de `.env.example` ni el de otro entorno — invalida todas las sesiones si cambia. |
| `ALLOW_DEV_IMPERSONATION` | `"false"` (o quitar la variable) | Es el interruptor que permite loguearse como cualquier usuario sin contraseña. **Debe estar apagado en producción.** |
| `STORAGE_PROVIDER` | `"local"` (con el volumen persistente) o `"s3"` | Ver sección S3 abajo si usas AWS S3 / Cloudflare R2 / MinIO. |
| `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_BASE_URL` | Solo si `STORAGE_PROVIDER="s3"` | `S3_ENDPOINT` vacío para AWS S3 real; para MinIO/R2, la URL del endpoint S3-compatible. MinIO normalmente necesita `S3_FORCE_PATH_STYLE="true"`. |
| `WEBHOOK_N8N_URL`, `WEBHOOK_SECRET` | URL del Webhook node de n8n + un secreto propio | Sin `WEBHOOK_N8N_URL`, los eventos (`TICKET_CREADO`, `TICKET_CAMBIO_ESTADO`, `SLA_EN_RIESGO`) se descartan silenciosamente — no rompe nada, simplemente no se notifica nada. `WEBHOOK_SECRET` también protege el endpoint `/api/cron/sla-check` (ver más abajo). |

## b) Descargar y levantar con Docker Compose

Producción usa `docker-compose.prod.yml` (**no** el `docker-compose.yml` de la raíz —
ese es el de desarrollo local con Docker, ver [`README` dev](#desarrollo-local-alternativo-a-npm-run-dev)
más abajo). La imagen ya viene compilada y publicada en GHCR por CI
(`.github/workflows/deploy-prod.yml`, dispara en cada push a `main`/tag `v*`), así que
en el servidor **nunca se hace `build` local**, solo `pull`:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

`pull` descarga `ghcr.io/<owner>/nexit:latest` (o el tag que definas en `.env` vía
`IMAGE_TAG`). `up -d` crea el contenedor `nexit`, lo conecta a `dev-network` y monta el
volumen persistente `nexit_uploads`.

> Recuerda siempre pasar `-f docker-compose.prod.yml` en el servidor — sin ese flag,
> Docker Compose usaría por defecto `docker-compose.yml` (el de desarrollo), que
> intenta compilar desde código fuente y no aplica en producción.

## c) Migraciones y datos iniciales

El contenedor **no** necesita un paso manual de migración: `docker-entrypoint.sh`
corre `npx prisma migrate deploy` automáticamente cada vez que arranca (incluyendo
reinicios), antes de levantar el servidor Next.js. Verifica que corrió bien:

```bash
docker logs -f nexit
```

Deberías ver algo como:

```
==> Aplicando migraciones de Prisma (migrate deploy)...
N migrations found in prisma/migrations
No pending migrations to apply.      # o "N migrations applied" en un entorno limpio
==> Iniciando NexIT...
▲ Next.js ...
✓ Ready in ...
```

Si es un entorno **limpio** (base de datos recién creada, sin usuarios/clientes de
ejemplo), corre el seed inicial una sola vez:

```bash
docker compose -f docker-compose.prod.yml exec nexit npx prisma db seed
```

Esto crea los clientes, usuarios (admin/coordinador/técnico/cliente) y tickets de
ejemplo — útil para verificar el despliegue, no estrictamente necesario si vas a
cargar datos reales desde cero vía la UI.

## d) Reverse proxy (SSL, WebSockets, uploads grandes)

`nexit` publica el puerto **8089** al host (`"8089:3000"` en
`docker-compose.prod.yml`) — siguiente libre en el rango `808x` que ya usan los demás
proyectos de este servidor. Esto es un extra para acceso directo/debug por
`IP:8089`, no el camino principal: el reverse proxy sigue llegando por nombre de
contenedor dentro de `dev-network`, sin depender de ese puerto.

**Con Nginx Proxy Manager (el caso real de este servidor)**: en el Proxy Host,
**Forward Hostname/IP** = `nexit`, **Forward Port** = `3000` (NPM resuelve el nombre
del contenedor porque comparte la red `dev-network` — no hace falta usar el 8089 para
esto). Activa "Websockets Support", pide el certificado Let's Encrypt desde la misma
pantalla, y en la pestaña "Advanced" agrega:

```nginx
client_max_body_size 20M;
```

Sin esto, las evidencias fotográficas y PDFs generados (pueden pesar varios MB) se
rechazan con 413 antes de llegar a la app.

<details>
<summary>Alternativa: Nginx corriendo directo en el host (no en un contenedor)</summary>

Solo aplica si tu reverse proxy vive fuera de Docker. En ese caso usa el puerto ya
publicado, `127.0.0.1:8089`, en vez del nombre del contenedor.

```nginx
server {
    listen 80;
    server_name nexit.tuempresa.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name nexit.tuempresa.com;

    ssl_certificate     /etc/letsencrypt/live/nexit.tuempresa.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nexit.tuempresa.com/privkey.pem;

    # Evidencias fotográficas y PDFs generados pueden pesar varios MB — el default de
    # Nginx (1M) los rechazaría con 413 antes de que lleguen a la app.
    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Certificado con Certbot (modo webroot, sin bajar Nginx):

```bash
certbot certonly --webroot -w /var/www/certbot -d nexit.tuempresa.com
```

</details>

## e) Mantenimiento

**Logs en vivo** (el nombre del contenedor, `nexit`, es el mismo sin importar el
archivo compose usado para levantarlo, así que `docker logs`/`docker exec` funcionan
igual):

```bash
docker logs -f nexit
```

**Reiniciar el contenedor** (las migraciones se re-verifican automáticamente al
arrancar, no rompe nada si no hay migraciones pendientes):

```bash
docker compose -f docker-compose.prod.yml restart nexit
```

**Actualizar a una nueva versión:** ya no hace falta `git pull` ni compilar en el
servidor — CI construye y publica la imagen en GHCR en cada push a `main`/tag `v*`.
Solo bajas la imagen nueva y reinicias el contenedor:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

**Respaldar el volumen de evidencias/firmas (`nexit_uploads`):**

```bash
docker run --rm \
  -v nexit_uploads:/data \
  -v "$(pwd)/backups":/backup \
  alpine tar czf /backup/nexit-uploads-$(date +%Y%m%d).tar.gz -C /data .
```

Restaurar (con el contenedor `nexit` detenido):

```bash
docker run --rm \
  -v nexit_uploads:/data \
  -v "$(pwd)/backups":/backup \
  alpine sh -c "cd /data && tar xzf /backup/nexit-uploads-YYYYMMDD.tar.gz"
```

**Respaldar la base de datos** (corre en el host donde vive `postgres-core`):

```bash
docker exec postgres-core pg_dump -U postgres nexit_db > backups/nexit_db-$(date +%Y%m%d).sql
```

## Despliegue automático (self-hosted runner de GitHub Actions)

`.github/workflows/deploy-prod.yml` tiene dos jobs: `build-and-push` (compila y publica
en GHCR, corre en un runner de GitHub, sin acceso a tu servidor) y `deploy` (hace
`pull`/`up -d` en tu servidor de producción, corre en un runner **self-hosted** que tú
instalas ahí — así no hace falta abrir SSH desde GitHub hacia tu servidor).

**Instalar el runner** (una sola vez, en el servidor de producción):

1. En el repo de GitHub: **Settings → Actions → Runners → New self-hosted runner** →
   elige `Linux`. Copia los comandos que te muestra ahí — incluyen un token temporal
   que expira rápido, no lo reutilices de otra sesión.
2. Al correr `./config.sh`, cuando te pregunte por las **labels**, agrega `nexit-prod`
   (además de la `self-hosted` que ya trae por defecto). El workflow usa
   `runs-on: [self-hosted, nexit-prod]` específicamente para eso — si en el futuro
   instalas otro runner self-hosted en el mismo servidor para otro proyecto
   (bonifapp/ciguacash/sistema-del-sol), cada uno necesita su propia label distintiva
   para que los jobs no crucen entre proyectos.
3. Instalarlo como servicio (systemd), para que sobreviva a reinicios y no dependa de
   una sesión SSH abierta:
   ```bash
   sudo ./svc.sh install
   sudo ./svc.sh start
   sudo ./svc.sh status
   ```
4. El usuario bajo el que corre el servicio necesita poder ejecutar `docker
   compose` sin `sudo` — agrégalo al grupo `docker` y reinicia el servicio del runner:
   ```bash
   sudo usermod -aG docker <usuario-del-runner>
   sudo ./svc.sh stop && sudo ./svc.sh start
   ```
5. El `working-directory` de `deploy-prod.yml` ya apunta a `/apps/nexit` (la carpeta
   real del clon en este servidor). Si en algún momento mueves el clon a otra ruta,
   actualízalo ahí también.

A partir de ahí, cada push a `main` (o tag `v*`) construye la imagen, la publica en
GHCR, y el propio servidor la descarga y reinicia el contenedor automáticamente — sin
pasos manuales. Sigue siendo válido hacerlo a mano con los comandos de la sección
anterior si prefieres desplegar de forma controlada en vez de automática.

> **Nota de seguridad**: un runner self-hosted ejecuta literalmente lo que diga el
> workflow del repo — aceptable aquí porque es un repo privado que tú controlas, pero
> nunca habilites "Allow running workflows from fork pull requests" en un repo con
> colaboradores externos si usas self-hosted runners.

## Chequeo periódico de SLA (webhook `SLA_EN_RIESGO`)

Next.js no trae un scheduler propio, así que la detección de "ticket a punto de vencer
SLA" necesita un disparador externo. Agrega una entrada de `crontab` en el host que
golpee el endpoint cada 15–30 minutos:

```bash
*/15 * * * * curl -s -X POST https://nexit.tuempresa.com/api/cron/sla-check \
  -H "Authorization: Bearer $WEBHOOK_SECRET" >/dev/null
```

Cada corrida reevalúa todos los tickets abiertos con SLA asignado y dispara un evento
`SLA_EN_RIESGO` por cada uno que siga en riesgo o vencido — si un ticket sigue en ese
estado varias corridas seguidas, se notifica de nuevo en cada una (es un recordatorio,
no una alerta única); si tu flujo de n8n no debe repetir avisos, dedupe ahí por
`ticketId` + fecha.

Para la especificación completa de los payloads (`TICKET_CREADO`,
`TICKET_CAMBIO_ESTADO`, `SLA_EN_RIESGO`), cómo verificar la firma HMAC en n8n, y una
plantilla de workflow lista para importar, ver [`N8N_INTEGRATION.md`](./N8N_INTEGRATION.md).

## Desarrollo local (alternativo a `npm run dev`)

Todo lo anterior es para producción. Para desarrollo local hay dos opciones,
equivalentes en resultado:

- **`npm run dev` directo en el host** (más rápido, recomendado día a día) — usa la
  `DATABASE_URL`/`REDIS_URL` de `.env` tal cual (`127.0.0.1`), apuntando al Postgres/
  Redis compartidos de `C:\dev-infra`.
- **Docker en dev**, con hot-reload real vía bind mount (útil para reproducir el
  entorno de contenedor sin tocar Node local):

  ```bash
  docker compose up -d          # usa docker-compose.yml + Dockerfile (NO el .prod)
  docker compose logs -f nexit
  ```

  Este compose reconstruye `DATABASE_URL`/`REDIS_URL` con `host.docker.internal` en
  vez de `127.0.0.1` (ver comentarios en `docker-compose.yml`), publica en el puerto
  `NEXIT_PORT` de `.env` (`3001` por defecto) y monta el código fuente como bind mount,
  así que los cambios se reflejan sin reconstruir la imagen.

En ambos casos, nunca uses `docker-compose.prod.yml` en local — está pensado
exclusivamente para consumir la imagen ya publicada en GHCR.
