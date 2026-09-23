-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('CLIENTE', 'TECNICO', 'COORDINADOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoContrato" AS ENUM ('ACTIVO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "EstadoActivo" AS ENUM ('ACTIVO', 'EN_MANTENIMIENTO', 'FUERA_DE_SERVICIO', 'DADO_DE_BAJA');

-- CreateEnum
CREATE TYPE "TipoRespuestaChecklist" AS ENUM ('BOOLEANO', 'TEXTO', 'NUMERO', 'SELECCION');

-- CreateEnum
CREATE TYPE "TipoTicket" AS ENUM ('CORRECTIVO', 'PREVENTIVO', 'INSTALACION');

-- CreateEnum
CREATE TYPE "CategoriaSoporte" AS ENUM ('SOFTWARE', 'HARDWARE', 'INFRAESTRUCTURA');

-- CreateEnum
CREATE TYPE "EstadoTicket" AS ENUM ('ABIERTO', 'ASIGNADO', 'EN_DIAGNOSTICO', 'ESPERANDO_REPUESTO', 'EN_EJECUCION', 'ESPERANDO_VALIDACION', 'RESUELTO', 'REABIERTO', 'CERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigenTicket" AS ENUM ('PORTAL', 'CORREO', 'TELEFONO', 'PROGRAMADO');

-- CreateEnum
CREATE TYPE "TipoEvidencia" AS ENUM ('FOTO_ANTES', 'FOTO_DESPUES', 'DOCUMENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoAprobacion" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "identificacionFiscal" TEXT,
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ACTIVO',
    "fechaRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "latitud" DECIMAL(9,6),
    "longitud" DECIMAL(9,6),
    "contactoNombre" TEXT,
    "contactoTelefono" TEXT,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "clienteId" TEXT,
    "especialidad" TEXT,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipoContrato" TEXT NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "horasIncluidas" INTEGER,
    "estado" "EstadoContrato" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_sla" (
    "id" TEXT NOT NULL,
    "contratoId" TEXT NOT NULL,
    "prioridad" "Prioridad" NOT NULL,
    "tiempoRespuestaMin" INTEGER NOT NULL,
    "tiempoResolucionMin" INTEGER NOT NULL,

    CONSTRAINT "contrato_sla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_activo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "categorias_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activos" (
    "id" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "numeroSerie" TEXT NOT NULL,
    "fechaInstalacion" TIMESTAMP(3),
    "fechaFinGarantia" TIMESTAMP(3),
    "ubicacionEspecifica" TEXT,
    "estado" "EstadoActivo" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "activos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "categoriaActivoId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "tipoRespuesta" "TipoRespuestaChecklist" NOT NULL,
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "orden" INTEGER NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantenimientos_programados" (
    "id" TEXT NOT NULL,
    "activoId" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    "frecuenciaMeses" INTEGER NOT NULL,
    "proximaFecha" TIMESTAMP(3) NOT NULL,
    "tecnicoSugeridoId" TEXT,
    "activoBool" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mantenimientos_programados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "numeroTicket" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "sucursalId" TEXT NOT NULL,
    "activoId" TEXT,
    "mantenimientoProgramadoId" TEXT,
    "tipo" "TipoTicket" NOT NULL,
    "categoriaSoporte" "CategoriaSoporte" NOT NULL,
    "prioridad" "Prioridad" NOT NULL,
    "estado" "EstadoTicket" NOT NULL DEFAULT 'ABIERTO',
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "creadoPorId" TEXT NOT NULL,
    "tecnicoAsignadoId" TEXT,
    "slaId" TEXT,
    "origen" "OrigenTicket" NOT NULL DEFAULT 'PORTAL',
    "fechaCreacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaAsignacion" TIMESTAMP(3),
    "fechaInicioAtencion" TIMESTAMP(3),
    "fechaResolucion" TIMESTAMP(3),
    "fechaCierre" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_historial" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT NOT NULL,
    "comentario" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_checklist_respuestas" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "checklistItemId" TEXT NOT NULL,
    "respuesta" TEXT NOT NULL,
    "observacion" TEXT,

    CONSTRAINT "ticket_checklist_respuestas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidencias" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tipo" "TipoEvidencia" NOT NULL,
    "urlArchivo" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "fechaCarga" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmas_digitales" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "nombreFirmante" TEXT NOT NULL,
    "cargoFirmante" TEXT,
    "urlFirmaImagen" TEXT NOT NULL,
    "ipDispositivo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmas_digitales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventario_repuestos" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "stockActual" INTEGER NOT NULL DEFAULT 0,
    "unidadMedida" TEXT NOT NULL,
    "costoUnitario" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "inventario_repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_repuestos" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "repuestoId" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "costoTotal" DECIMAL(10,2) NOT NULL,
    "aprobadoPorId" TEXT,
    "estadoAprobacion" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "ticket_repuestos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotizaciones" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "descripcion" TEXT NOT NULL,
    "estado" "EstadoAprobacion" NOT NULL DEFAULT 'PENDIENTE',
    "aprobadoPorId" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_identificacionFiscal_key" ON "clientes"("identificacionFiscal");

-- CreateIndex
CREATE INDEX "sucursales_clienteId_idx" ON "sucursales"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_clienteId_idx" ON "usuarios"("clienteId");

-- CreateIndex
CREATE INDEX "contratos_clienteId_idx" ON "contratos"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_sla_contratoId_prioridad_key" ON "contrato_sla"("contratoId", "prioridad");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_activo_nombre_key" ON "categorias_activo"("nombre");

-- CreateIndex
CREATE INDEX "activos_categoriaId_idx" ON "activos"("categoriaId");

-- CreateIndex
CREATE UNIQUE INDEX "activos_sucursalId_numeroSerie_key" ON "activos"("sucursalId", "numeroSerie");

-- CreateIndex
CREATE INDEX "checklist_templates_categoriaActivoId_idx" ON "checklist_templates"("categoriaActivoId");

-- CreateIndex
CREATE INDEX "checklist_items_templateId_idx" ON "checklist_items"("templateId");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_activoId_idx" ON "mantenimientos_programados"("activoId");

-- CreateIndex
CREATE INDEX "mantenimientos_programados_proximaFecha_idx" ON "mantenimientos_programados"("proximaFecha");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_numeroTicket_key" ON "tickets"("numeroTicket");

-- CreateIndex
CREATE INDEX "tickets_clienteId_estado_idx" ON "tickets"("clienteId", "estado");

-- CreateIndex
CREATE INDEX "tickets_tecnicoAsignadoId_estado_idx" ON "tickets"("tecnicoAsignadoId", "estado");

-- CreateIndex
CREATE INDEX "tickets_fechaCreacion_idx" ON "tickets"("fechaCreacion");

-- CreateIndex
CREATE INDEX "ticket_historial_ticketId_idx" ON "ticket_historial"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_checklist_respuestas_ticketId_checklistItemId_key" ON "ticket_checklist_respuestas"("ticketId", "checklistItemId");

-- CreateIndex
CREATE INDEX "evidencias_ticketId_idx" ON "evidencias"("ticketId");

-- CreateIndex
CREATE INDEX "firmas_digitales_ticketId_idx" ON "firmas_digitales"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "inventario_repuestos_sku_key" ON "inventario_repuestos"("sku");

-- CreateIndex
CREATE INDEX "ticket_repuestos_ticketId_idx" ON "ticket_repuestos"("ticketId");

-- CreateIndex
CREATE INDEX "cotizaciones_ticketId_idx" ON "cotizaciones"("ticketId");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_sla" ADD CONSTRAINT "contrato_sla_contratoId_fkey" FOREIGN KEY ("contratoId") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activos" ADD CONSTRAINT "activos_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activos" ADD CONSTRAINT "activos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_templates" ADD CONSTRAINT "checklist_templates_categoriaActivoId_fkey" FOREIGN KEY ("categoriaActivoId") REFERENCES "categorias_activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "activos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "checklist_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimientos_programados" ADD CONSTRAINT "mantenimientos_programados_tecnicoSugeridoId_fkey" FOREIGN KEY ("tecnicoSugeridoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_sucursalId_fkey" FOREIGN KEY ("sucursalId") REFERENCES "sucursales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_activoId_fkey" FOREIGN KEY ("activoId") REFERENCES "activos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mantenimientoProgramadoId_fkey" FOREIGN KEY ("mantenimientoProgramadoId") REFERENCES "mantenimientos_programados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tecnicoAsignadoId_fkey" FOREIGN KEY ("tecnicoAsignadoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "contrato_sla"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_historial" ADD CONSTRAINT "ticket_historial_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_historial" ADD CONSTRAINT "ticket_historial_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_checklist_respuestas" ADD CONSTRAINT "ticket_checklist_respuestas_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_checklist_respuestas" ADD CONSTRAINT "ticket_checklist_respuestas_checklistItemId_fkey" FOREIGN KEY ("checklistItemId") REFERENCES "checklist_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencias" ADD CONSTRAINT "evidencias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "firmas_digitales" ADD CONSTRAINT "firmas_digitales_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_repuestos" ADD CONSTRAINT "ticket_repuestos_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_repuestos" ADD CONSTRAINT "ticket_repuestos_repuestoId_fkey" FOREIGN KEY ("repuestoId") REFERENCES "inventario_repuestos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_repuestos" ADD CONSTRAINT "ticket_repuestos_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
