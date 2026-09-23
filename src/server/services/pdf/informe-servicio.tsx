import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";

const FORMATO_FECHA = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" });

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#1f2937" },
  headerBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  headerLogo: { width: 48, height: 48, objectFit: "contain" },
  empresaNombre: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  empresaDato: { fontSize: 8.5, color: "#6b7280" },
  headerTitle: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  headerSubtitle: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  badge: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1f2937" },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 6, borderBottom: "1 solid #e5e7eb", paddingBottom: 3 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 110, color: "#6b7280" },
  value: { flex: 1 },
  gridRow: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  gridCell: { width: "48%", marginBottom: 4 },
  checklistRow: { flexDirection: "row", borderBottom: "0.5 solid #f3f4f6", paddingVertical: 4 },
  checklistDesc: { flex: 2 },
  checklistResp: { flex: 1, fontFamily: "Helvetica-Bold" },
  photosGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  photo: { width: 110, height: 110, objectFit: "cover", borderRadius: 3 },
  photoGroupLabel: { fontSize: 9, color: "#6b7280", marginBottom: 4, marginTop: 8 },
  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: "row", borderBottom: "1 solid #d1d5db", paddingBottom: 3, marginBottom: 3 },
  tableRow: { flexDirection: "row", borderBottom: "0.5 solid #f3f4f6", paddingVertical: 3 },
  th: { flex: 1, fontFamily: "Helvetica-Bold", color: "#6b7280" },
  td: { flex: 1 },
  signatureBox: { marginTop: 6 },
  signatureImage: { width: 180, height: 70, objectFit: "contain", border: "1 solid #e5e7eb" },
  historyItem: { marginBottom: 5 },
  historyMeta: { fontSize: 8.5, color: "#9ca3af" },
  footer: { position: "absolute", bottom: 20, left: 32, right: 32, fontSize: 8, color: "#9ca3af", textAlign: "center" },
});

export interface InformeServicioProps {
  empresa: {
    nombre: string;
    rnc: string | null;
    direccion: string | null;
    telefono: string | null;
    email: string | null;
    logoBase64: string | null;
  };
  ticket: {
    numeroTicket: string;
    titulo: string;
    descripcion: string;
    tipo: string;
    categoriaSoporte: string;
    prioridad: string;
    estado: string;
    fechaCreacion: Date;
    fechaResolucion: Date | null;
  };
  cliente: { nombre: string };
  sucursal: { nombre: string; direccion: string; ciudad: string };
  activo: { categoria: string; marca: string; modelo: string; numeroSerie: string } | null;
  tecnico: { nombre: string } | null;
  checklist: { descripcion: string; respuesta: string; observacion: string | null }[];
  fotosAntes: string[];
  fotosDespues: string[];
  repuestos: { nombre: string; cantidad: number; costoTotal: number }[];
  firma: { nombreFirmante: string; cargoFirmante: string | null; fecha: Date; imagenBase64: string } | null;
  historial: { fecha: Date; usuario: string; estadoNuevo: string; comentario: string | null }[];
}

