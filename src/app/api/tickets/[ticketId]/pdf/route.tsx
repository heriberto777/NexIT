import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { InformeServicioDocument } from "@/server/services/pdf/informe-servicio";
import { storageService } from "@/server/services/storage.service";
import { obtenerConfiguracion } from "@/server/services/configuracion.service";

export const runtime = "nodejs";

// El PDF embebe las imágenes como data URI (no un <img src="URL">) para que el archivo
// sea autocontenido — se lee directo de los bytes del storage (Local o S3, según
// STORAGE_PROVIDER), nunca vía una URL pública/firmada intermedia.
async function keyToDataUri(key: string): Promise<string | null> {
  try {
    const buffer = await storageService.getBuffer(key);
    const ext = path.extname(key).slice(1).toLowerCase();
    const mime = ext === "jpg" ? "jpeg" : ext || "png";
    return `data:image/${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

type RouteParams = { params: Promise<{ ticketId: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { ticketId } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      cliente: true,
      sucursal: true,
      activo: { include: { categoria: true } },
      tecnicoAsignado: true,
      checklistRespuestas: { include: { checklistItem: true } },
      evidencias: { orderBy: { fechaCarga: "asc" } },
      firmas: { orderBy: { fecha: "asc" }, take: 1 },
      repuestos: { include: { repuesto: true } },
      historial: { include: { usuario: true }, orderBy: { fecha: "asc" } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  const [fotosAntesRaw, fotosDespuesRaw, firmaUri, config, checklistFotos] = await Promise.all([
    Promise.all(ticket.evidencias.filter((e) => e.tipo === "FOTO_ANTES").map((e) => keyToDataUri(e.urlArchivo))),
    Promise.all(ticket.evidencias.filter((e) => e.tipo === "FOTO_DESPUES").map((e) => keyToDataUri(e.urlArchivo))),
    ticket.firmas[0] ? keyToDataUri(ticket.firmas[0].urlFirmaImagen) : Promise.resolve(null),
    obtenerConfiguracion(),
    Promise.all(
      ticket.checklistRespuestas.map(async (r) => [r.id, r.fotoArchivo ? await keyToDataUri(r.fotoArchivo) : null] as const),
    ),
  ]);
  const logoBase64 = config.empresaLogoUrl ? await keyToDataUri(config.empresaLogoUrl) : null;
  const fotoPorRespuestaId = new Map(checklistFotos);

  const checklistOrdenado = [...ticket.checklistRespuestas].sort(
    (a, b) => a.checklistItem.orden - b.checklistItem.orden,
  );

  const buffer = await renderToBuffer(
    <InformeServicioDocument
      monedaSimbolo={config.monedaSimbolo}
      localeFecha={config.localeFecha}
      empresa={{
        nombre: config.empresaNombre,
        rnc: config.empresaRnc,
        direccion: config.empresaDireccion,
        telefono: config.empresaTelefono,
        email: config.empresaEmail,
        logoBase64,
      }}
      ticket={{
        numeroTicket: ticket.numeroTicket,
        titulo: ticket.titulo,
        descripcion: ticket.descripcion,
        tipo: ticket.tipo,
        categoriaSoporte: ticket.categoriaSoporte,
        prioridad: ticket.prioridad,
        estado: ticket.estado,
        fechaCreacion: ticket.fechaCreacion,
        fechaResolucion: ticket.fechaResolucion,
      }}
      cliente={{ nombre: ticket.cliente.nombre }}
      sucursal={{ nombre: ticket.sucursal.nombre, direccion: ticket.sucursal.direccion, ciudad: ticket.sucursal.ciudad }}
      activo={
        ticket.activo
          ? {
              categoria: ticket.activo.categoria.nombre,
              marca: ticket.activo.marca,
              modelo: ticket.activo.modelo,
              numeroSerie: ticket.activo.numeroSerie,
            }
          : null
      }
      tecnico={ticket.tecnicoAsignado ? { nombre: ticket.tecnicoAsignado.nombre } : null}
      checklist={checklistOrdenado.map((r) => ({
        descripcion: r.checklistItem.descripcion,
        respuesta: r.respuesta,
        observacion: r.observacion,
        fotoDataUri: fotoPorRespuestaId.get(r.id) ?? null,
      }))}
      fotosAntes={fotosAntesRaw.filter((x): x is string => x !== null)}
      fotosDespues={fotosDespuesRaw.filter((x): x is string => x !== null)}
      repuestos={ticket.repuestos.map((r) => ({
        nombre: r.repuesto.nombre,
        cantidad: r.cantidad,
        costoTotal: r.costoTotal.toNumber(),
      }))}
      firma={
        ticket.firmas[0] && firmaUri
          ? {
              nombreFirmante: ticket.firmas[0].nombreFirmante,
              cargoFirmante: ticket.firmas[0].cargoFirmante,
              fecha: ticket.firmas[0].fecha,
              imagenBase64: firmaUri,
            }
          : null
      }
      historial={ticket.historial.map((h) => ({
        fecha: h.fecha,
        usuario: h.usuario.nombre,
        estadoNuevo: h.estadoNuevo,
        comentario: h.comentario,
      }))}
    />,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="informe-${ticket.numeroTicket}.pdf"`,
    },
  });
}
