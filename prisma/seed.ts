import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Contraseña de desarrollo compartida por todos los usuarios sembrados. Solo para
// local/demo — nunca se usa en producción (ahí cada usuario se crea con su propia
// contraseña real).
const PASSWORD_DEV = "Password123!";

async function findOrCreateSucursal(data: {
  clienteId: string;
  nombre: string;
  direccion: string;
  ciudad: string;
  contactoNombre?: string;
  contactoTelefono?: string;
}) {
  const existente = await prisma.sucursal.findFirst({ where: { clienteId: data.clienteId, nombre: data.nombre } });
  if (existente) return existente;
  return prisma.sucursal.create({ data });
}

async function findOrCreatePlanPreventivo(data: {
  titulo: string;
  activoId?: string;
  sucursalId?: string;
  descripcion?: string;
  frecuencia: "SEMANAL" | "MENSUAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";
  proximaFecha: Date;
  fechaUltimoMantenimiento?: Date;
  tecnicoAsignadoId?: string;
  prioridad?: "CRITICA" | "ALTA" | "MEDIA" | "BAJA";
}) {
  const existente = await prisma.planMantenimientoPreventivo.findFirst({ where: { titulo: data.titulo } });
  if (existente) return existente;
  return prisma.planMantenimientoPreventivo.create({ data });
}

async function findOrCreateChecklistTemplate(data: {
  categoriaActivoId: string;
  nombre: string;
  items: {
    descripcion: string;
    tipoRespuesta: "BOOLEANO" | "TEXTO" | "NUMERO" | "SELECCION";
    opciones?: string[];
    orden: number;
    observacionObligatoria?: boolean;
  }[];
}) {
  const existente = await prisma.checklistTemplate.findFirst({
    where: { categoriaActivoId: data.categoriaActivoId, nombre: data.nombre },
  });
  if (existente) return existente;
  return prisma.checklistTemplate.create({
    data: {
      categoriaActivoId: data.categoriaActivoId,
      nombre: data.nombre,
      version: 1,
      items: { create: data.items },
    },
  });
}

async function findOrCreateRepuesto(data: {
  codigo: string;
  nombre: string;
  descripcion?: string;
  marca?: string;
  stockInicial: number;
  stockMinimo: number;
  unidadMedida: string;
  costoUnidad: number;
  ubicacion?: string;
  usuarioId: string;
}) {
  const existente = await prisma.repuesto.findUnique({ where: { codigo: data.codigo } });
  if (existente) return existente;

  return prisma.$transaction(async (tx) => {
    const repuesto = await tx.repuesto.create({
      data: {
        codigo: data.codigo,
        nombre: data.nombre,
        descripcion: data.descripcion,
        marca: data.marca,
        stockActual: data.stockInicial,
        stockMinimo: data.stockMinimo,
        unidadMedida: data.unidadMedida,
        costoUnidad: data.costoUnidad,
        ubicacion: data.ubicacion,
      },
    });
    if (data.stockInicial > 0) {
      await tx.movimientoInventario.create({
        data: {
          repuestoId: repuesto.id,
          tipo: "ENTRADA",
          cantidad: data.stockInicial,
          motivo: "Carga inicial de inventario",
          usuarioId: data.usuarioId,
        },
      });
    }
    return repuesto;
  });
}

async function findOrCreateContrato(data: { clienteId: string; tipoContrato: string; horasIncluidas: number }) {
  const existente = await prisma.contrato.findFirst({
    where: { clienteId: data.clienteId, tipoContrato: data.tipoContrato },
    include: { slas: true },
  });
  if (existente) return existente;
  return prisma.contrato.create({
    data: {
      clienteId: data.clienteId,
      tipoContrato: data.tipoContrato,
      fechaInicio: new Date("2026-01-01"),
      horasIncluidas: data.horasIncluidas,
      slas: {
        create: [
          { prioridad: "CRITICA", tiempoRespuestaMin: 60, tiempoResolucionMin: 240 },
          { prioridad: "ALTA", tiempoRespuestaMin: 120, tiempoResolucionMin: 480 },
          { prioridad: "MEDIA", tiempoRespuestaMin: 240, tiempoResolucionMin: 1440 },
          { prioridad: "BAJA", tiempoRespuestaMin: 480, tiempoResolucionMin: 2880 },
        ],
      },
    },
    include: { slas: true },
  });
}

