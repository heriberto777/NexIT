-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "whatsappIdentificadorAlterno" TEXT,
ADD COLUMN     "whatsappUsername" TEXT;

-- CreateTable
CREATE TABLE "verificaciones_identidad_chat" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "usuarioId" TEXT,
    "codigo" TEXT,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expiraEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verificaciones_identidad_chat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_whatsappIdentificadorAlterno_key" ON "usuarios"("whatsappIdentificadorAlterno");

-- CreateIndex
CREATE INDEX "verificaciones_identidad_chat_canal_identificador_idx" ON "verificaciones_identidad_chat"("canal", "identificador");

-- AddForeignKey
ALTER TABLE "verificaciones_identidad_chat" ADD CONSTRAINT "verificaciones_identidad_chat_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
