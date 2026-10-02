-- AlterTable: configuración del proveedor de IA (branding/SMTP/webhooks ya viven acá)
ALTER TABLE "configuracion_sistema"
  ADD COLUMN "iaProveedor" TEXT,
  ADD COLUMN "iaApiKey" TEXT,
  ADD COLUMN "iaModelo" TEXT,
  ADD COLUMN "iaBaseUrl" TEXT,
  ADD COLUMN "iaHabilitada" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "conversaciones_ticket_ia" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversaciones_ticket_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_ticket_ia_ticketId_key" ON "conversaciones_ticket_ia"("ticketId");

-- AddForeignKey
ALTER TABLE "conversaciones_ticket_ia"
  ADD CONSTRAINT "conversaciones_ticket_ia_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "mensajes_ticket_ia" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "rol" "RolMensajeChat" NOT NULL,
    "contenido" TEXT NOT NULL,
    "esSolucion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_ticket_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mensajes_ticket_ia_conversacionId_idx" ON "mensajes_ticket_ia"("conversacionId");

-- AddForeignKey
ALTER TABLE "mensajes_ticket_ia"
  ADD CONSTRAINT "mensajes_ticket_ia_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "conversaciones_ticket_ia"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