const horasAtras = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

async function main() {
  // ---------- Configuración global del sistema ----------
  await prisma.configuracionSistema.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      empresaNombre: "NexIT Soporte Técnico",
      empresaRnc: "RUC-20999999999",
      empresaTelefono: "+51900000000",
      empresaEmail: "contacto@nexit.dev",
      empresaDireccion: "Av. Principal 100, Lima",
    },
  });

  // ---------- Clientes ----------
  const clienteA = await prisma.cliente.upsert({
    where: { identificacionFiscal: "RUC-20100000001" },
    update: {},
    create: { nombre: "Constructora ABC S.A.", identificacionFiscal: "RUC-20100000001" },
  });

  const clienteB = await prisma.cliente.upsert({
    where: { identificacionFiscal: "RUC-20100000002" },
    update: {},
    create: { nombre: "Hospital San Rafael", identificacionFiscal: "RUC-20100000002" },
  });

  const sucursalA = await findOrCreateSucursal({
    clienteId: clienteA.id,
    nombre: "Bodega Norte",
    direccion: "Av. Industrial 450",
    ciudad: "Lima",
    contactoNombre: "Juan Pérez",
    contactoTelefono: "+51999888777",
  });

  const sucursalB = await findOrCreateSucursal({
    clienteId: clienteB.id,
    nombre: "Sede Central",
    direccion: "Jr. Salud 120",
    ciudad: "Lima",
    contactoNombre: "Ana Torres",
    contactoTelefono: "+51988777666",
  });

  // ---------- Usuarios ----------
  // Misma contraseña de desarrollo para todos los usuarios sembrados (ver el resumen
  // final del seed, que la imprime): esto es solo para el entorno local/demo.
  const passwordHashDev = await bcrypt.hash(PASSWORD_DEV, 10);

  const clienteUsuarioA = await prisma.usuario.upsert({
    where: { email: "cliente@constructora-abc.com" },
    update: { passwordHash: passwordHashDev },
    create: {
      nombre: "Juan Pérez",
      email: "cliente@constructora-abc.com",
      passwordHash: passwordHashDev,
      rol: "CLIENTE",
      clienteId: clienteA.id,
    },
  });

  await prisma.usuario.upsert({
    where: { email: "cliente@hospitalsanrafael.com" },
    update: { passwordHash: passwordHashDev },
    create: {
      nombre: "Ana Torres",
      email: "cliente@hospitalsanrafael.com",
      passwordHash: passwordHashDev,
      rol: "CLIENTE",
      clienteId: clienteB.id,
    },
  });

  const tecnico = await prisma.usuario.upsert({
    where: { email: "tecnico@nexit.dev" },
    update: { passwordHash: passwordHashDev },
    create: {
      nombre: "María Gómez",
      email: "tecnico@nexit.dev",
      passwordHash: passwordHashDev,
      rol: "TECNICO",
      especialidad: "Electricidad / UPS",
    },
  });

  const coordinador = await prisma.usuario.upsert({
    where: { email: "coordinador@nexit.dev" },
    update: { passwordHash: passwordHashDev },
    create: {
      nombre: "Carlos Ruiz",
      email: "coordinador@nexit.dev",
      passwordHash: passwordHashDev,
      rol: "COORDINADOR",
    },
  });

  await prisma.usuario.upsert({
    where: { email: "admin@nexit.dev" },
    update: { passwordHash: passwordHashDev },
    create: {
      nombre: "Lucía Fernández",
      email: "admin@nexit.dev",
      passwordHash: passwordHashDev,
      rol: "ADMIN",
    },
  });

  // ---------- Categorías y activos ----------
  const categoriaUps = await prisma.categoriaActivo.upsert({
    where: { nombre: "UPS" },
    update: {},
    create: { nombre: "UPS" },
  });

  const categoriaSwitch = await prisma.categoriaActivo.upsert({
    where: { nombre: "Switch" },
    update: {},
    create: { nombre: "Switch" },
  });

  const activoUps = await prisma.activo.upsert({
    where: { sucursalId_numeroSerie: { sucursalId: sucursalA.id, numeroSerie: "APC-3000-0001" } },
    update: {},
    create: {
      sucursalId: sucursalA.id,
      categoriaId: categoriaUps.id,
      marca: "APC",
      modelo: "Smart-UPS 3000VA",
      numeroSerie: "APC-3000-0001",
      fechaInstalacion: new Date("2023-05-10"),
      fechaFinGarantia: new Date("2026-05-10"),
      ubicacionEspecifica: "Sala de servidores, rack 2",
    },
  });

  const activoSwitch = await prisma.activo.upsert({
    where: { sucursalId_numeroSerie: { sucursalId: sucursalB.id, numeroSerie: "CISCO-2960-0007" } },
    update: {},
    create: {
      sucursalId: sucursalB.id,
      categoriaId: categoriaSwitch.id,
      marca: "Cisco",
      modelo: "Catalyst 2960",
      numeroSerie: "CISCO-2960-0007",
      fechaInstalacion: new Date("2024-02-01"),
      ubicacionEspecifica: "Cuarto de comunicaciones, piso 3",
    },
  });

  await findOrCreateChecklistTemplate({
    categoriaActivoId: categoriaUps.id,
    nombre: "Mantenimiento preventivo UPS",
    items: [
      { descripcion: "¿Batería en buen estado?", tipoRespuesta: "BOOLEANO", orden: 1, observacionObligatoria: true },
      { descripcion: "Voltaje de salida (V)", tipoRespuesta: "NUMERO", orden: 2 },
      { descripcion: "Estado de ventilación", tipoRespuesta: "SELECCION", opciones: ["Optimo", "Regular", "Critico"], orden: 3 },
      { descripcion: "Observaciones generales", tipoRespuesta: "TEXTO", orden: 4 },
    ],
  });

  await findOrCreateChecklistTemplate({
    categoriaActivoId: categoriaSwitch.id,
    nombre: "Mantenimiento preventivo Switch",
    items: [
      { descripcion: "¿Firmware actualizado?", tipoRespuesta: "BOOLEANO", orden: 1 },
      { descripcion: "¿Puertos con errores/CRC?", tipoRespuesta: "BOOLEANO", orden: 2, observacionObligatoria: true },
      { descripcion: "Temperatura del chasis (°C)", tipoRespuesta: "NUMERO", orden: 3 },
      { descripcion: "Estado del cableado y etiquetado", tipoRespuesta: "SELECCION", opciones: ["Optimo", "Regular", "Critico"], orden: 4 },
    ],
  });

  // ---------- Contratos y SLA ----------
  const contratoA = await findOrCreateContrato({
    clienteId: clienteA.id,
    tipoContrato: "Soporte integral - Plan Plata",
    horasIncluidas: 40,
  });
  const contratoB = await findOrCreateContrato({
    clienteId: clienteB.id,
    tipoContrato: "Soporte integral - Plan Oro",
    horasIncluidas: 80,
  });

  const slaA = (prioridad: string) => contratoA.slas.find((s) => s.prioridad === prioridad)!;
  const slaB = (prioridad: string) => contratoB.slas.find((s) => s.prioridad === prioridad)!;

  // ---------- Inventario ----------
  const bateria = await findOrCreateRepuesto({
    codigo: "BAT-12V-9AH",
    nombre: "Batería 12V 9Ah",
    descripcion: "Batería de plomo-ácido sellada para UPS",
    marca: "Genérica",
    stockInicial: 5,
    stockMinimo: 5, // el ajuste de abajo lo deja por debajo del mínimo: demuestra la alerta de stock crítico
    unidadMedida: "unidad",
    costoUnidad: 45.0,
    ubicacion: "Almacén Central - Estante A1",
    usuarioId: coordinador.id,
  });

  // Segundo movimiento sobre el mismo repuesto (solo si acaba de crearse) para que el
  // Kardex de demo tenga más de una entrada y el stock quede por debajo del mínimo.
  const yaTieneAjuste = await prisma.movimientoInventario.findFirst({
    where: { repuestoId: bateria.id, tipo: "AJUSTE" },
  });
  if (!yaTieneAjuste) {
    await prisma.$transaction([
      prisma.repuesto.update({ where: { id: bateria.id }, data: { stockActual: { decrement: 2 } } }),
      prisma.movimientoInventario.create({
        data: {
          repuestoId: bateria.id,
          tipo: "AJUSTE",
          cantidad: -2,
          motivo: "2 unidades dañadas encontradas en inventario físico",
          usuarioId: coordinador.id,
        },
      }),
    ]);
  }

  await findOrCreateRepuesto({
    codigo: "PC-CAT6-1M",
    nombre: "Patch Cord Cat6 1m",
    marca: "Genérica",
    stockInicial: 40,
    stockMinimo: 10,
    unidadMedida: "unidad",
    costoUnidad: 3.5,
    ubicacion: "Almacén Central - Estante B2",
    usuarioId: coordinador.id,
  });

  await findOrCreateRepuesto({
    codigo: "PT-5G",
    nombre: "Pasta térmica (jeringa 5g)",
    marca: "Arctic",
    stockInicial: 8,
    stockMinimo: 3,
    unidadMedida: "unidad",
    costoUnidad: 6.0,
    ubicacion: "Almacén Central - Estante C1",
    usuarioId: coordinador.id,
  });

  // ---------- Tickets ----------
  const t1 = await prisma.ticket.upsert({
    where: { numeroTicket: "TCK-0001" },
    update: {},
    create: {
      numeroTicket: "TCK-0001",
      clienteId: clienteA.id,
      sucursalId: sucursalA.id,
      activoId: activoUps.id,
      tipo: "PREVENTIVO",
      categoriaSoporte: "HARDWARE",
      prioridad: "ALTA",
      estado: "ASIGNADO",
      titulo: "Mantenimiento preventivo trimestral - UPS Sala de Servidores",
      descripcion: "Revisión programada de batería, voltaje y ventilación del UPS APC 3000VA.",
      creadoPorId: coordinador.id,
      tecnicoAsignadoId: tecnico.id,
      slaId: slaA("ALTA").id,
      origen: "PROGRAMADO",
      fechaAsignacion: new Date(),
    },
  });

  const t2 = await prisma.ticket.upsert({
    where: { numeroTicket: "TCK-0002" },
    update: {},
    create: {
      numeroTicket: "TCK-0002",
      clienteId: clienteB.id,
      sucursalId: sucursalB.id,
      activoId: activoSwitch.id,
      tipo: "CORRECTIVO",
      categoriaSoporte: "HARDWARE",
      prioridad: "CRITICA",
      estado: "EN_EJECUCION",
      titulo: "Switch de piso 3 no responde",
      descripcion: "Perdida intermitente de conectividad en todo el piso 3, switch con luces de error.",
      creadoPorId: coordinador.id,
      tecnicoAsignadoId: tecnico.id,
      slaId: slaB("CRITICA").id,
      origen: "TELEFONO",
      fechaCreacion: horasAtras(10),
      fechaAsignacion: horasAtras(9.5),
      fechaInicioAtencion: horasAtras(9),
    },
  });

  const t3 = await prisma.ticket.upsert({
    where: { numeroTicket: "TCK-0003" },
    update: {},
    create: {
      numeroTicket: "TCK-0003",
      clienteId: clienteA.id,
      sucursalId: sucursalA.id,
      tipo: "INSTALACION",
      categoriaSoporte: "INFRAESTRUCTURA",
      prioridad: "MEDIA",
      estado: "ABIERTO",
      titulo: "Instalación de punto de red adicional",
      descripcion: "Se requiere un punto de red nuevo en la oficina de compras.",
      creadoPorId: clienteUsuarioA.id,
      slaId: slaA("MEDIA").id,
      origen: "PORTAL",
      fechaCreacion: horasAtras(20),
    },
  });

  const t4 = await prisma.ticket.upsert({
    where: { numeroTicket: "TCK-0004" },
    update: {},
    create: {
      numeroTicket: "TCK-0004",
      clienteId: clienteA.id,
      sucursalId: sucursalA.id,
      activoId: activoUps.id,
      tipo: "PREVENTIVO",
      categoriaSoporte: "HARDWARE",
      prioridad: "BAJA",
      estado: "RESUELTO",
      titulo: "Mantenimiento preventivo anterior - UPS Sala de Servidores",
      descripcion: "Revisión trimestral previa, ya validada por el cliente y pendiente de cierre administrativo.",
      creadoPorId: coordinador.id,
      tecnicoAsignadoId: tecnico.id,
      slaId: slaA("BAJA").id,
      origen: "PROGRAMADO",
      fechaCreacion: horasAtras(96),
      fechaAsignacion: horasAtras(95),
      fechaInicioAtencion: horasAtras(90),
      fechaResolucion: horasAtras(2),
    },
  });

  const t5 = await prisma.ticket.upsert({
    where: { numeroTicket: "TCK-0005" },
    update: {},
    create: {
      numeroTicket: "TCK-0005",
      clienteId: clienteB.id,
      sucursalId: sucursalB.id,
      tipo: "CORRECTIVO",
      categoriaSoporte: "SOFTWARE",
      prioridad: "ALTA",
      estado: "CERRADO",
      titulo: "Sistema de citas no carga",
      descripcion: "Error 500 al agendar citas desde ayer en la tarde. Resuelto: caché del servidor.",
      creadoPorId: coordinador.id,
      tecnicoAsignadoId: tecnico.id,
      slaId: slaB("ALTA").id,
      origen: "CORREO",
      fechaCreacion: horasAtras(48),
      fechaAsignacion: horasAtras(47),
      fechaInicioAtencion: horasAtras(46),
      fechaResolucion: horasAtras(40),
    },
  });

  // ---------- Planes de mantenimiento preventivo ----------
  const diasAtras = (d: number) => horasAtras(d * 24);
  const diasAdelante = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

  const planVencido = await findOrCreatePlanPreventivo({
    titulo: "Mantenimiento trimestral - UPS Sala de Servidores",
    activoId: activoUps.id,
    frecuencia: "TRIMESTRAL",
    proximaFecha: diasAtras(2), // vencido: dispara generarTicketsPreventivos
    fechaUltimoMantenimiento: diasAtras(92),
    tecnicoAsignadoId: tecnico.id,
    prioridad: "ALTA",
  });

  const planProximo = await findOrCreatePlanPreventivo({
    titulo: "Mantenimiento mensual - Switch piso 3",
    activoId: activoSwitch.id,
    frecuencia: "MENSUAL",
    proximaFecha: diasAdelante(3), // próximo a vencer
    fechaUltimoMantenimiento: diasAtras(27),
    tecnicoAsignadoId: tecnico.id,
    prioridad: "MEDIA",
  });

  const planProgramado = await findOrCreatePlanPreventivo({
    titulo: "Inspección general - Bodega Norte",
    sucursalId: sucursalA.id,
    descripcion: "Revisión general de instalaciones eléctricas y de red de la sede.",
    frecuencia: "SEMESTRAL",
    proximaFecha: diasAdelante(20), // programado, sin urgencia
    tecnicoAsignadoId: coordinador.id,
    prioridad: "BAJA",
  });

  console.log("Seed completado:");
  console.log({
    clientes: [clienteA.nombre, clienteB.nombre],
    usuarios: { cliente: clienteUsuarioA.email, tecnico: tecnico.email, coordinador: coordinador.email, admin: "admin@nexit.dev" },
    tickets: [t1.numeroTicket, t2.numeroTicket, t3.numeroTicket, t4.numeroTicket, t5.numeroTicket],
    planesPreventivos: [planVencido.titulo, planProximo.titulo, planProgramado.titulo],
    urlEjecucion: `/tickets/${t1.id}/ejecucion`,
    urlDetalleParaCerrar: `/tickets/${t4.id}`,
    urlListado: "/tickets",
    urlPreventivos: "/admin/preventivos",
    passwordDeTodos: PASSWORD_DEV,
    urlLogin: "/login",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