export function InformeServicioDocument({
  empresa,
  ticket,
  cliente,
  sucursal,
  activo,
  tecnico,
  checklist,
  fotosAntes,
  fotosDespues,
  repuestos,
  firma,
  historial,
}: InformeServicioProps) {
  return (
    <Document title={`Informe de servicio ${ticket.numeroTicket}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerBar}>
          <View>
            <Text style={styles.empresaNombre}>{empresa.nombre}</Text>
            {empresa.rnc && <Text style={styles.empresaDato}>RNC/RUC: {empresa.rnc}</Text>}
            {empresa.direccion && <Text style={styles.empresaDato}>{empresa.direccion}</Text>}
            {(empresa.telefono || empresa.email) && (
              <Text style={styles.empresaDato}>{[empresa.telefono, empresa.email].filter(Boolean).join(" · ")}</Text>
            )}
          </View>
          {empresa.logoBase64 && (
            // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML
            <Image src={empresa.logoBase64} style={styles.headerLogo} />
          )}
        </View>

        <View>
          <Text style={styles.headerTitle}>Informe Técnico de Servicio</Text>
          <Text style={styles.headerSubtitle}>
            Ticket #{ticket.numeroTicket} · Generado el {FORMATO_FECHA.format(new Date())}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Datos del servicio</Text>
          <View style={styles.gridRow}>
            <View style={styles.gridCell}>
              <View style={styles.row}>
                <Text style={styles.label}>Cliente</Text>
                <Text style={styles.value}>{cliente.nombre}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Sede</Text>
                <Text style={styles.value}>
                  {sucursal.nombre}, {sucursal.direccion}, {sucursal.ciudad}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Técnico</Text>
                <Text style={styles.value}>{tecnico?.nombre ?? "Sin asignar"}</Text>
              </View>
            </View>
            <View style={styles.gridCell}>
              <View style={styles.row}>
                <Text style={styles.label}>Tipo</Text>
                <Text style={styles.value}>{ticket.tipo}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Categoría</Text>
                <Text style={styles.value}>{ticket.categoriaSoporte}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Prioridad / Estado</Text>
                <Text style={styles.value}>
                  {ticket.prioridad} / {ticket.estado.replaceAll("_", " ")}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Creado</Text>
                <Text style={styles.value}>{FORMATO_FECHA.format(ticket.fechaCreacion)}</Text>
              </View>
              {ticket.fechaResolucion && (
                <View style={styles.row}>
                  <Text style={styles.label}>Resuelto</Text>
                  <Text style={styles.value}>{FORMATO_FECHA.format(ticket.fechaResolucion)}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={{ marginTop: 6 }}>
            <Text style={{ fontFamily: "Helvetica-Bold" }}>{ticket.titulo}</Text>
            <Text style={{ marginTop: 2 }}>{ticket.descripcion}</Text>
          </View>
        </View>

        {activo && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activo intervenido</Text>
            <Text>
              {activo.categoria} — {activo.marca} {activo.modelo} (Serie #{activo.numeroSerie})
            </Text>
          </View>
        )}

        {checklist.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Checklist de mantenimiento</Text>
            {checklist.map((item, i) => (
              <View key={i} style={styles.checklistRow}>
                <Text style={styles.checklistDesc}>{item.descripcion}</Text>
                <Text style={styles.checklistResp}>{item.respuesta}</Text>
                <Text style={{ flex: 1.5, color: "#6b7280" }}>{item.observacion ?? ""}</Text>
              </View>
            ))}
          </View>
        )}

        {repuestos.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Repuestos utilizados</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={styles.th}>Repuesto</Text>
                <Text style={styles.th}>Cantidad</Text>
                <Text style={styles.th}>Costo</Text>
              </View>
              {repuestos.map((r, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={styles.td}>{r.nombre}</Text>
                  <Text style={styles.td}>{r.cantidad}</Text>
                  <Text style={styles.td}>S/ {r.costoTotal.toFixed(2)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {(fotosAntes.length > 0 || fotosDespues.length > 0) && (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Evidencia fotográfica</Text>
            {fotosAntes.length > 0 && (
              <>
                <Text style={styles.photoGroupLabel}>Antes</Text>
                <View style={styles.photosGrid}>
                  {fotosAntes.map((src, i) => (
                    // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML
                    <Image key={i} src={src} style={styles.photo} />
                  ))}
                </View>
              </>
            )}
            {fotosDespues.length > 0 && (
              <>
                <Text style={styles.photoGroupLabel}>Después</Text>
                <View style={styles.photosGrid}>
                  {fotosDespues.map((src, i) => (
                    // eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML
                    <Image key={i} src={src} style={styles.photo} />
                  ))}
                </View>
              </>
            )}
          </View>
        )}

        {firma && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Firma de conformidad</Text>
            <Text>
              {firma.nombreFirmante}
              {firma.cargoFirmante ? ` — ${firma.cargoFirmante}` : ""}
            </Text>
            <Text style={styles.historyMeta}>{FORMATO_FECHA.format(firma.fecha)}</Text>
            <View style={styles.signatureBox}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de @react-pdf/renderer, no <img> HTML */}
              <Image src={firma.imagenBase64} style={styles.signatureImage} />
            </View>
          </View>
        )}

        {historial.length > 0 && (
          <View style={styles.section} break>
            <Text style={styles.sectionTitle}>Historial de auditoría</Text>
            {historial.map((h, i) => (
              <View key={i} style={styles.historyItem}>
                <Text style={styles.historyMeta}>
                  {FORMATO_FECHA.format(h.fecha)} · {h.usuario} - {h.estadoNuevo.replaceAll("_", " ")}
                </Text>
                {h.comentario && <Text>{h.comentario}</Text>}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer} fixed>
          {empresa.nombre} · Documento generado automáticamente por NexIT
        </Text>
      </Page>
    </Document>
  );
}
