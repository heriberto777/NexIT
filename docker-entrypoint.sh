#!/bin/sh
set -e

echo "==> Aplicando migraciones de Prisma (migrate deploy)..."
npx prisma migrate deploy

echo "==> Iniciando NexIT..."
exec node server.js
