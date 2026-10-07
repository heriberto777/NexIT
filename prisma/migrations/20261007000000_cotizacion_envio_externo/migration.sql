-- CreateEnum
CREATE TYPE "MedioEnvio" AS ENUM ('MENSAJERIA', 'UBER', 'OTRO');

-- AlterTable
ALTER TABLE "cotizaciones" ADD COLUMN "medioEnvio" "MedioEnvio",
ADD COLUMN "detalleEnvio" TEXT,
ADD COLUMN "enviadoEn" TIMESTAMP(3);
