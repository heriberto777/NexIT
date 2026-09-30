-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "evidenciaNoAplica" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "evidenciaNoAplicaMotivo" TEXT;
