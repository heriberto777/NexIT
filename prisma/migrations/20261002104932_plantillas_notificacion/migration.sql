-- CreateTable
CREATE TABLE "plantillas_notificacion" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantillas_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_notificacion_clave_key" ON "plantillas_notificacion"("clave");
