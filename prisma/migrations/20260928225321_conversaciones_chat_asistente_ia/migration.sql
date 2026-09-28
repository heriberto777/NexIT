-- CreateEnum
CREATE TYPE "EstadoConversacionChat" AS ENUM ('ACTIVA', 'RESUELTA_SIN_TICKET', 'CONVERTIDA_A_TICKET');

-- CreateEnum
CREATE TYPE "RolMensajeChat" AS ENUM ('USUARIO', 'ASISTENTE');

-- CreateTable
CREATE TABLE "conversaciones_chat" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "estado" "EstadoConversacionChat" NOT NULL DEFAULT 'ACTIVA',
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_conversacion" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "rol" "RolMensajeChat" NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_chat_ticketId_key" ON "conversaciones_chat"("ticketId");

-- CreateIndex
CREATE INDEX "conversaciones_chat_usuarioId_estado_idx" ON "conversaciones_chat"("usuarioId", "estado");

-- CreateIndex
CREATE INDEX "mensajes_conversacion_conversacionId_idx" ON "mensajes_conversacion"("conversacionId");

-- AddForeignKey
ALTER TABLE "conversaciones_chat" ADD CONSTRAINT "conversaciones_chat_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_chat" ADD CONSTRAINT "conversaciones_chat_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_conversacion" ADD CONSTRAINT "mensajes_conversacion_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones_chat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
