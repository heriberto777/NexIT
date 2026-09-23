# syntax=docker/dockerfile:1

# Dev: el código se monta como bind mount desde docker-compose.yml (hot-reload real
# de Turbopack) — nunca se usa para producción. Ver Dockerfile.prod, que es el que
# construye y publica la imagen inmutable vía .github/workflows/deploy-prod.yml.
FROM node:22-alpine

RUN apk add --no-cache libc6-compat
WORKDIR /app

# DATABASE_URL solo la exige Prisma para generar el cliente en el postinstall de
# `npm install` (nunca se conecta durante el build) — el valor real de runtime llega
# vía env_file/environment en docker-compose.yml.
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DATABASE_URL=${DATABASE_URL}
ARG AUTH_SECRET="build-time-placeholder-not-used-at-runtime"
ENV AUTH_SECRET=${AUTH_SECRET}
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
# --include=dev por si esta imagen se construye alguna vez con NODE_ENV=production
# heredado del entorno del host — sin esto, npm omite silenciosamente devDependencies
# (typescript, tailwind, prisma CLI) y el `npm run dev` de abajo falla al arrancar.
RUN npm install --include=dev

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
