# Integración NexIT ↔ n8n

Documentación de los eventos que NexIT envía por webhook, cómo verificarlos en n8n, y
una plantilla de workflow lista para importar (o armar a mano, paso a paso).

## 1. Especificación de los payloads

Todo evento se envía como `POST` a `WEBHOOK_N8N_URL` con este sobre común:

```json
{
  "evento": "TICKET_CREADO | TICKET_CAMBIO_ESTADO | SLA_EN_RIESGO | TICKET_ASIGNADO | CONTACTO_CREADO | CONTACTO_NO_IDENTIFICADO",
  "timestamp": "2026-09-22T19:35:41.001Z",
  "empresaNombre": "NexIT Soporte Técnico",
  "data": { /* específico de cada evento, ver abajo */ }
}
```

> `empresaNombre` viaja en la raíz del sobre (no dentro de `data`) en **todo** evento —
> es `ConfiguracionSistema.empresaNombre` (editable en `/admin/configuracion` → "Perfil
> de la empresa"), nunca un string fijo. Los nodos de texto de los workflows (correo de
> bienvenida, aviso de contacto no identificado, etc.) lo referencian con
> `{{ $json.empresaNombre }}` en vez de tener el nombre de la empresa escrito a mano —
> si renombrás la empresa ahí, esos mensajes cambian solos, sin tocar ningún workflow.

Headers en cada request (fuente: `src/server/services/webhook.service.ts`):

```
Content-Type: application/json
X-NexIT-Signature: sha256=<hmac-sha256 hex del body completo, con WEBHOOK_SECRET>
Authorization: Bearer <WEBHOOK_SECRET>
```

Los dos headers de autenticación solo se envían si `WEBHOOK_SECRET` está configurado
en NexIT. Si no lo está, el payload llega sin firmar (no recomendado en producción).

### `TICKET_CREADO`

Se dispara al crear un ticket desde `/portal` (`origen: "PORTAL"`), desde el asistente
de IA conversacional (`origen: "CHATBOT"`, ver §6), desde "Crear ticket" en
`/tickets/nuevo` cuando el staff reporta algo por teléfono (`origen: "TELEFONO"`), o al
generarse automáticamente desde un plan preventivo (`origen: "PROGRAMADO"`).

```json
{
  "evento": "TICKET_CREADO",
  "timestamp": "2026-09-22T19:35:41.001Z",
  "data": {
    "ticketId": "cmud08cs7001ldng8qep2s38e",
    "numeroTicket": "TCK-0002",
    "clienteId": "cmud08c570001dng86efar0f2",
    "clienteNombre": "Hospital San Rafael",
    "titulo": "Switch de piso 3 no responde",
    "prioridad": "CRITICA",
    "origen": "PORTAL",
    "reportadoPorNombre": "Ana Torres",
    "reportadoPorEmail": "cliente@hospitalsanrafael.com",
    "reportadoPorTelegramChatId": "999888777",
    "reportadoPorWhatsapp": "+51987654321"
  }
}
```

> **Importante sobre `reportadoPorEmail`**: el modelo `Cliente` de NexIT no tiene un
> email propio de empresa — solo `Usuario.email`. Cuando `origen` es `PORTAL`,
> `CHATBOT` o `TELEFONO`, `reportadoPorEmail` es siempre un contacto real del cliente
> (destinatario correcto para la confirmación) — en `TELEFONO`, `crear-ticket.ts` busca
> o crea ese contacto antes de emitir el evento (ver §3.f, `CONTACTO_CREADO`), nunca usa
> el email del miembro del staff que llenó el formulario. Cuando `origen: "PROGRAMADO"`,
> sigue siendo el correo del **coordinador** que corrió la generación automática, no un
> contacto del cliente — tu workflow debe filtrar por `origen` antes de mandar el email
> de confirmación (ver §3).

> **`reportadoPorTelegramChatId` / `reportadoPorWhatsapp`**: `null` si ese usuario
> nunca vinculó el canal desde `/perfil` (los 4 roles tienen esa opción en su perfil).
> A diferencia de `reportadoPorEmail` (siempre presente), estos dos SIEMPRE hay que
> chequearlos con un IF antes de usarlos — un chat_id o teléfono vacío rompe los nodos
> de Telegram/Twilio en vez de simplemente no hacer nada (ver §3.d).

### `TICKET_CAMBIO_ESTADO`

Se dispara en tres transiciones puntuales: check-in del técnico (`EN_DIAGNOSTICO`),
cierre del wizard de ejecución (`ESPERANDO_VALIDACION`) y aprobación del cliente
(`RESUELTO`) — más la cancelación por Coordinador/Admin (`CANCELADO`, ver
`cancelarTicket()`). No se dispara en `REABIERTO` (rechazo del cliente) ni en
`CERRADO` (cierre administrativo) — no forman parte de los eventos de integración
pedidos.

```json
{
  "evento": "TICKET_CAMBIO_ESTADO",
  "timestamp": "2026-09-22T21:10:03.500Z",
  "data": {
    "ticketId": "cmud08cs7001ldng8qep2s38e",
    "numeroTicket": "TCK-0002",
    "clienteNombre": "Hospital San Rafael",
    "estadoAnterior": "EN_EJECUCION",
    "estadoNuevo": "ESPERANDO_VALIDACION",
    "reportadoPorNombre": "Ana Torres",
    "reportadoPorEmail": "cliente@hospitalsanrafael.com",
    "reportadoPorTelegramChatId": "999888777",
    "reportadoPorWhatsapp": "+51987654321"
  }
}
```

`estadoNuevo` es siempre uno de
`"EN_DIAGNOSTICO" | "ESPERANDO_VALIDACION" | "RESUELTO" | "CANCELADO"`.

> **`motivo`**: campo opcional, presente solo cuando `estadoNuevo === "CANCELADO"` —
> el texto que Coordinador/Admin escribió al cancelar (ver `/tickets/[id]`, panel de
> gestión). El resto de las transiciones no lo incluyen en el payload.

### `SLA_EN_RIESGO`

Se dispara desde `POST /api/cron/sla-check` (ver §4) — no desde una acción de usuario,
porque "estar a punto de vencer" es una condición de tiempo, no un evento discreto.

```json
{
  "evento": "SLA_EN_RIESGO",
  "timestamp": "2026-09-22T21:15:00.000Z",
  "data": {
    "ticketId": "cmud08cta001ndng8f1ttdp1t",
    "numeroTicket": "TCK-0003",
    "clienteNombre": "Constructora ABC S.A.",
    "titulo": "Instalación de punto de red adicional",
    "prioridad": "MEDIA",
    "tecnicoAsignadoNombre": null,
    "estadoSla": "en_riesgo",
    "minutosRestantes": 42
  }
}
```

`estadoSla` es `"en_riesgo"` (80%+ del tiempo de resolución consumido) o `"vencido"`
(100%+). `tecnicoAsignadoNombre` es `null` si el ticket aún no tiene técnico asignado —
justamente el caso que más urge escalar. Cada corrida del cron reevalúa todos los
tickets abiertos con SLA: uno que sigue en riesgo genera un nuevo evento en cada
corrida (recordatorio), no solo la primera vez.

### `TICKET_ASIGNADO`

Se dispara al asignar o reasignar un técnico (`asignarTecnico()`), y también cuando un
ticket generado automáticamente desde un plan preventivo nace ya con técnico asignado
(`generarTicketsPreventivos()`) — en ambos casos, sin este evento, el técnico no tenía
forma de enterarse de trabajo nuevo salvo entrando a la app o preguntando por chat.

```json
{
  "evento": "TICKET_ASIGNADO",
  "timestamp": "2026-09-28T14:00:00.000Z",
  "data": {
    "ticketId": "cmud08cs7001ldng8qep2s38e",
    "numeroTicket": "TCK-0002",
    "clienteNombre": "Hospital San Rafael",
    "titulo": "Switch de piso 3 no responde",
    "prioridad": "CRITICA",
    "esReasignacion": false,
    "origen": "PORTAL",
    "tecnicoNombre": "María Gómez",
    "tecnicoEmail": "tecnico@nexit.dev",
    "tecnicoTelegramChatId": "555000111",
    "tecnicoWhatsapp": null,
    "reportadoPorNombre": "Ana Torres",
    "reportadoPorEmail": "cliente@hospitalsanrafael.com",
    "reportadoPorTelegramChatId": null,
    "reportadoPorWhatsapp": "+51987654321"
  }
}
```

> **A diferencia de los otros eventos, este tiene DOS destinatarios distintos**: el
> **técnico** recién asignado (`tecnicoNombre`/`tecnicoEmail`/`tecnicoTelegramChatId`/
> `tecnicoWhatsapp`) y el **cliente** que reportó el ticket
> (`reportadoPorNombre`/`reportadoPorEmail`/`reportadoPorTelegramChatId`/
> `reportadoPorWhatsapp`) — antes el cliente no se enteraba en absoluto de que alguien
> ya estaba viendo su problema.
>
> **`origen` distingue "hay un contacto real del cliente" de "no lo hay"** — acá el
> workflow filtra por `origen == "PORTAL" || origen == "CHATBOT" || origen ==
> "TELEFONO"`: los tres son un cliente real (reportando por el portal web, por el
> asistente de IA en Telegram/WhatsApp, o por teléfono con el staff buscando/creando su
> contacto en `/tickets/nuevo` — ver §3.f), mientras que `"PROGRAMADO"` sigue siendo el
> coordinador que generó el ticket automáticamente desde un preventivo — a ese no tiene
> sentido avisarle "se te asignó un técnico" como si fuera el cliente. (`TICKET_CREADO`
> excluye `CHATBOT` a propósito, ver abajo: ese cliente ya recibió su confirmación
> dentro de la misma conversación de chat — ver §6 —, mandarle otra por ese evento sería
> duplicado; pero `TICKET_ASIGNADO` sí lo incluye, porque "te asignaron un técnico" es
> información nueva que el chat inicial no le dio.) Los 4 campos de contacto son `null`
> si esa persona nunca vinculó ese canal desde `/perfil`.

### `CONTACTO_CREADO`

Se dispara cuando el staff crea un ticket interno (`/tickets/nuevo`) para un contacto
que todavía no existía en NexIT — ver §3.f. El contacto nace como `Usuario` rol
`CLIENTE` con acceso al Portal, pero nadie le avisó todavía que esa cuenta existe.

```json
{
  "evento": "CONTACTO_CREADO",
  "timestamp": "2026-09-30T15:00:00.000Z",
  "data": {
    "usuarioId": "cmuz08cs7001ldng8qep2s38e",
    "nombre": "Ana Torres",
    "email": "ana.torres@hospitalsanrafael.com",
    "passwordTemporal": "Xk29fQpLmN==",
    "clienteNombre": "Hospital San Rafael",
    "whatsapp": null
  }
}
```

> `passwordTemporal` viaja en texto plano por este evento — es la naturaleza del patrón
> "contraseña temporal por correo/chat" que ya usa `resetear-password-usuario.ts` en la
> app. No se guarda en ningún otro lugar de NexIT; una vez enviada, solo vive en la
> conversación de correo/WhatsApp del contacto. `whatsapp` es `null` si el staff no lo
> cargó al crear el contacto (Telegram nunca viaja acá — un contacto recién creado
> todavía no pudo vincularlo desde `/perfil`).

### `CONTACTO_NO_IDENTIFICADO`

Se dispara desde `/api/n8n/contacto-pendiente/mensaje` (ver §6.c) recién cuando un
contacto no identificado terminó de responder 5 preguntas básicas por chat — no en su
primer mensaje, para no spamear al chat interno con cada "Hola" suelto antes de tener
algo accionable. No hay a quién notificarle nada del lado del cliente todavía (no es un
`Usuario` real), así que esto es un aviso interno para que un Coordinador/Admin
confirme a qué cliente pertenece y le cree el ticket desde `/admin/contactos-pendientes`.

```json
{
  "evento": "CONTACTO_NO_IDENTIFICADO",
  "timestamp": "2026-09-30T15:05:00.000Z",
  "data": {
    "contactoPendienteId": "cmuzz08cs7001ldng8qep2s38e",
    "canal": "WHATSAPP",
    "identificador": "+18095551234",
    "nombre": "Pedro Martínez",
    "empresaReportada": "Constructora ABC",
    "telefonoReportado": "+18095559999",
    "correoReportado": "pedro@constructoraabc.com",
    "motivo": "La impresora de recepción no imprime",
    "staffWhatsapp": ["+18095550001", "+18095550002"]
  }
}
```

> **`empresaReportada` es solo lo que la persona escribió, nunca verificado** — el
> representante que vea el aviso decide manualmente a qué `Cliente` real de NexIT
> corresponde (el mismo criterio que ya se usa en "Crear ticket interno", ver §3.f):
> jamás se auto-matchea contra un cliente real, porque un error ahí mezclaría datos
> entre dos empresas distintas.
>
> **`staffWhatsapp`** ya viene resuelto por NexIT (teléfonos de WhatsApp de todo
> ADMIN/COORDINADOR activo que vinculó el canal en su Perfil) — n8n no puede consultar
> la base de datos, así que no hay forma de armar esa lista del lado del workflow. Puede
> venir vacío si nadie del staff vinculó WhatsApp; en ese caso, el aviso de Telegram al
> chat interno sigue siendo el único canal.
>
> No hay reintento ni deduplicación más allá de "recién se avisa cuando los 5 campos ya
> están completos": si la misma persona completa el formulario, se convierte en ticket,
> y vuelve a escribir después, arranca un `ContactoPendiente` nuevo desde cero — el único
> control contra avisos repetidos es el estado `CONVERTIDO`/`PENDIENTE` de la fila ya
> existente, que `procesarMensajeContactoPendiente()` consulta antes de volver a preguntar.

## 2. Verificar la identidad del request en n8n

NexIT manda el secreto de dos formas en paralelo en cada webhook — usa la que te
resulte más simple en tu versión de n8n:

- `Authorization: Bearer <WEBHOOK_SECRET>` — un string plano, no depende de tener el
  body crudo ni de ningún módulo nativo. **Es la que usa el JSON importable de §5.**
- `X-NexIT-Signature: sha256=<hmac>` — firma HMAC del body completo, más estricta
  (protege contra que alguien con la URL pero sin el secreto reenvíe un payload
  interceptado), pero exige que n8n reciba el **body crudo** (los mismos bytes que
  NexIT firmó) — si n8n lo reserializa antes de calcular el HMAC, el resultado no va a
  coincidir aunque el contenido sea "igual" (cambia el orden de llaves, espacios,
  etc.). En la práctica esto depende mucho de la versión/config de n8n: en instancias
  con Task Runners (n8n self-hosted moderno) además el nodo Code no puede hacer
  `require('crypto')` (error `Module 'crypto' is disallowed`), y la opción "Raw Body"
  del nodo Webhook no siempre entrega el body como string en vez de objeto ya
  parseado — si te pasa esto último, no vale la pena pelear con reserializar el JSON
  a mano (nunca va a dar el mismo hash byte a byte); usá Bearer.

### Opción recomendada — verificar el header `Authorization` (Bearer)

Un solo nodo **IF** comparando:
`={{ $json.headers.authorization }}` **igual a** `={{ 'Bearer ' + $env.WEBHOOK_SECRET }}`

Después, en la salida `true`, un nodo **Code** que parsea el body — sin `require`,
funciona en cualquier versión, y es robusto a que el Webhook entregue `body` como
string crudo O ya como objeto parseado (no hace falta saber cuál de las dos hace tu
instancia):

```js
const raw = $('Webhook NexIT').item.json.body;
return [{ json: typeof raw === 'string' ? JSON.parse(raw) : raw }];
```

(Ajustá `'Webhook NexIT'` al nombre real de tu nodo Webhook si le pusiste otro.)

### Opción avanzada — verificar también la firma HMAC

Si además de Bearer querés la protección extra de la firma, primero confirmá que tu
nodo Webhook realmente entrega el body como string: ejecutá el workflow una vez con
datos de prueba y mirá la pestaña "JSON" del nodo Webhook — si `body` aparece como
string (no como `{ evento: ..., data: {...} }` ya parseado), podés agregar:

**Nodo Crypto** ("Calcular HMAC") antes del IF de arriba:
- Action: `HMAC`, Type: `SHA256`, Encoding: `hex`
- Value: `{{$json.body}}` (el string crudo)
- Secret: `{{$env.WEBHOOK_SECRET}}`
- Output/Data Property Name: `firmaCalculada`

Y cambiá la condición del IF a comparar
`={{ 'sha256=' + $json.firmaCalculada }}` con
`={{ $('Webhook NexIT').item.json.headers['x-nexit-signature'] }}` en vez de (o además
de) el Bearer.

**Alternativa, todo en un nodo Code** (solo si tu instancia permite `require('crypto')`
— probalo con datos de prueba antes de confiar en esta opción; en instancias con Task
Runners falla):

```js
const crypto = require('crypto');
const secret = $env.WEBHOOK_SECRET;
const rawBody = $input.first().json.body; // ajusta el nombre según tu versión
const firmaRecibida = $input.first().json.headers['x-nexit-signature'] || '';
const firmaCalculada = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

if (firmaRecibida !== firmaCalculada) {
  throw new Error('Firma inválida — posible request falsificado');
}

return [{ json: JSON.parse(rawBody) }];
```

Un `throw` dentro de un Code node detiene el workflow y lo marca como fallido —
suficiente para rechazar el request sin construir un branch de error aparte, aunque no
le da un 401 explícito al llamador (NexIT no le importa el código de estado; ya
despachó el webhook en segundo plano y no reintenta).

## 3. Workflow: enrutar por tipo de evento

Con el body ya verificado y parseado, arma el resto así:

```
Webhook → IF Verificar Bearer ─┬─ false → (fin, sin responder = 401 implícito, o Respond to Webhook 401)
                                └─ true → Code (parsear body) → Respond to Webhook (200 "recibido")
                                                              → Switch (por $json.evento)
                                                                 ├─ TICKET_CREADO
                                                                 ├─ TICKET_CAMBIO_ESTADO
                                                                 ├─ SLA_EN_RIESGO
                                                                 ├─ TICKET_ASIGNADO
                                                                 ├─ CONTACTO_CREADO
                                                                 └─ CONTACTO_NO_IDENTIFICADO
```

Responder ANTES del Switch es intencional: NexIT ya despachó el webhook de forma
fire-and-forget con un timeout de 8s — si el envío del email/Telegram tarda, no hay
razón para que NexIT espere. n8n sigue ejecutando los nodos posteriores al "Respond to
Webhook" en segundo plano igual.

### a) `TICKET_CREADO` → confirmación al cliente (email + Telegram + WhatsApp)

```
Switch[TICKET_CREADO] → IF ($json.data.origen == "PORTAL" || $json.data.origen == "TELEFONO")
                          ├─ true  → Send Email (SMTP)
                          │            To: {{$json.data.reportadoPorEmail}}
                          │            Subject: Ticket #{{$json.data.numeroTicket}} recibido
                          │            Body: "Hola {{$json.data.reportadoPorNombre}}, registramos tu
                          │                   solicitud '{{$json.data.titulo}}' con prioridad
                          │                   {{$json.data.prioridad}}. Te avisaremos cuando un
                          │                   técnico la atienda."
                          │          → IF ($json.data.reportadoPorTelegramChatId != null)
                          │               └─ true → Telegram sendMessage (mismo texto)
                          │          → IF ($json.data.reportadoPorWhatsapp != null)
                          │               └─ true → Twilio (nodo Twilio, no HTTP Request)
                          │                    From: whatsapp:<tu número Twilio>
                          │                    To:   =whatsapp:{{$json.data.reportadoPorWhatsapp}}
                          └─ false → NoOp (origen PROGRAMADO: el "reportador" es un
                                      coordinador, no un contacto del cliente — no se le
                                      manda una "confirmación de tu reporte". Origen
                                      CHATBOT tampoco entra acá a propósito: ese cliente
                                      ya recibió su confirmación dentro de la misma
                                      conversación de chat, ver §6 — mandarle otra por
                                      este evento sería duplicado)
```

Los tres envíos (email, Telegram, WhatsApp) son independientes entre sí, no
if/else — un cliente que vinculó los dos canales de chat además del email recibe la
confirmación por los tres. Los IF de Telegram/WhatsApp filtran por `null` porque un
`chat_id`/teléfono vacío rompe esos nodos en vez de simplemente no hacer nada.

`TELEFONO` se sumó a este filtro junto con el cambio que hace que "Crear ticket"
(`/tickets/nuevo`) ya no le atribuya el ticket al miembro del staff que lo cargó, sino
al contacto real del cliente (buscado o creado en el mismo formulario, ver §3.f) — antes
de eso, `reportadoPorEmail` en origen `TELEFONO` apuntaba al staff, así que agregar esta
rama habría significado notificarle a la persona equivocada.

### b) `TICKET_CAMBIO_ESTADO` → aviso de visita lista para aprobar (email + Telegram + WhatsApp)

```
Switch[TICKET_CAMBIO_ESTADO] ─┬─ IF ($json.data.estadoNuevo == "ESPERANDO_VALIDACION")
                               │    └─ true → Send Email (SMTP)
                               │                To: {{$json.data.reportadoPorEmail}}
                               │                Subject: Visita completada — Ticket #{{$json.data.numeroTicket}}
                               │                Body: "El técnico finalizó la visita para
                               │                       '{{$json.data.clienteNombre}}'. Ingresa a
                               │                       {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}}
                               │                       para revisar el informe y aprobar o rechazar."
                               │              → IF ($json.data.reportadoPorTelegramChatId != null)
                               │                   └─ true → Telegram sendMessage (mismo texto)
                               │              → IF ($json.data.reportadoPorWhatsapp != null)
                               │                   └─ true → Twilio sendMessage (mismo texto)
                               └─ IF ($json.data.estadoNuevo == "CANCELADO")   (ver e) más abajo)
```

`NEXIT_BASE_URL` es una variable de entorno propia de tu instancia de n8n (ej.
`https://nexit.tuempresa.com`) — el payload trae `ticketId` pero no la URL base, ya
que esa es una decisión de despliegue, no algo que la app deba conocer sobre n8n.

Ambos IF cuelgan del mismo branch del Switch (evalúan independientemente
`estadoNuevo`, no son mutuamente excluyentes en el grafo) — `EN_DIAGNOSTICO` no
dispara ninguno de los dos, el Switch deja ese caso sin acción hoy.

### c) `SLA_EN_RIESGO` → alerta al equipo técnico/coordinador

```
Switch[SLA_EN_RIESGO] → Telegram (sendMessage a un GRUPO, no a un usuario) o Slack
                           Texto: "🚨 SLA {{$json.data.estadoSla === 'vencido' ? 'VENCIDO' : 'en riesgo'}}
                                   — Ticket #{{$json.data.numeroTicket}} ({{$json.data.clienteNombre}})
                                   Prioridad: {{$json.data.prioridad}}
                                   Técnico: {{$json.data.tecnicoAsignadoNombre || 'SIN ASIGNAR'}}
                                   Restan: {{$json.data.minutosRestantes}} min"
```

Sin IF adicional aquí: `/api/cron/sla-check` solo dispara este evento para tickets que
YA están en `en_riesgo` o `vencido` — el filtro ya ocurrió del lado de NexIT.

### d) `TICKET_ASIGNADO` → avisar al técnico Y al cliente

```
Switch[TICKET_ASIGNADO] ─┬─ IF ($json.data.tecnicoTelegramChatId != null)
                          │    └─ true → Telegram sendMessage al TÉCNICO
                          │         chatId: {{$json.data.tecnicoTelegramChatId}}
                          │         text: "{{$json.data.esReasignacion ? '🔄 Te reasignaron' : '🆕 Te asignaron'}}
                          │                el ticket #{{$json.data.numeroTicket}} ({{$json.data.clienteNombre}})
                          │                Prioridad: {{$json.data.prioridad}}
                          │                {{$json.data.titulo}}"
                          ├─ IF ($json.data.tecnicoWhatsapp != null)
                          │    └─ true → Twilio sendMessage al TÉCNICO (mismo texto)
                          └─ IF ($json.data.origen == "PORTAL" || $json.data.origen == "CHATBOT"
                                  || $json.data.origen == "TELEFONO")
                               └─ true → IF ($json.data.reportadoPorTelegramChatId != null)
                                            └─ true → Telegram sendMessage al CLIENTE
                                                 chatId: {{$json.data.reportadoPorTelegramChatId}}
                                                 text: "Un técnico ({{$json.data.tecnicoNombre}}) fue
                                                        asignado a tu ticket #{{$json.data.numeroTicket}}
                                                        y ya está trabajando en tu solicitud."
                                        → IF ($json.data.reportadoPorWhatsapp != null)
                                            └─ true → Twilio sendMessage al CLIENTE (mismo texto)
```

Las tres ramas que cuelgan directo del Switch (técnico Telegram, técnico WhatsApp, IF
origen) son independientes entre sí — un técnico que vinculó ambos canales recibe el
aviso por los dos, y en paralelo se evalúa si corresponde avisarle también al cliente.
El IF de `origen` acepta `PORTAL`, `CHATBOT` **o** `TELEFONO` — los tres son un cliente
real (el de `TELEFONO` fue buscado o creado en `/tickets/nuevo`, ver §3.f). Solo queda
afuera `"PROGRAMADO"`: ahí el "reportador" sigue siendo el coordinador que generó el
ticket automáticamente desde un preventivo, no un contacto real del cliente, y no tiene
sentido avisarle "te asignaron un técnico" a quien ya sabía que el ticket se iba a crear.

### e) `TICKET_CAMBIO_ESTADO` (`estadoNuevo == "CANCELADO"`) → avisar al cliente de la cancelación

```
IF CANCELADO ($json.data.estadoNuevo == "CANCELADO")
  └─ true → Send Email (SMTP)
  │           To: {{$json.data.reportadoPorEmail}}
  │           Subject: Ticket #{{$json.data.numeroTicket}} cancelado
  │           Body: "Hola {{$json.data.reportadoPorNombre}}, tu ticket
  │                  #{{$json.data.numeroTicket}} fue cancelado.
  │                  Motivo: {{$json.data.motivo || 'no especificado'}}."
  │         → IF ($json.data.reportadoPorTelegramChatId != null)
  │              └─ true → Telegram sendMessage (mismo texto, sin asunto)
  │         → IF ($json.data.reportadoPorWhatsapp != null)
  │              └─ true → Twilio sendMessage (mismo texto)
```

Antes de esto, cancelar un ticket (`cancelarTicket()`, botón "Cancelar ticket" en
`/tickets/[id]`) no emitía ningún evento — el cliente que reportó el problema nunca se
enteraba de que su solicitud había sido cancelada, ni siquiera por email. No hay
distinción por `origen` aquí (a diferencia de a) y d)): sea `reportadoPor*` un contacto
real del cliente o el coordinador que generó el ticket desde un preventivo
(`PROGRAMADO`), a esa persona igual le sirve saber que se decidió cancelarlo, no solo
que se creó o asignó.

### f) `CONTACTO_CREADO` → bienvenida con acceso al Portal

```
Switch[CONTACTO_CREADO] → Send Email (SMTP)
                             To: {{$json.data.email}}
                             Subject: Bienvenido a NexIT — acceso a tu Portal
                             Body: "Hola {{$json.data.nombre}}, un representante de
                                    {{$json.data.clienteNombre}} te registró en NexIT.
                                    Ingresa en {{$env.NEXIT_BASE_URL}}/login con:
                                    Usuario: {{$json.data.email}}
                                    Contraseña temporal: {{$json.data.passwordTemporal}}"
                           → IF ($json.data.whatsapp != null)
                                └─ true → Twilio sendMessage (mismo mensaje, sin asunto)
```

Sin IF de `origen` (este evento no lo trae — siempre es la misma situación: un contacto
recién creado desde "Crear ticket" en `/tickets/nuevo`, ver §3 más abajo). No hay rama
de Telegram: un contacto que se acaba de crear todavía no tuvo oportunidad de vincularlo
desde `/perfil`.

### g) `CONTACTO_NO_IDENTIFICADO` → alerta interna, no al contacto

```
Switch[CONTACTO_NO_IDENTIFICADO] ─┬─ Telegram sendMessage a un GRUPO interno (no al remitente)
                                   │    chatId: {{$env.NEXIT_TELEGRAM_CHAT_ID}}
                                   │    Texto: "📵 Contacto no identificado por {{$json.data.canal}}
                                   │            ({{$json.data.identificador}}):
                                   │            Nombre: {{$json.data.nombre}}
                                   │            Empresa (reportada, sin confirmar): {{$json.data.empresaReportada}}
                                   │            Teléfono: {{$json.data.telefonoReportado}}
                                   │            Correo: {{$json.data.correoReportado}}
                                   │            Motivo: {{$json.data.motivo}}
                                   │            Un representante debe confirmar el cliente y crear el ticket."
                                   └─ Split Out ($json.data.staffWhatsapp → "telefono")
                                        └─ Twilio sendMessage a CADA Admin/Coordinador
                                             to: =whatsapp:{{$json.telefono}}
                                             message: (mismo contenido, leído de
                                                       $('Switch por evento').item.json.data.*
                                                       porque Split Out ya pisó esos campos)
```

Mismo `$env.NEXIT_TELEGRAM_CHAT_ID` que usa la alerta de SLA en riesgo (§3.c) — un chat
interno de soporte, no el contacto que escribió. En paralelo, el nodo **Split Out**
convierte el arreglo `staffWhatsapp` (ya resuelto por NexIT, ver §1) en un ítem por
teléfono, y Twilio le manda el mismo aviso a cada uno — si el arreglo viene vacío
(nadie del staff vinculó WhatsApp), esa rama simplemente no genera ningún envío.

El representante que lo vea entra a **`/admin/contactos-pendientes`** en NexIT, revisa
el motivo/empresa reportada, confirma manualmente a qué cliente real pertenece, y clic
en "Crear ticket con estos datos" — eso abre `/tickets/nuevo` con el contacto ya
prellenado (ver §3.f) y, al crear el ticket, marca ese `ContactoPendiente` como
`CONVERTIDO`.

## 4. Cron del chequeo de SLA (`Schedule Trigger`)

```
Schedule Trigger (cada 15 min) → HTTP Request
                                    Method: POST
                                    URL: https://nexit.tuempresa.com/api/cron/sla-check
                                    Authentication: Header Auth (credencial de n8n)
                                      Name:  Authorization
                                      Value: Bearer <WEBHOOK_SECRET>
```

Configuración del **Schedule Trigger**: modo "Interval", Unit = "Minutes", Value = 15.

Para el header `Authorization`, usa una credencial de tipo **Header Auth** en vez de
escribir el secreto directo en el nodo — así no queda expuesto si exportas/compartes
el workflow. Alternativa rápida sin credencial: escribir el header manualmente en
"Header Parameters" del HTTP Request node (menos seguro, pero funcional para probar).

La respuesta de NexIT es `{ "revisados": N, "notificados": M }` — puedes encadenar un
nodo IF que solo loguee/alerte si `notificados > 0`, aunque no es necesario: cada
`SLA_EN_RIESGO` ya llega como su propio webhook independiente al workflow de §3.

## 5. JSON importable (punto de partida)

Dos workflows para importar en n8n ("Import from File" o pegar en "Import from
Clipboard"). **Después de importar**, tendrás que: crear/asignar las credenciales SMTP
y Telegram (no viajan en el export), revisar el nombre exacto del campo de body crudo
del Webhook node en tu versión de n8n, y configurar `WEBHOOK_SECRET` /
`NEXIT_BASE_URL` como variables de entorno de tu instancia de n8n.

> Los JSON de abajo también están como archivos sueltos en
> [`n8n-workflows/`](./n8n-workflows/) — en n8n, **Workflows → Import from File** y
> subís directo `1-eventos-webhook.json` / `2-cron-sla.json` /
> `3-asistente-ia-telegram-whatsapp.json`, sin copiar/pegar. También está
> `0-router-canal-unico.json` (ver §10) para quien quiera compartir un solo
> bot/número entre cliente, técnico y staff en vez de uno por flujo.

### Workflow 1 — Router de eventos

```json
{
  "name": "NexIT - Eventos webhook",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "nexit-events",
        "responseMode": "responseNode",
        "options": {
          "rawBody": true
        }
      },
      "id": "webhook-nexit",
      "name": "Webhook NexIT",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [
        0,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{ $(\"Webhook NexIT\").item.json.headers.authorization }}",
              "rightValue": "={{ \"Bearer \" + $env.WEBHOOK_SECRET }}",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "id": "verificar-bearer",
      "name": "Verificar Bearer",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        220,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const raw = $('Webhook NexIT').item.json.body;\nreturn [{ json: typeof raw === 'string' ? JSON.parse(raw) : raw }];"
      },
      "id": "parsear-body",
      "name": "Parsear body",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { \"recibido\": true } }}"
      },
      "id": "responder-ok",
      "name": "Respond 200",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [
        880,
        0
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "TICKET_CREADO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "TICKET_CAMBIO_ESTADO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "SLA_EN_RIESGO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "TICKET_ASIGNADO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "CONTACTO_CREADO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.evento}}",
                    "rightValue": "CONTACTO_NO_IDENTIFICADO",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "id": "switch-evento",
      "name": "Switch por evento",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        1100,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "combinator": "or",
          "conditions": [
            {
              "leftValue": "={{$json.data.origen}}",
              "rightValue": "PORTAL",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "leftValue": "={{$json.data.origen}}",
              "rightValue": "TELEFONO",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "id": "if-origen-portal",
      "name": "IF origen PORTAL",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        -420
      ]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Ticket #{{$json.data.numeroTicket}} recibido",
        "text": "={{$json.data.mensaje}}"
      },
      "id": "email-ticket-creado",
      "name": "Email confirmacion ticket",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [
        1540,
        -480
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorTelegramChatId}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-telegram-creado",
      "name": "IF cliente tiene Telegram (creado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        -380
      ]
    },
    {
      "parameters": {
        "chatId": "={{$json.data.reportadoPorTelegramChatId}}",
        "text": "={{$json.data.mensaje}}"
      },
      "id": "telegram-confirmacion-creado",
      "name": "Telegram confirmacion ticket",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1760,
        -420
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorWhatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-whatsapp-creado",
      "name": "IF cliente tiene WhatsApp (creado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        -280
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.reportadoPorWhatsapp}}",
        "message": "={{$json.data.mensaje}}"
      },
      "id": "twilio-confirmacion-creado",
      "name": "Twilio confirmacion ticket",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1760,
        -280
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.estadoNuevo}}",
              "rightValue": "ESPERANDO_VALIDACION",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "id": "if-esperando-validacion",
      "name": "IF ESPERANDO_VALIDACION",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        -120
      ]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Visita completada - Ticket #{{$json.data.numeroTicket}}",
        "text": "={{$json.data.mensaje}} Ingresa a {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}} para revisar el informe y aprobar o rechazar."
      },
      "id": "email-esperando-validacion",
      "name": "Email revisar y aprobar",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [
        1540,
        -180
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorTelegramChatId}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-telegram-validacion",
      "name": "IF cliente tiene Telegram (validacion)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        -80
      ]
    },
    {
      "parameters": {
        "chatId": "={{$json.data.reportadoPorTelegramChatId}}",
        "text": "={{$json.data.mensaje}} Ingresa a {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}} para revisar el informe y aprobar o rechazar."
      },
      "id": "telegram-revisar-aprobar",
      "name": "Telegram revisar y aprobar",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1760,
        -120
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorWhatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-whatsapp-validacion",
      "name": "IF cliente tiene WhatsApp (validacion)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        20
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.reportadoPorWhatsapp}}",
        "message": "={{$json.data.mensaje}} Ingresa a {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}} para revisar el informe y aprobar o rechazar."
      },
      "id": "twilio-revisar-aprobar",
      "name": "Twilio revisar y aprobar",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1760,
        20
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{$env.NEXIT_TELEGRAM_CHAT_ID}}",
        "text": "={{$json.data.mensaje}}"
      },
      "id": "telegram-alerta-sla",
      "name": "Telegram alerta SLA",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1320,
        140
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.tecnicoTelegramChatId}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-tecnico-telegram",
      "name": "IF técnico tiene Telegram",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        260
      ]
    },
    {
      "parameters": {
        "chatId": "={{$json.data.tecnicoTelegramChatId}}",
        "text": "={{$json.data.mensajeTecnico}}"
      },
      "id": "telegram-aviso-asignacion",
      "name": "Telegram aviso asignacion",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1540,
        220
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.tecnicoWhatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-tecnico-whatsapp",
      "name": "IF técnico tiene WhatsApp",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        320
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.tecnicoWhatsapp}}",
        "message": "={{$json.data.mensajeTecnico}}"
      },
      "id": "twilio-aviso-asignacion",
      "name": "Twilio aviso asignacion",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1540,
        320
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "combinator": "or",
          "conditions": [
            {
              "leftValue": "={{$json.data.origen}}",
              "rightValue": "PORTAL",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "leftValue": "={{$json.data.origen}}",
              "rightValue": "CHATBOT",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            },
            {
              "leftValue": "={{$json.data.origen}}",
              "rightValue": "TELEFONO",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "id": "if-origen-portal-asignado",
      "name": "IF origen PORTAL (asignado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        420
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorTelegramChatId}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-telegram-asignado",
      "name": "IF cliente tiene Telegram (asignado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        400
      ]
    },
    {
      "parameters": {
        "chatId": "={{$json.data.reportadoPorTelegramChatId}}",
        "text": "={{$json.data.mensajeCliente}}"
      },
      "id": "telegram-aviso-asignacion-cliente",
      "name": "Telegram aviso asignacion (cliente)",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1760,
        380
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorWhatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-whatsapp-asignado",
      "name": "IF cliente tiene WhatsApp (asignado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        500
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.reportadoPorWhatsapp}}",
        "message": "={{$json.data.mensajeCliente}}"
      },
      "id": "twilio-aviso-asignacion-cliente",
      "name": "Twilio aviso asignacion (cliente)",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1760,
        500
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.estadoNuevo}}",
              "rightValue": "CANCELADO",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ]
        }
      },
      "id": "if-cancelado",
      "name": "IF CANCELADO",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1320,
        620
      ]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Ticket #{{$json.data.numeroTicket}} cancelado",
        "text": "={{$json.data.mensaje}}"
      },
      "id": "email-cancelado",
      "name": "Email aviso cancelacion",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [
        1540,
        560
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorTelegramChatId}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-telegram-cancelado",
      "name": "IF cliente tiene Telegram (cancelado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        660
      ]
    },
    {
      "parameters": {
        "chatId": "={{$json.data.reportadoPorTelegramChatId}}",
        "text": "={{$json.data.mensaje}}"
      },
      "id": "telegram-cancelado",
      "name": "Telegram aviso cancelacion",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1760,
        640
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.reportadoPorWhatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-whatsapp-cancelado",
      "name": "IF cliente tiene WhatsApp (cancelado)",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        760
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.reportadoPorWhatsapp}}",
        "message": "={{$json.data.mensaje}}"
      },
      "id": "twilio-cancelado",
      "name": "Twilio aviso cancelacion",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1760,
        760
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.email}}",
        "subject": "=Bienvenido a {{ $json.empresaNombre }} — acceso a tu Portal",
        "text": "={{$json.data.mensaje}}\n\nIngresa en {{$env.NEXIT_BASE_URL}}/login con:\nUsuario: {{$json.data.email}}\nContraseña temporal: {{$json.data.passwordTemporal}}\n\nTe recomendamos cambiarla ni bien inicies sesión, desde tu Perfil."
      },
      "id": "email-contacto-creado",
      "name": "Email bienvenida contacto",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [
        1320,
        860
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.data.whatsapp}}",
              "rightValue": "",
              "operator": {
                "type": "string",
                "operation": "notEmpty"
              }
            }
          ]
        }
      },
      "id": "if-cliente-whatsapp-contacto-creado",
      "name": "IF contacto tiene WhatsApp",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1540,
        860
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.data.whatsapp}}",
        "message": "={{$json.data.mensaje}} Ingresa en {{$env.NEXIT_BASE_URL}}/login con tu correo ({{$json.data.email}}) y la contraseña temporal: {{$json.data.passwordTemporal}}"
      },
      "id": "twilio-contacto-creado",
      "name": "Twilio bienvenida contacto",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1760,
        860
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "chatId": "={{$env.NEXIT_TELEGRAM_CHAT_ID}}",
        "text": "=📵 Contacto no identificado por {{$json.data.canal}} ({{$json.data.identificador}}):\n\nNombre: {{$json.data.nombre}}\nEmpresa (reportada por él, sin confirmar): {{$json.data.empresaReportada}}\nTeléfono: {{$json.data.telefonoReportado}}\nCorreo: {{$json.data.correoReportado}}\nMotivo: {{$json.data.motivo}}\n\nNo hay ningún usuario de {{ $json.empresaNombre }} con ese chat/teléfono vinculado. Un representante debe confirmar a qué cliente pertenece y crear su ticket desde \"Crear ticket\" en {{ $json.empresaNombre }} (o desde /admin/contactos-pendientes)."
      },
      "id": "telegram-contacto-no-identificado",
      "name": "Telegram contacto no identificado",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1320,
        980
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "fieldToSplitOut": "data.staffWhatsapp",
        "options": {
          "destinationFieldName": "telefono"
        }
      },
      "id": "split-staff-whatsapp-contacto",
      "name": "Split staff WhatsApp",
      "type": "n8n-nodes-base.splitOut",
      "typeVersion": 1,
      "position": [
        1320,
        1080
      ]
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{$json.telefono}}",
        "message": "=📵 Contacto no identificado por {{$('Switch por evento').item.json.data.canal}}: {{$('Switch por evento').item.json.data.nombre}}, de \"{{$('Switch por evento').item.json.data.empresaReportada}}\" — Tel: {{$('Switch por evento').item.json.data.telefonoReportado}}, correo: {{$('Switch por evento').item.json.data.correoReportado}}. Motivo: {{$('Switch por evento').item.json.data.motivo}}. Contactalo y levantá el ticket en {{ $('Switch por evento').item.json.empresaNombre }}."
      },
      "id": "twilio-staff-contacto-no-identificado",
      "name": "Twilio aviso staff (contacto no identificado)",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1540,
        1080
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    }
  ],
  "connections": {
    "Webhook NexIT": {
      "main": [
        [
          {
            "node": "Verificar Bearer",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Respond 200": {
      "main": [
        [
          {
            "node": "Switch por evento",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por evento": {
      "main": [
        [
          {
            "node": "IF origen PORTAL",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "IF ESPERANDO_VALIDACION",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF CANCELADO",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Telegram alerta SLA",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "IF técnico tiene Telegram",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF técnico tiene WhatsApp",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF origen PORTAL (asignado)",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Email bienvenida contacto",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF contacto tiene WhatsApp",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Telegram contacto no identificado",
            "type": "main",
            "index": 0
          },
          {
            "node": "Split staff WhatsApp",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF origen PORTAL": {
      "main": [
        [
          {
            "node": "Email confirmacion ticket",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene Telegram (creado)",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene WhatsApp (creado)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene Telegram (creado)": {
      "main": [
        [
          {
            "node": "Telegram confirmacion ticket",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene WhatsApp (creado)": {
      "main": [
        [
          {
            "node": "Twilio confirmacion ticket",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF ESPERANDO_VALIDACION": {
      "main": [
        [
          {
            "node": "Email revisar y aprobar",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene Telegram (validacion)",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene WhatsApp (validacion)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene Telegram (validacion)": {
      "main": [
        [
          {
            "node": "Telegram revisar y aprobar",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene WhatsApp (validacion)": {
      "main": [
        [
          {
            "node": "Twilio revisar y aprobar",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF técnico tiene Telegram": {
      "main": [
        [
          {
            "node": "Telegram aviso asignacion",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF técnico tiene WhatsApp": {
      "main": [
        [
          {
            "node": "Twilio aviso asignacion",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF origen PORTAL (asignado)": {
      "main": [
        [
          {
            "node": "IF cliente tiene Telegram (asignado)",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene WhatsApp (asignado)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene Telegram (asignado)": {
      "main": [
        [
          {
            "node": "Telegram aviso asignacion (cliente)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene WhatsApp (asignado)": {
      "main": [
        [
          {
            "node": "Twilio aviso asignacion (cliente)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF CANCELADO": {
      "main": [
        [
          {
            "node": "Email aviso cancelacion",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene Telegram (cancelado)",
            "type": "main",
            "index": 0
          },
          {
            "node": "IF cliente tiene WhatsApp (cancelado)",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene Telegram (cancelado)": {
      "main": [
        [
          {
            "node": "Telegram aviso cancelacion",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF cliente tiene WhatsApp (cancelado)": {
      "main": [
        [
          {
            "node": "Twilio aviso cancelacion",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "IF contacto tiene WhatsApp": {
      "main": [
        [
          {
            "node": "Twilio bienvenida contacto",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "Parsear body": {
      "main": [
        [
          {
            "node": "Respond 200",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Verificar Bearer": {
      "main": [
        [
          {
            "node": "Parsear body",
            "type": "main",
            "index": 0
          }
        ],
        []
      ]
    },
    "Split staff WhatsApp": {
      "main": [
        [
          {
            "node": "Twilio aviso staff (contacto no identificado)",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### Workflow 2 — Cron de SLA

```json
{
  "name": "NexIT - Cron SLA",
  "nodes": [
    {
      "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] } },
      "id": "schedule-sla",
      "name": "Cada 15 min",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/cron/sla-check",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth"
      },
      "id": "http-sla-check",
      "name": "POST sla-check",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [220, 0],
      "credentials": { "httpHeaderAuth": { "id": "REEMPLAZAR", "name": "NexIT Webhook Secret" } }
    }
  ],
  "connections": {
    "Cada 15 min": { "main": [[{ "node": "POST sla-check", "type": "main", "index": 0 }]] }
  }
}
```

Crea la credencial **Header Auth** referenciada (`REEMPLAZAR`) con `Name: Authorization`,
`Value: Bearer <tu WEBHOOK_SECRET>` desde el panel de Credentials de n8n antes de
activar el workflow.

## 6. Asistente de IA conversacional por Telegram y WhatsApp (cliente)

**Reemplaza el diseño anterior de un solo turno** (mensaje → extraer → crear ticket
directo), que creaba un ticket vacío con solo un "Hola". Ahora es una conversación con
estado: la IA puede preguntar, sugerir una solución antes de escalar, y recién crear el
ticket cuando ya reunió información real — o cerrar sin ticket si el cliente dice que
se resolvió solo.

El estado de la conversación **vive en NexIT, no en n8n**: cada mensaje de Telegram/
WhatsApp dispara una ejecución de workflow separada y sin memoria propia entre sí — sin
persistir el historial en algún lado, la IA no tendría forma de "recordar" lo que el
cliente ya contó en el mensaje anterior.

### a) Flujo de una conversación típica

```
Cliente:   Hola
Asistente: Hola Juan! Contame, ¿qué problema tenés con algún equipo?          [PREGUNTAR]
Cliente:   El UPS de la sala de servidores está pitando
Asistente: Ya te generé un ticket para que un técnico lo revise (✅ #TCK-0006,
           prioridad alta). Mientras llega, podés revisar que haya corriente
           normal y que esté bien conectado, pero ya no tenés que hacer nada
           más — quedó en manos del técnico.                                 [CREAR_TICKET]
```

Si en el primer intercambio el cliente hubiera contestado "ah listo, ya se apagó solo",
la IA habría respondido `CERRAR_SIN_TICKET` y ahí termina, sin generar nada en
`/admin/tickets`.

> **Por qué el ticket se crea de inmediato, sin pedirle al cliente que pruebe nada
> primero:** el diseño anterior tenía un paso intermedio (`SUGERIR_SOLUCION`) que
> esperaba a que el cliente confirmara si una sugerencia simple (reiniciar, revisar
> corriente/cables) había funcionado antes de escalar. En la práctica, no todo contacto
> tiene el conocimiento o las facilidades para seguir ese tipo de procedimiento por
> chat — y ese paso solo demoraba que un técnico real se enterara. Ahora la sugerencia
> (si la hay) viaja como **dato informativo** en `ticket.sugerenciaIA`, guardado en el
> ticket para que el técnico llegue con contexto — nunca como una condición que bloquee
> o retrase la creación.

### b) Modelo de datos

`ConversacionChat` (una por cliente+canal, mientras esté `ACTIVA`) y
`MensajeConversacion` (cada turno, `rol` `USUARIO` o `ASISTENTE`). Una conversación
`ACTIVA` sin mensajes nuevos en más de 6 horas se da por abandonada — si el cliente
vuelve a escribir después, arranca una conversación nueva en vez de resucitar contexto
viejo. Al crear el ticket, la conversación pasa a `CONVERTIDA_A_TICKET` y queda
vinculada (`ticketId`) — puede usarse a futuro para mostrar la transcripción completa
en el detalle del ticket.

> **Identificación por correo + código** (`VerificacionIdentidadChat`): algunas cuentas
> de WhatsApp activan la privacidad de "nombre de usuario" de Meta — en ese caso Twilio
> ya no manda el teléfono real en `From`, sino un identificador opaco pero estable. Para
> esos casos (y para cualquiera que tenga cuenta en NexIT pero nunca haya pegado su
> chat id/teléfono en `/perfil`), `conversacion/mensaje` también prueba
> `Usuario.whatsappIdentificadorAlterno` antes de dar por no encontrado a alguien — ver
> `POST /api/n8n/vinculacion-identidad/mensaje` más abajo.

### c) Endpoints

Ambos protegidos con `WEBHOOK_SECRET`, igual que el resto de `/api/n8n/*`.

**`POST /api/n8n/conversacion/mensaje`** — body `{ canal, identificador, texto }`

Primer paso de cada mensaje entrante: resuelve el cliente, guarda `texto` como un
mensaje `USUARIO` (busca la conversación `ACTIVA` existente o crea una si no hay, o si
la que había quedó abandonada), y devuelve **todo el historial** + el contexto del
cliente (sucursales y sus activos, y sus sistemas de software — ver
`/admin/sistemas-software`) para que la IA decida con memoria real.

```json
// 200 — encontrado
{
  "encontrado": true,
  "empresaNombre": "NexIT Soporte Técnico",
  "conversacionId": "cmuluoqaj0001p40ujpv2csxe",
  "usuarioNombre": "Juan Pérez",
  "clienteNombre": "Constructora ABC S.A.",
  "sucursales": [{ "id": "...", "nombre": "Bodega Norte", "direccion": "...", "ciudad": "...", "activos": [{ "id": "...", "categoria": "UPS", "marca": "APC", "modelo": "Smart-UPS 3000VA" }] }],
  "sistemasSoftware": [{ "id": "...", "nombre": "ERP SAP Business One" }],
  "historial": [
    { "rol": "USUARIO", "contenido": "Hola" },
    { "rol": "ASISTENTE", "contenido": "Hola Juan! Contame, ¿qué problema tenés con algún equipo?" },
    { "rol": "USUARIO", "contenido": "El UPS de la sala de servidores está pitando" }
  ],
  "canal": "TELEGRAM",
  "identificador": "999888777"
}

// 200 — no vinculado a nadie
{ "encontrado": false, "motivo": "NO_ENCONTRADO", "texto": "Hola", "canal": "TELEGRAM", "identificador": "000000000" }

// 200 — vinculado, pero a una cuenta que no es CLIENTE
{
  "encontrado": false,
  "motivo": "ROL_INCORRECTO",
  "mensaje": "Tu cuenta en NexIT Soporte Técnico es de técnico, no de cliente — este canal es para reportar o seguir problemas como cliente. Si necesitás otra cosa, escribí al canal correspondiente a tu rol.",
  "texto": "hice check-in del TCK-0002",
  "canal": "WHATSAPP",
  "identificador": "+18095550001"
}
```

> **`motivo` distingue dos situaciones que antes eran indistinguibles y causaban un
> loop infinito real**: `"NO_ENCONTRADO"` (nadie con ese chat/teléfono — el workflow
> debe seguir con vinculación, como siempre) y `"ROL_INCORRECTO"` (SÍ hay un `Usuario`
> con ese canal, pero no es `CLIENTE` — ej. un técnico o un admin escribiéndole a este
> bot). En el segundo caso **el workflow NO debe llamar a
> `vinculacion-identidad/mensaje`**: reintentar la vinculación nunca le va a cambiar el
> rol a esa persona, así que solo repetiría la pregunta del correo para siempre (es
> justo el bug que se corrigió — ver §6.e, nodo "IF rol incorrecto"). Cuando es
> `ROL_INCORRECTO`, la respuesta ya trae `mensaje` listo para mostrar tal cual; cuando
> es `NO_ENCONTRADO` no se arma mensaje — ahí sigue el flujo de siempre.
>
> **Cuando `motivo` es `NO_ENCONTRADO`**, no hay forma segura de saber a qué
> cliente/sede pertenece quien escribe — listarle todos los clientes de NexIT para que
> elija sería un problema de confusión (y de privacidad entre clientes distintos). Este
> endpoint ya NO le responde nada al contacto directamente ni dispara ningún evento por
> su cuenta — el workflow de n8n debe, en esa rama, llamar a
> **`POST /api/n8n/contacto-pendiente/mensaje`** (mismo body `{ canal, identificador,
> texto }`, mismo `WEBHOOK_SECRET`) para seguir el flujo de recolección de datos.
> `texto` viaja de vuelta en la respuesta (mismo motivo que en `contextoTecnicoSchema`):
> esa siguiente llamada ya no tiene el mensaje original disponible porque esta misma
> llamada pisó `$json`.

**`POST /api/n8n/contacto-pendiente/mensaje`** — body `{ canal, identificador, texto }`

Arranca (o continúa) una recolección de 5 datos básicos, un campo a la vez, sin
intervención de IA — el orden es fijo (`nombre` → `empresaReportada` →
`telefonoReportado` → `correoReportado` → `motivo`), así que "el primer campo vacío" es
siempre inequívocamente "lo que se acaba de preguntar".

```json
// 200 — primera vez que escribe esta persona (crea el ContactoPendiente)
{ "mensaje": "No encontramos tu número vinculado a NexIT. Para que un representante te pueda contactar, necesitamos algunos datos.\n\n¿Cuál es tu nombre?", "canal": "WHATSAPP", "identificador": "+18095551234" }

// 200 — respondiendo un campo intermedio
{ "mensaje": "¿A qué número de teléfono te podemos contactar?", "canal": "WHATSAPP", "identificador": "+18095551234" }

// 200 — los 5 campos ya están completos (dispara CONTACTO_NO_IDENTIFICADO)
{ "mensaje": "¡Gracias! Ya registramos tus datos. En breve un representante de nuestro equipo te va a contactar.", "canal": "WHATSAPP", "identificador": "+18095551234" }
```

`telefonoReportado` y `correoReportado` tienen una validación mínima (teléfono con 7+
dígitos, correo con forma `algo@algo.algo`) — si no pasa, responde pidiendo lo mismo de
nuevo en vez de avanzar, sin guardar el valor inválido. Si la persona ya completó sus 5
datos (`estado: "PENDIENTE"`) o ya se le creó un ticket (`estado: "CONVERTIDO"`),
este endpoint no vuelve a preguntar nada — responde con un mensaje de "ya te vamos a
contactar" (o el número de ticket, si ya existe).

**`POST /api/n8n/conversacion/turno`** — body `{ conversacionId, accion, mensajeAsistente, ticket? }`

Persiste la respuesta de la IA (`mensajeAsistente`) como un mensaje `ASISTENTE`, y según
`accion`:

- `PREGUNTAR` — no hace nada más; la conversación sigue `ACTIVA`.
- `CERRAR_SIN_TICKET` — marca la conversación `RESUELTA_SIN_TICKET`.
- `CREAR_TICKET` — requiere `ticket: { titulo, descripcion, prioridad, sucursalId?, activoId?, sistemaSoftwareId?, sistemaNoCatalogado?, tipo?, categoriaSoporte?, sugerenciaIA? }` (el schema lo exige con `.refine()` solo para esta acción). `sistemaSoftwareId` se valida contra el cliente de la conversación igual que `activoId` contra la sucursal (error `SISTEMA_INVALIDO` si no corresponde). Crea el ticket (`origen: "CHATBOT"`), antepone `[Sistema: ...]` a la descripción cuando viene `sistemaNoCatalogado` (mismo patrón que el wizard web para equipos no catalogados), guarda `sugerenciaIA` tal cual la mandó el modelo (o `null` si no aplicó ninguna), vincula la conversación (`CONVERTIDA_A_TICKET`), y dispara `TICKET_CREADO`. Mismo manejo de `SUCURSAL_AMBIGUA` que el flujo anterior si el cliente tiene más de una sede y la IA no mandó `sucursalId`.

```json
// 200 — CREAR_TICKET exitoso
{
  "ok": true,
  "ticketId": "...",
  "numeroTicket": "TCK-0006",
  "mensaje": "Ya te generé un ticket para que un técnico lo revise.\n\n✅ Ticket #TCK-0006 creado (prioridad alta). Te avisaremos cuando un técnico lo atienda.",
  "canal": "TELEGRAM",
  "identificador": "999888777"
}
```

Notá que `mensaje` en la respuesta es `mensajeAsistente` + un sufijo de confirmación que
arma NexIT (nunca la IA) — así el número de ticket que se le muestra al cliente es
siempre el real, nunca algo que el modelo podría llegar a inventar.

> `sugerenciaIA` no viaja en esta respuesta ni en el evento `TICKET_CREADO` — vive solo
> en la fila del ticket, y solo se muestra en `/tickets/[id]` y en el wizard de
> ejecución del técnico (nunca en `/portal`, para que el cliente no la confunda con un
> diagnóstico oficial).

**`POST /api/n8n/vinculacion-identidad/mensaje`** — body `{ canal, identificador, texto }`

Se llama **solo** cuando `conversacion/mensaje` (o `tecnico/contexto`, ver §7) respondió
`encontrado: false` / `autorizado: false`. Es una máquina de estados determinística (sin
IA), igual de espíritu que `contacto-pendiente/mensaje`:

1. Sin intento en curso → pregunta el correo registrado en NexIT (10 minutos de validez
   para todo el intercambio).
2. Ese mensaje es la respuesta de correo → si no pertenece a ningún `Usuario` activo,
   responde `continuar: true` de inmediato (sin insistir) — **ahí el workflow debe
   seguir con `contacto-pendiente/mensaje`** (mismo `canal`/`identificador`/`texto`), o
   con el mensaje original de "no autorizado" en el caso de técnico. Si sí pertenece a
   alguien, genera un código de 6 dígitos, lo manda por **correo real** (nunca por
   Telegram/WhatsApp — canal de verificación independiente del canal a vincular) y pide
   que lo escriba.
3. Ese mensaje es el código → si coincide, vincula el identificador de ese canal al
   `Usuario` (`telegramChatId` o `whatsappIdentificadorAlterno` según corresponda) y
   responde `continuar: false` con un mensaje de éxito. Si no coincide, reintento (3
   máximo); si vence o se agotan los intentos, hay que volver a escribir el correo.

```json
// 200 — pidiendo correo (primer mensaje de este intento)
{ "continuar": false, "mensaje": "Antes de continuar, decime el correo con el que tenés cuenta en NexIT (si no tenés, no te preocupes, seguimos igual).", "canal": "WHATSAPP", "identificador": "DO.1123794910004499", "texto": "Hola" }

// 200 — correo no pertenece a nadie: el workflow debe seguir con contacto-pendiente/mensaje
{ "continuar": true, "mensaje": "", "canal": "WHATSAPP", "identificador": "DO.1123794910004499", "texto": "no.soy.nadie@ejemplo.com" }

// 200 — vinculado con éxito
{ "continuar": false, "mensaje": "¡Listo! Ya vinculamos tu cuenta. Contame qué necesitás.", "canal": "WHATSAPP", "identificador": "DO.1123794910004499", "texto": "482913" }
```

`continuar` es la única señal que le importa a n8n — `true` encadena con
`contacto-pendiente/mensaje` (o, en el flujo de técnico, muestra de nuevo el mensaje
original de "no encontramos tu número"); `false` responde `mensaje` tal cual y termina
el turno, sin tocar ningún otro endpoint.

### d) El prompt: preguntar, y crear el ticket sin retrasarlo

El nodo "IA: decidir siguiente paso" le manda al modelo el historial completo + las
sucursales/activos del cliente + sus sistemas de software, y le exige devolver un JSON
con `accion` + `mensaje` + `ticket` (null salvo que `accion = CREAR_TICKET`). Las reglas
clave del prompt:

1. Un saludo o mensaje sin detalle técnico → `PREGUNTAR`, nunca crear ticket todavía.
2. En cuanto hay un problema concreto (equipo o sistema + síntoma) → `CREAR_TICKET` de
   inmediato. Si existe una sugerencia breve y segura (reiniciar, revisar
   corriente/cables), va en `ticket.sugerenciaIA` como dato informativo para el técnico
   — nunca como excusa para retrasar la creación ni como paso que el cliente tiene que
   confirmar antes.
3. Cliente dice que ya se resolvió solo (antes de llegar al punto 2) → `CERRAR_SIN_TICKET`.

**Equipo vs Sistema** (mismo criterio que el wizard web en `/tickets/nuevo` y
`/portal/tickets/nuevo`): el prompt le pide al modelo clasificar el problema sin
preguntárselo explícitamente al cliente —

- Equipo físico de la lista de activos → `categoriaSoporte: "HARDWARE"` (el equipo
  falló) o `"INFRAESTRUCTURA"` (red/cableado), con `activoId` si lo identifica.
- Un sistema de la lista `sistemasSoftware` del cliente → `categoriaSoporte:
  "SOFTWARE_TERCEROS"` + `sistemaSoftwareId`.
- "El sistema operativo", "Windows", "Office", etc. (genérico, no es un activo ni un
  sistema del catálogo) → `categoriaSoporte: "SOFTWARE_SISTEMA"` + una nota breve en
  `sistemaNoCatalogado`.
- Ambiguo o no reconocido → `categoriaSoporte: "SOFTWARE"` (catch-all), igual que el
  wizard web para el caso "no sé cuál es". `activoId` y `sistemaSoftwareId` nunca van
  los dos a la vez.

Ajustá este prompt libremente según el tipo de fallas más comunes de tus clientes —
está pensado como punto de partida, no como texto final.

### e) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ POST conversacion/mensaje → IF encontrado
Webhook WhatsApp (Twilio) ──→ Normalizar WhatsApp ─┘                         ├─ false → IF rol incorrecto (motivo == "ROL_INCORRECTO")
                                                                             │            ├─ true  → Switch por canal → responder
                                                                             │            └─ false → POST vinculación identidad → IF continuar
                                                                             │                         ├─ true  → POST contacto-pendiente/mensaje
                                                                             │                         │            → Switch por canal → responder
                                                                             │                         └─ false → Switch por canal → responder
                                                                             └─ true  → IA: decidir siguiente paso
                                                                                          → POST conversacion/turno
                                                                                          → Switch por canal → responder
```

### f) Prerrequisitos

Los mismos de siempre: bot de Telegram (`@BotFather`), cuenta de Twilio con WhatsApp
Sandbox, y una API key de IA (OpenAI u otro proveedor de chat compatible — ajustá la
URL/body del nodo Code si usás otro).

### g) JSON importable

[`n8n-workflows/3-asistente-ia-telegram-whatsapp.json`](./n8n-workflows/3-asistente-ia-telegram-whatsapp.json)

```json
{
  "name": "NexIT - Asistente IA conversacional (Telegram/WhatsApp)",
  "nodes": [
    {
      "parameters": {
        "updates": [
          "message"
        ]
      },
      "id": "telegram-trigger-cliente",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [
        0,
        -160
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "nexit-cliente-whatsapp-in",
        "responseMode": "onReceived"
      },
      "id": "webhook-whatsapp-cliente",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [
        0,
        160
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "TELEGRAM",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.message.chat.id }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.message.text }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-telegram-cliente",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        -160
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "WHATSAPP",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.body.From.replace('whatsapp:', '') }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.body.Body }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-whatsapp-cliente",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        160
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/conversacion/mensaje",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, texto: $json.texto }) }}"
      },
      "id": "guardar-mensaje-cliente",
      "name": "Guardar mensaje",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.encontrado}}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true"
              }
            }
          ]
        }
      },
      "id": "if-encontrado-cliente",
      "name": "IF encontrado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        660,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $json;\nconst openaiKey = $env.OPENAI_API_KEY;\n\nconst historialTexto = contexto.historial.map((m) => `${m.rol === 'USUARIO' ? 'Cliente' : 'Asistente'}: ${m.contenido}`).join('\\n');\n\nconst prompt = `Sos el asistente de soporte tecnico de ${contexto.empresaNombre}, atendiendo por chat a ${contexto.usuarioNombre} de ${contexto.clienteNombre}.\n\nSucursales y equipos (activos) de este cliente:\n${JSON.stringify(contexto.sucursales)}\n\nSistemas de software/terceros que este cliente tiene registrado (ademas de \"sistema operativo\" y \"suite de oficina\", que son opciones genericas validas para cualquier cliente aunque no aparezcan en esta lista):\n${JSON.stringify(contexto.sistemasSoftware)}\n\nHistorial completo de la conversacion (el ultimo mensaje es el mas reciente):\n${historialTexto}\n\nTu trabajo, en este orden:\n1. Si el ultimo mensaje del cliente es un saludo o no tiene detalle tecnico (\"hola\", \"tengo un problema\"), NO crees un ticket todavia - respondé con una pregunta concreta para entender que pasa (que equipo o sistema, que sintoma exacto, desde cuando).\n2. En cuanto tengas un problema concreto, crea el ticket DE INMEDIATO - no le pidas al cliente que pruebe nada primero ni esperes que confirme si funciono. Muchos contactos no tienen el conocimiento ni las facilidades para seguir un procedimiento tecnico por chat, y hacerlo esperar solo demora que un tecnico real se entere. Si conoces una sugerencia breve y segura para que intente mientras el tecnico llega (reiniciar el equipo, revisar corriente/cables), incluila en ticket.sugerenciaIA como dato informativo para el tecnico - nunca la uses como excusa para retrasar el ticket, y en tu mensaje al cliente aclara que igual ya se genero el ticket. Prioriza ALTA o CRITICA para fallas totales/de seguridad, MEDIA para el resto.\n3. Si el cliente dice que ya se soluciono solo (antes de llegar al punto 2), cerra la conversacion sin ticket.\n\nDecidi si el problema es de un EQUIPO fisico o de un SISTEMA, y completa ticket.categoriaSoporte segun corresponda - nunca pidas esta clasificacion explicitamente al cliente, inferila de lo que describe:\n- Equipo fisico (UPS, switch, PC, impresora, etc.) -> categoriaSoporte \"HARDWARE\" (el equipo en si fallo) o \"INFRAESTRUCTURA\" (problema de red/cableado), y completa activoId si identificas cual de la lista de activos es (o null si no esta claro).\n- El cliente menciona un sistema de la lista de sistemas de software -> categoriaSoporte \"SOFTWARE_TERCEROS\" y completa sistemaSoftwareId con el id de ese sistema.\n- El cliente dice \"el sistema operativo\", \"Windows\", \"el servidor no actualiza\", \"Office\", \"Excel\", etc. (no es un sistema de la lista ni un equipo fisico) -> categoriaSoporte \"SOFTWARE_SISTEMA\" y describi brevemente cual en sistemaNoCatalogado (ej. \"Sistema operativo\", \"Suite de oficina\").\n- No queda claro si es equipo o sistema, o es un sistema que no reconoces y no es ninguno de los anteriores -> categoriaSoporte \"SOFTWARE\" y, si aplica, describi lo que el cliente dijo en sistemaNoCatalogado.\nactivoId y sistemaSoftwareId nunca van los dos a la vez en el mismo ticket.\n\nNunca inventes datos que el cliente no dio - si falta el nombre de la sede y el cliente tiene mas de una, deja sucursalId en null (el sistema le va a preguntar directamente cual es).\n\nDevolve SOLO un JSON con esta forma exacta:\n{\n  \"accion\": \"PREGUNTAR\" o \"CREAR_TICKET\" o \"CERRAR_SIN_TICKET\",\n  \"mensaje\": \"el texto que le vas a responder al cliente, en español, tono cordial y breve - si accion=CREAR_TICKET, mencionale que ya se genero el ticket, nunca le pidas que pruebe algo antes\",\n  \"ticket\": null o { \"titulo\": \"...\", \"descripcion\": \"...\", \"prioridad\": \"CRITICA\" o \"ALTA\" o \"MEDIA\" o \"BAJA\", \"sucursalId\": \"...\" o null, \"categoriaSoporte\": \"HARDWARE\" o \"INFRAESTRUCTURA\" o \"SOFTWARE_TERCEROS\" o \"SOFTWARE_SISTEMA\" o \"SOFTWARE\", \"activoId\": \"...\" o null, \"sistemaSoftwareId\": \"...\" o null, \"sistemaNoCatalogado\": \"...\" o null, \"sugerenciaIA\": \"...\" o null }\n}`;\n\nconst respuesta = await this.helpers.httpRequest({\n  method: 'POST',\n  url: 'https://api.openai.com/v1/chat/completions',\n  headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n  body: { model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt }] },\n  json: true,\n});\n\nconst ai = JSON.parse(respuesta.choices[0].message.content);\n\nreturn [{ json: {\n  conversacionId: contexto.conversacionId,\n  canal: contexto.canal,\n  identificador: contexto.identificador,\n  accion: ai.accion,\n  mensajeAsistente: ai.mensaje,\n  ticket: ai.ticket && ai.ticket.titulo ? ai.ticket : undefined,\n} }];"
      },
      "id": "ia-decidir-paso",
      "name": "IA: decidir siguiente paso",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        880,
        -100
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/conversacion/turno",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ conversacionId: $json.conversacionId, accion: $json.accion, mensajeAsistente: $json.mensajeAsistente, ticket: $json.ticket }) }}"
      },
      "id": "guardar-turno-cliente",
      "name": "Guardar turno",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1100,
        -100
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "TELEGRAM",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "WHATSAPP",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "id": "switch-canal-cliente",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        1320,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.identificador }}",
        "text": "={{ $json.mensaje }}"
      },
      "id": "telegram-responder-cliente",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1540,
        -100
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{ $json.identificador }}",
        "message": "={{ $json.mensaje }}"
      },
      "id": "twilio-responder-cliente",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1540,
        100
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/contacto-pendiente/mensaje",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, texto: $json.texto }) }}"
      },
      "id": "post-contacto-pendiente-cliente",
      "name": "POST contacto-pendiente",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1320,
        220
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/vinculacion-identidad/mensaje",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, texto: $json.texto }) }}"
      },
      "id": "post-vinculacion-identidad-cliente",
      "name": "POST vinculación identidad",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        880,
        160
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.continuar}}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true"
              }
            }
          ]
        }
      },
      "id": "if-vinculacion-continuar-cliente",
      "name": "IF vinculación — continuar a contacto pendiente",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1080,
        160
      ]
    }
  ],
  "connections": {
    "Telegram Trigger": {
      "main": [
        [
          {
            "node": "Normalizar Telegram",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Webhook WhatsApp (Twilio)": {
      "main": [
        [
          {
            "node": "Normalizar WhatsApp",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar Telegram": {
      "main": [
        [
          {
            "node": "Guardar mensaje",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar WhatsApp": {
      "main": [
        [
          {
            "node": "Guardar mensaje",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Guardar mensaje": {
      "main": [
        [
          {
            "node": "IF encontrado",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF encontrado": {
      "main": [
        [
          {
            "node": "IA: decidir siguiente paso",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "POST vinculación identidad",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IA: decidir siguiente paso": {
      "main": [
        [
          {
            "node": "Guardar turno",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Guardar turno": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por canal": {
      "main": [
        [
          {
            "node": "Telegram - Responder",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Twilio - Responder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST contacto-pendiente": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST vinculación identidad": {
      "main": [
        [
          {
            "node": "IF vinculación — continuar a contacto pendiente",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF vinculación — continuar a contacto pendiente": {
      "main": [
        [
          {
            "node": "POST contacto-pendiente",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 7. Técnico: seguimiento de tickets por chat

Un técnico puede, desde Telegram o WhatsApp: ver sus tickets asignados activos, hacer
check-in (equivalente a "iniciar atención" en el wizard), mandar una foto (se guarda
como evidencia) y dejar una nota. **A propósito, esto NO reemplaza el wizard de
ejecución**: el checklist ítem por ítem, la firma del cliente y el cierre de la visita
siguen haciéndose en la app — la firma en particular es del *cliente*, en el
dispositivo del técnico, no algo que se pueda capturar por chat.

### a) Endpoints

Los 4 protegidos con `WEBHOOK_SECRET`, igual que el resto de `/api/n8n/*`.

**`GET /api/n8n/tecnico/contexto?canal=&identificador=&texto=&tieneFoto=&fileId=&mediaUrl=`**

Resuelve la identidad a un `Usuario` con rol `TECNICO` y devuelve sus tickets activos
(no `RESUELTO`/`CERRADO`/`CANCELADO`). Prueba `whatsappTelefono`/`telegramChatId` y,
para WhatsApp, también `whatsappIdentificadorAlterno` (ver §6.b — mismo mecanismo de
privacidad de Meta que afecta al flujo de clientes). `texto`/`tieneFoto`/`fileId`/
`mediaUrl` son puro passthrough — el endpoint no los usa, solo los hace viajar de
vuelta para que el paso de IA los tenga disponibles después de esta llamada (mismo
motivo que `texto` en `contexto-cliente`: un HTTP Request de n8n reemplaza `$json` con
la respuesta).

Si `autorizado: false`, el campo `motivo` dice por qué: `"ROL_INCORRECTO"` (hay un
`Usuario` con ese chat/teléfono, pero no es `TECNICO` — ej. un Admin/Coordinador
escribiéndole a este bot) o `"NO_ENCONTRADO"` (nadie con ese canal vinculado). **Solo
en `NO_ENCONTRADO`** el workflow debe llamar a
**`POST /api/n8n/vinculacion-identidad/mensaje`** (mismo endpoint que usa el flujo de
clientes, ver §6.c) antes de rendirse — si esa llamada responde `continuar: true`
(el correo que dio no es de nadie), recién ahí se muestra el `mensaje` original de
"no encontramos tu número". A diferencia del flujo de clientes, acá no hay
`contacto-pendiente` de respaldo — un técnico no se "da de alta" por chat.

> **En `ROL_INCORRECTO` el workflow NO debe llamar a vinculación** — ese era
> exactamente el bug real reportado: un Admin probando este flujo quedaba en loop
> infinito (la vinculación "funciona" porque su correo existe, pero el chequeo de rol
> de abajo nunca va a pasar, y al no quedar registro de que ya se intentó, cada
> mensaje siguiente volvía a pedir el correo desde cero). `mensaje` ya viene listo
> para mostrar tal cual en este caso — ver §7.c, nodo "IF rol incorrecto".

```json
// 200 — autorizado
{
  "autorizado": true,
  "usuarioNombre": "María Gómez",
  "tickets": [
    { "numeroTicket": "TCK-0002", "titulo": "Switch de piso 3 no responde", "clienteNombre": "Hospital San Rafael", "sucursalNombre": "Sede Central", "estado": "EN_EJECUCION", "prioridad": "CRITICA" }
  ],
  "canal": "TELEGRAM",
  "identificador": "555000111",
  "texto": "...",
  "tieneFoto": "false",
  "fileId": "",
  "mediaUrl": ""
}

// 200 — rol incorrecto (ej. un Admin probando este canal)
{
  "autorizado": false,
  "motivo": "ROL_INCORRECTO",
  "mensaje": "Tu cuenta en NexIT Soporte Técnico es de admin, no de técnico — este canal es solo para seguimiento de tickets asignados a técnicos. Si necesitás otra cosa, escribí al canal correspondiente a tu rol.",
  "canal": "WHATSAPP",
  "identificador": "+18095550099",
  "texto": "hice check-in del TCK-0002",
  "tieneFoto": "false",
  "fileId": "",
  "mediaUrl": ""
}
```

**`POST /api/n8n/tecnico/checkin`** — body `{ canal, identificador, numeroTicket }`

Equivalente por chat de `iniciarAtencion()`: pasa el ticket de `ASIGNADO` a
`EN_DIAGNOSTICO`. Verifica `ticket.tecnicoAsignadoId === usuario.id` (el mismo
candado de seguridad que exige `CLAUDE.md` para cualquier acción sobre un ticket
asignado) y que el ticket esté en `ASIGNADO` — si ya avanzó, devuelve un aviso en vez
de repetir la transición.

**`POST /api/n8n/tecnico/nota`** — body `{ canal, identificador, numeroTicket, comentario }`

Agrega una entrada a `TicketHistorial` sin cambiar el estado (mismo patrón que
`agregarComentarioTicket` del portal) — queda intercalada cronológicamente con los
cambios de estado reales.

**`POST /api/n8n/tecnico/evidencia`** — body `{ canal, identificador, numeroTicket, imagenBase64, contentType }`

`imagenBase64` sin el prefijo `data:image/...;base64,`. Clasifica automáticamente
`FOTO_ANTES` (si el ticket todavía no tiene ninguna) o `FOTO_DESPUES` (si ya tiene) —
una foto de chat no trae ese dato explícito como sí lo hace el wizard paso a paso.

Las 3 acciones (`checkin`/`nota`/`evidencia`) devuelven siempre `{ ok, mensaje, canal,
identificador }` (y `error` cuando `ok: false`) — mismo contrato que
`crear-ticket-chat`.

### b) Prerrequisitos

Los mismos del §6 (bot de Telegram, cuenta de Twilio con WhatsApp Sandbox, API key de
IA). Si vas a usar un bot/número **separado** del de clientes, no hay nada más que
hacer. Si en cambio querés que cliente/técnico/staff compartan **un solo** bot/número,
no actives el `Telegram Trigger`/`Webhook` propios de este workflow — un mismo bot
solo puede tener un webhook activo a la vez, así que activar los dos a la vez hace que
uno le pise el webhook al otro silenciosamente. Para ese caso, ver §10.

### c) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ GET tecnico/contexto → IF autorizado
Webhook WhatsApp (onReceived) ──→ Normalizar WhatsApp ─┘                 ├─ false → IF rol incorrecto (motivo == "ROL_INCORRECTO")
                                                                          │            ├─ true  → Switch por canal → responder
                                                                          │            └─ false → Guardar mensaje original (mensajeOriginal = mensaje)
                                                                          │                         → POST vinculación identidad ─┐
                                                                          │                                                        ├→ Combinar mensaje original y vinculación → IF continuar
                                                                          │                         Guardar mensaje original ──────┘                                          ├─ true  → Restaurar mensaje no autorizado (mensaje = mensajeOriginal)
                                                                          │                                                                                                   │            → Switch por canal → responder
                                                                          │                                                                                                   └─ false → Switch por canal → responder
                                                                          └─ true  → IA: interpretar mensaje
                                                                                       (clasifica intención, suma `tickets` a la salida, y si
                                                                                       tieneFoto=true, descarga y
                                                                                       codifica la imagen en el
                                                                                       mismo paso)
                                                                                    → Switch por intención
                                                                                       ├─ LISTAR    → responde con los tickets
                                                                                       ├─ CHECKIN   → POST checkin
                                                                                       ├─ NOTA      → POST nota
                                                                                       ├─ EVIDENCIA → POST evidencia
                                                                                       └─ (default) → "no entendí"
                                                                                    → Switch por canal → responder
```

> **Por qué "Guardar mensaje original" + "Combinar..." en vez de `$('Contexto técnico')`
> directo**: ese por-nombre funcionaba perfecto mientras el workflow solo se ejecutaba
> desde su propio Trigger — pero al poder invocarse también como sub-workflow (desde el
> router de §10, vía `Execute Workflow Trigger`), esa referencia dejó de resolverse
> (`Error: Referenced node doesn't exist`, visto en producción). El Merge evita
> depender del nombre del nodo: el dato que hace falta viaja explícito por la conexión
> en vez de "ir a buscarlo" a un nodo arbitrario de la ejecución. Mismo motivo por el
> que "IA: interpretar mensaje" ahora reenvía `tickets` en su propia salida, en vez de
> que "Formatear lista de tickets"/"Mensaje: no entendido" lo fueran a buscar con
> `$('Contexto técnico')`.

El nodo "IA: interpretar mensaje" consolida en un solo Code node la descarga de la
imagen (si corresponde) y la llamada a IA — evita separar en varios nodos HTTP Request
por canal solo para bajar un archivo, usando `this.helpers.httpRequest` (disponible
dentro de un Code node de n8n).

### d) JSON importable

[`n8n-workflows/4-tecnico-seguimiento-tickets.json`](./n8n-workflows/4-tecnico-seguimiento-tickets.json)

```json
{
  "name": "NexIT - Técnico seguimiento de tickets",
  "nodes": [
    {
      "parameters": {
        "updates": [
          "message"
        ]
      },
      "id": "telegram-trigger-tecnico",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [
        0,
        -160
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "nexit-tecnico-whatsapp-in",
        "responseMode": "onReceived"
      },
      "id": "webhook-whatsapp-tecnico",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [
        0,
        160
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "TELEGRAM",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.message.chat.id }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.message.text || $json.message.caption || '' }}",
              "type": "string"
            },
            {
              "id": "4",
              "name": "tieneFoto",
              "value": "={{ $json.message.photo ? 'true' : 'false' }}",
              "type": "string"
            },
            {
              "id": "5",
              "name": "fileId",
              "value": "={{ $json.message.photo ? $json.message.photo[$json.message.photo.length - 1].file_id : '' }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-telegram-tecnico",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        -160
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "WHATSAPP",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.body.From.replace('whatsapp:', '') }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.body.Body || '' }}",
              "type": "string"
            },
            {
              "id": "4",
              "name": "tieneFoto",
              "value": "={{ $json.body.NumMedia && $json.body.NumMedia !== '0' ? 'true' : 'false' }}",
              "type": "string"
            },
            {
              "id": "5",
              "name": "mediaUrl",
              "value": "={{ $json.body.MediaUrl0 || '' }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-whatsapp-tecnico",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        160
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/contexto",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "canal",
              "value": "={{ $json.canal }}"
            },
            {
              "name": "identificador",
              "value": "={{ $json.identificador }}"
            },
            {
              "name": "texto",
              "value": "={{ $json.texto }}"
            },
            {
              "name": "tieneFoto",
              "value": "={{ $json.tieneFoto }}"
            },
            {
              "name": "fileId",
              "value": "={{ $json.fileId || '' }}"
            },
            {
              "name": "mediaUrl",
              "value": "={{ $json.mediaUrl || '' }}"
            }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        }
      },
      "id": "contexto-tecnico",
      "name": "Contexto técnico",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.autorizado}}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true"
              }
            }
          ]
        }
      },
      "id": "if-autorizado-tecnico",
      "name": "IF autorizado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        660,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $json;\nconst openaiKey = $env.OPENAI_API_KEY;\n\nlet imagenBase64 = null;\nconst contentType = 'image/jpeg';\n\nif (contexto.tieneFoto === 'true') {\n  if (contexto.canal === 'TELEGRAM') {\n    const token = $env.TELEGRAM_BOT_TOKEN;\n    const fileInfo = await this.helpers.httpRequest({ url: `https://api.telegram.org/bot${token}/getFile?file_id=${contexto.fileId}`, json: true });\n    const filePath = fileInfo.result.file_path;\n    const bytes = await this.helpers.httpRequest({ url: `https://api.telegram.org/file/bot${token}/${filePath}`, encoding: 'arraybuffer' });\n    imagenBase64 = Buffer.from(bytes).toString('base64');\n  } else {\n    const bytes = await this.helpers.httpRequest({\n      url: contexto.mediaUrl,\n      encoding: 'arraybuffer',\n      auth: { username: $env.TWILIO_ACCOUNT_SID, password: $env.TWILIO_AUTH_TOKEN },\n    });\n    imagenBase64 = Buffer.from(bytes).toString('base64');\n  }\n}\n\nconst prompt = `Sos un asistente para tecnicos de soporte que siguen sus tickets por chat.\nTickets asignados activos:\n${JSON.stringify(contexto.tickets)}\n\nMensaje del tecnico: \"${contexto.texto}\"\nTrae una foto adjunta?: ${contexto.tieneFoto === 'true' ? 'si' : 'no'}\n\nDevolve SOLO un JSON con esta forma:\n{\n  \"intencion\": \"LISTAR\" o \"CHECKIN\" o \"NOTA\" o \"EVIDENCIA\" o \"ERROR\",\n  \"numeroTicket\": \"TCK-0001\" o null,\n  \"comentario\": \"texto de la nota, solo si intencion=NOTA\"\n}\n\nReglas:\n- Si trae foto adjunta, intencion SIEMPRE es EVIDENCIA. Si el tecnico tiene un solo ticket activo usa ese numeroTicket aunque no lo haya escrito. Si tiene mas de uno, buscá el numero en el texto/caption; si no aparece, intencion=ERROR.\n- Si pregunta por sus tickets o dice algo como \"que tengo pendiente\", intencion=LISTAR.\n- Si dice que llego, que esta en sitio, que empieza a revisar, intencion=CHECKIN con el numeroTicket que mencione (o el unico ticket ASIGNADO si solo tiene uno).\n- Cualquier otro comentario sobre un ticket es intencion=NOTA.\n- Si no podes determinar de que ticket habla y hay mas de uno activo, intencion=ERROR.`;\n\nconst respuesta = await this.helpers.httpRequest({\n  method: 'POST',\n  url: 'https://api.openai.com/v1/chat/completions',\n  headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n  body: { model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt }] },\n  json: true,\n});\n\nconst ai = JSON.parse(respuesta.choices[0].message.content);\n\nreturn [{ json: {\n  canal: contexto.canal,\n  identificador: contexto.identificador,\n  intencion: ai.intencion,\n  numeroTicket: ai.numeroTicket || null,\n  comentario: ai.comentario || null,\n  imagenBase64,\n  contentType,\n} }];"
      },
      "id": "ia-interpretar-tecnico",
      "name": "IA: interpretar mensaje",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        880,
        -100
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.intencion}}",
                    "rightValue": "LISTAR",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.intencion}}",
                    "rightValue": "CHECKIN",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.intencion}}",
                    "rightValue": "NOTA",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.intencion}}",
                    "rightValue": "EVIDENCIA",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        },
        "fallbackOutput": "extra"
      },
      "id": "switch-intencion",
      "name": "Switch por intención",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        1100,
        -100
      ]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $('Contexto técnico').item.json;\nconst lineas = contexto.tickets.map((t) => `#${t.numeroTicket} - ${t.titulo} (${t.clienteNombre}, ${t.prioridad}, ${t.estado})`).join('\\n');\nreturn [{ json: {\n  canal: $json.canal,\n  identificador: $json.identificador,\n  mensaje: contexto.tickets.length ? `Tus tickets activos:\\n${lineas}` : 'No tenés tickets activos asignados.',\n} }];"
      },
      "id": "formatear-lista-tickets",
      "name": "Formatear lista de tickets",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1320,
        -280
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/checkin",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket }) }}"
      },
      "id": "post-checkin",
      "name": "POST check-in",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1320,
        -100
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/nota",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket, comentario: $json.comentario }) }}"
      },
      "id": "post-nota",
      "name": "POST nota",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1320,
        60
      ]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/evidencia",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket, imagenBase64: $json.imagenBase64, contentType: $json.contentType }) }}"
      },
      "id": "post-evidencia",
      "name": "POST evidencia",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        1320,
        220
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "={{ $json.canal }}",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.identificador }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "mensaje",
              "value": "={{ $('Contexto técnico').item.json.tickets.length > 1 ? 'No entendí a qué ticket te referís. Decime el número (ej. TCK-0001).' : 'No entendí tu mensaje. Contame qué necesitás sobre tu ticket.' }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "mensaje-error-tecnico",
      "name": "Mensaje: no entendido",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        1320,
        380
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "TELEGRAM",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "WHATSAPP",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "id": "switch-canal-tecnico",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        1560,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.identificador }}",
        "text": "={{ $json.mensaje }}"
      },
      "id": "telegram-responder-tecnico",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1780,
        -100
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{ $json.identificador }}",
        "message": "={{ $json.mensaje }}"
      },
      "id": "twilio-responder-tecnico",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1780,
        100
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/vinculacion-identidad/mensaje",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, texto: $json.texto }) }}"
      },
      "id": "post-vinculacion-identidad-tecnico",
      "name": "POST vinculación identidad",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        880,
        220
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.continuar}}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true"
              }
            }
          ]
        }
      },
      "id": "if-vinculacion-continuar-tecnico",
      "name": "IF vinculación — continuar",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        1100,
        220
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "mensaje",
              "value": "={{ $('Contexto técnico').item.json.mensaje }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "set-mensaje-no-autorizado-tecnico",
      "name": "Restaurar mensaje no autorizado",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        1320,
        300
      ]
    }
  ],
  "connections": {
    "Telegram Trigger": {
      "main": [
        [
          {
            "node": "Normalizar Telegram",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Webhook WhatsApp (Twilio)": {
      "main": [
        [
          {
            "node": "Normalizar WhatsApp",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar Telegram": {
      "main": [
        [
          {
            "node": "Contexto técnico",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar WhatsApp": {
      "main": [
        [
          {
            "node": "Contexto técnico",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Contexto técnico": {
      "main": [
        [
          {
            "node": "IF autorizado",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF autorizado": {
      "main": [
        [
          {
            "node": "IA: interpretar mensaje",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "POST vinculación identidad",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IA: interpretar mensaje": {
      "main": [
        [
          {
            "node": "Switch por intención",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por intención": {
      "main": [
        [
          {
            "node": "Formatear lista de tickets",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "POST check-in",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "POST nota",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "POST evidencia",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Mensaje: no entendido",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Formatear lista de tickets": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST check-in": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST nota": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST evidencia": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Mensaje: no entendido": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por canal": {
      "main": [
        [
          {
            "node": "Telegram - Responder",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Twilio - Responder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "POST vinculación identidad": {
      "main": [
        [
          {
            "node": "IF vinculación — continuar",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF vinculación — continuar": {
      "main": [
        [
          {
            "node": "Restaurar mensaje no autorizado",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Restaurar mensaje no autorizado": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 8. Coordinador/Admin: consultas y resumen diario por chat

Dos workflows separados: uno **on-demand** (el coordinador/admin pregunta cuando
quiere) y uno **programado** (un resumen que llega solo, todos los días).

### a) Endpoints

**`GET /api/n8n/staff/verificar?canal=&identificador=&texto=`**

Valida que la identidad resuelva a un `Usuario` con rol `ADMIN` o `COORDINADOR` — a
diferencia de `staff/resumen`, este SÍ valida identidad, porque hay una persona de chat
detrás pidiendo algo puntual. `texto` es passthrough (mismo motivo de siempre).

```json
{ "autorizado": true, "usuarioNombre": "Lucía Fernández", "rol": "ADMIN", "canal": "TELEGRAM", "identificador": "777000222", "texto": "cuántos tickets críticos hay sin asignar?" }
```

**`GET /api/n8n/staff/resumen`**

Sin identidad — protegido solo por `WEBHOOK_SECRET`, para poder reusarlo tanto desde
el workflow on-demand (después de pasar por `/verificar`) como desde el resumen diario
programado, que no tiene un usuario de chat detrás. Devuelve la misma data que el
dashboard de `/admin` (mismas funciones de cálculo — `cumplioSla`,
`calcularVigenciaPlan` — así el número que ve el coordinador por chat es siempre el
mismo que ve en el dashboard):

```json
{
  "ticketsActivos": 3,
  "ticketsPorEstado": { "ABIERTO": 1, "ASIGNADO": 0, "EN_DIAGNOSTICO": 1, "...": 0 },
  "ticketsAbiertosPorPrioridad": { "CRITICA": 1, "ALTA": 1, "MEDIA": 1, "BAJA": 0 },
  "slaCumplimiento": { "resueltos": 2, "cumplidos": 1, "vencidos": 1, "pctCumplimiento": 50 },
  "cargaPorTecnico": [{ "tecnico": "María Gómez", "activos": 2, "resueltosUltimos30Dias": 2 }],
  "preventivosPorVigencia": { "vencido": 2, "proximo": 0, "programado": 1 },
  "criticosSinAsignar": [{ "numeroTicket": "TCK-0009", "titulo": "...", "clienteNombre": "...", "prioridad": "CRITICA", "horasAbierto": 12.4 }]
}
```

### b) Comandos predefinidos + IA libre (según lo que pidieron)

El nodo Code "Responder consulta" primero intenta matchear palabras clave del mensaje
contra comandos fijos (`abiert`, `sla`, `critic`/`sin asignar`, `carga`/`tecnico`) y
arma la respuesta directo del JSON de `/staff/resumen` — rápido y 100% consistente. Si
ninguna palabra clave matchea, le pasa la pregunta completa + el JSON de resumen a la
IA como contexto y le pide que responda en texto plano **usando solo esos datos** (para
que no invente números). Ambos caminos están **restringidos a Admin/Coordinador** por
el paso previo de `/staff/verificar` — un Técnico o Cliente que le escriba a este bot
recibe el mensaje de "no autorizado", nunca llega a ver estadísticas.

### c) Diagrama — consultas on-demand

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ GET staff/verificar → IF autorizado
Webhook WhatsApp (onReceived) ──→ Normalizar WhatsApp ─┘                ├─ false → Switch por canal → responder
                                                                         └─ true  → GET staff/resumen ──┐
                                                                                                          ├→ Combinar identidad y resumen
                                                                              IF autorizado (true) ──────┘    → Responder consulta (comando fijo o IA libre)
                                                                                                               → Switch por canal → responder
```

> **"Combinar identidad y resumen"**: `GET staff/resumen` reemplaza `$json` entero con
> las métricas del dashboard — sin este paso, "Responder consulta" necesitaría ir a
> buscar `rol`/`texto`/`empresaNombre` con `$('Verificar staff')`, una referencia por
> nombre que deja de resolverse cuando este workflow se invoca como sub-workflow desde
> el router de §10 (`Error: Referenced node doesn't exist`, visto en producción). El
> Merge junta ambos sin depender de ningún nombre de nodo.

### d) JSON importable — consultas on-demand

[`n8n-workflows/5-staff-consultas.json`](./n8n-workflows/5-staff-consultas.json)

```json
{
  "name": "NexIT - Staff consultas por chat",
  "nodes": [
    {
      "parameters": {
        "updates": [
          "message"
        ]
      },
      "id": "telegram-trigger-staff",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [
        0,
        -120
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "nexit-staff-whatsapp-in",
        "responseMode": "onReceived"
      },
      "id": "webhook-whatsapp-staff",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [
        0,
        120
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "TELEGRAM",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.message.chat.id }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.message.text }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-telegram-staff",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        -120
      ]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            {
              "id": "1",
              "name": "canal",
              "value": "WHATSAPP",
              "type": "string"
            },
            {
              "id": "2",
              "name": "identificador",
              "value": "={{ $json.body.From.replace('whatsapp:', '') }}",
              "type": "string"
            },
            {
              "id": "3",
              "name": "texto",
              "value": "={{ $json.body.Body }}",
              "type": "string"
            }
          ]
        }
      },
      "id": "normalizar-whatsapp-staff",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [
        220,
        120
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/verificar",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            {
              "name": "canal",
              "value": "={{ $json.canal }}"
            },
            {
              "name": "identificador",
              "value": "={{ $json.identificador }}"
            },
            {
              "name": "texto",
              "value": "={{ $json.texto }}"
            }
          ]
        },
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        }
      },
      "id": "verificar-staff",
      "name": "Verificar staff",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "conditions": {
          "conditions": [
            {
              "leftValue": "={{$json.autorizado}}",
              "rightValue": true,
              "operator": {
                "type": "boolean",
                "operation": "true"
              }
            }
          ]
        }
      },
      "id": "if-autorizado-staff",
      "name": "IF autorizado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [
        660,
        0
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/resumen",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        }
      },
      "id": "get-resumen-staff",
      "name": "GET resumen",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        880,
        -100
      ]
    },
    {
      "parameters": {
        "jsCode": "const resumen = $json;\nconst identidad = $('Verificar staff').item.json;\nconst texto = (identidad.texto || '').toLowerCase();\n\nfunction formatearAbiertos() {\n  const lineas = Object.entries(resumen.ticketsPorEstado).map(([k, v]) => `${k}: ${v}`).join('\\n');\n  return `Tickets por estado:\\n${lineas}`;\n}\nfunction formatearSla() {\n  const s = resumen.slaCumplimiento;\n  return s.resueltos === 0 ? 'Todavía no hay tickets resueltos para medir SLA.' : `Cumplimiento de SLA: ${s.pctCumplimiento}% (${s.cumplidos} de ${s.resueltos} resueltos a tiempo).`;\n}\nfunction formatearCriticos() {\n  if (!resumen.criticosSinAsignar.length) return 'No hay tickets críticos/altos sin asignar.';\n  const lineas = resumen.criticosSinAsignar.map((t) => `#${t.numeroTicket} - ${t.titulo} (${t.clienteNombre}, ${t.prioridad}, ${t.horasAbierto}h abierto)`).join('\\n');\n  return `Críticos/altos sin asignar:\\n${lineas}`;\n}\nfunction formatearCarga() {\n  if (!resumen.cargaPorTecnico.length) return 'Nadie tiene tickets activos ahora mismo.';\n  const lineas = resumen.cargaPorTecnico.map((t) => `${t.tecnico}: ${t.activos} activos, ${t.resueltosUltimos30Dias} resueltos (30d)`).join('\\n');\n  return `Carga por técnico:\\n${lineas}`;\n}\n\nlet mensaje = null;\nif (texto.includes('abiert')) mensaje = formatearAbiertos();\nelse if (texto.includes('sla')) mensaje = formatearSla();\nelse if (texto.includes('critic') || texto.includes('sin asignar')) mensaje = formatearCriticos();\nelse if (texto.includes('carga') || texto.includes('tecnico') || texto.includes('técnico')) mensaje = formatearCarga();\n\nif (!mensaje) {\n  const openaiKey = $env.OPENAI_API_KEY;\n  const prompt = `Sos un asistente que responde preguntas de un ${identidad.rol} de ${identidad.empresaNombre} sobre el estado de los tickets, usando SOLO estos datos (no inventes nada que no este aca):\\n${JSON.stringify(resumen)}\\n\\nPregunta: \"${identidad.texto}\"\\n\\nRespondé en texto plano, corto y directo, en español.`;\n  const respuesta = await this.helpers.httpRequest({\n    method: 'POST',\n    url: 'https://api.openai.com/v1/chat/completions',\n    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n    body: { model: 'gpt-4o-mini', messages: [{ role: 'system', content: prompt }] },\n    json: true,\n  });\n  mensaje = respuesta.choices[0].message.content;\n}\n\nreturn [{ json: { canal: identidad.canal, identificador: identidad.identificador, mensaje } }];"
      },
      "id": "responder-consulta-staff",
      "name": "Responder consulta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        1100,
        -100
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "TELEGRAM",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "WHATSAPP",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "id": "switch-canal-staff",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        1320,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.identificador }}",
        "text": "={{ $json.mensaje }}"
      },
      "id": "telegram-responder-staff",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        1540,
        -100
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{ $json.identificador }}",
        "message": "={{ $json.mensaje }}"
      },
      "id": "twilio-responder-staff",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        1540,
        100
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    }
  ],
  "connections": {
    "Telegram Trigger": {
      "main": [
        [
          {
            "node": "Normalizar Telegram",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Webhook WhatsApp (Twilio)": {
      "main": [
        [
          {
            "node": "Normalizar WhatsApp",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar Telegram": {
      "main": [
        [
          {
            "node": "Verificar staff",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Normalizar WhatsApp": {
      "main": [
        [
          {
            "node": "Verificar staff",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Verificar staff": {
      "main": [
        [
          {
            "node": "IF autorizado",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "IF autorizado": {
      "main": [
        [
          {
            "node": "GET resumen",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "GET resumen": {
      "main": [
        [
          {
            "node": "Responder consulta",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Responder consulta": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por canal": {
      "main": [
        [
          {
            "node": "Telegram - Responder",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Twilio - Responder",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### e) JSON importable — resumen diario programado

Igual patrón que el cron de SLA (§4): `Schedule Trigger` → `HTTP Request` — pero acá
el destino es n8n llamando a NexIT sin ninguna identidad de chat, y el resultado se
manda directo a un chat_id de grupo fijo (`NEXIT_TELEGRAM_CHAT_ID`, la misma variable
de entorno que ya usa la alerta de `SLA_EN_RIESGO` en el Workflow 1). Configura el
**Schedule Trigger** con la expresión cron `0 8 * * *` (todos los días a las 8am) o el
horario que prefieras.

[`n8n-workflows/6-staff-resumen-diario.json`](./n8n-workflows/6-staff-resumen-diario.json)

```json
{
  "name": "NexIT - Resumen diario",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 8 * * *"
            }
          ]
        }
      },
      "id": "schedule-resumen-diario",
      "name": "Todos los días 8am",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        0,
        0
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/resumen",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        }
      },
      "id": "get-resumen-diario",
      "name": "GET resumen",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        220,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const r = $json;\nconst lineas = [\n  `📊 Resumen diario ${r.empresaNombre}`,\n  '',\n  `Tickets activos: ${r.ticketsActivos}`,\n  `Críticos/altos sin asignar: ${r.criticosSinAsignar.length}`,\n  `Cumplimiento SLA: ${r.slaCumplimiento.pctCumplimiento ?? '—'}%`,\n  `Preventivos vencidos: ${r.preventivosPorVigencia.vencido}`,\n];\nif (r.criticosSinAsignar.length) {\n  lineas.push('', 'Sin asignar:');\n  for (const t of r.criticosSinAsignar.slice(0, 5)) {\n    lineas.push(`- #${t.numeroTicket} (${t.clienteNombre}, ${t.prioridad}, ${t.horasAbierto}h)`);\n  }\n}\nreturn [{ json: { mensaje: lineas.join('\\n') } }];"
      },
      "id": "formatear-resumen-diario",
      "name": "Formatear resumen",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $env.NEXIT_TELEGRAM_CHAT_ID }}",
        "text": "={{ $json.mensaje }}"
      },
      "id": "telegram-resumen-diario",
      "name": "Telegram - Grupo",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        660,
        0
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    }
  ],
  "connections": {
    "Todos los días 8am": {
      "main": [
        [
          {
            "node": "GET resumen",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "GET resumen": {
      "main": [
        [
          {
            "node": "Formatear resumen",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Formatear resumen": {
      "main": [
        [
          {
            "node": "Telegram - Grupo",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

Solo manda a Telegram (mismo criterio que la alerta de SLA) — si además querés el
resumen por WhatsApp, agregá un nodo Twilio igual al de los otros workflows, con el
número de destino fijo en vez de `{{$json.identificador}}`.

## 9. Resumen diario personalizado (uno por persona, no a un grupo)

Distinto del §8.e (que manda un único resumen agregado a un chat/grupo fijo): acá cada
persona con un canal vinculado en `/perfil` recibe **su propio mensaje**, con datos
relevantes para ella:

- **Técnicos**: sus tickets activos asignados (marcando cuáles tienen el SLA vencido o
  en riesgo) + sus próximos preventivos agendados (próximos 7 días).
- **Admin/Coordinador**: el mismo resumen agregado del §8 (tickets por estado,
  cumplimiento de SLA, críticos sin asignar, preventivos vencidos), pero entregado a su
  chat individual en vez de a un grupo compartido.

Ambos workflows (§8.e y §9) pueden convivir: uno mantiene la visibilidad compartida del
equipo en un canal común, el otro le llega a cada quien sin que tenga que estar mirando
ese grupo.

### a) Endpoint

**`GET /api/n8n/resumen-diario`** — sin identidad, solo `WEBHOOK_SECRET` (lo dispara un
Schedule Trigger, no hay un chat de por medio). Devuelve un array por cada rol con
canal vinculado:

```json
{
  "tecnicos": [
    {
      "usuarioNombre": "María Gómez",
      "telegramChatId": "555000111",
      "whatsappTelefono": null,
      "ticketsHoy": [
        { "numeroTicket": "TCK-0002", "titulo": "Switch de piso 3 no responde", "clienteNombre": "Hospital San Rafael", "prioridad": "CRITICA", "estado": "EN_EJECUCION", "estadoSla": "vencido" }
      ],
      "preventivosProximos": [
        { "titulo": "Mantenimiento mensual - Switch piso 3", "clienteNombre": "Hospital San Rafael", "proximaFecha": "2026-09-26" }
      ]
    }
  ],
  "staff": [
    { "usuarioNombre": "Lucía Fernández", "rol": "ADMIN", "telegramChatId": "777000222", "whatsappTelefono": null, "resumen": { "...": "mismo shape que /api/n8n/staff/resumen" } }
  ]
}
```

Un usuario sin ningún canal vinculado (ni Telegram ni WhatsApp) simplemente no aparece
en ninguno de los dos arrays — no hace falta filtrarlo del lado de n8n.

### b) Diagrama

```
Schedule Trigger (7am) → GET resumen-diario
                            → Aplanar destinatarios (Code: un item por persona y canal
                              vinculado, con el mensaje ya formateado — un técnico con
                              Telegram Y WhatsApp vinculados recibe el mismo mensaje
                              por ambos)
                            → Switch por canal
                               ├─ TELEGRAM → Telegram - Enviar
                               └─ WHATSAPP → Twilio - Enviar
```

### c) JSON importable

[`n8n-workflows/7-resumen-diario-personalizado.json`](./n8n-workflows/7-resumen-diario-personalizado.json)

```json
{
  "name": "NexIT - Resumen diario personalizado",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "cronExpression",
              "expression": "0 7 * * *"
            }
          ]
        }
      },
      "id": "schedule-resumen-personalizado",
      "name": "Todos los días 7am",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [
        0,
        0
      ]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/resumen-diario",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "=Bearer {{ $env.WEBHOOK_SECRET }}"
            }
          ]
        }
      },
      "id": "get-resumen-diario-personalizado",
      "name": "GET resumen diario",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [
        220,
        0
      ]
    },
    {
      "parameters": {
        "jsCode": "const data = $json;\nconst items = [];\n\nfunction agregarDestino(canal, identificador, mensaje) {\n  if (!identificador) return;\n  items.push({ json: { canal, identificador, mensaje } });\n}\n\nfor (const t of data.tecnicos) {\n  const lineasTickets = t.ticketsHoy.length\n    ? t.ticketsHoy.map((tk) => {\n        const alerta = tk.estadoSla === 'vencido' ? ' ⚠️ SLA VENCIDO' : tk.estadoSla === 'en_riesgo' ? ' ⏰ SLA en riesgo' : '';\n        return `- #${tk.numeroTicket} ${tk.titulo} (${tk.clienteNombre}, ${tk.prioridad})${alerta}`;\n      }).join('\\n')\n    : 'Sin tickets activos asignados.';\n  const lineasPreventivos = t.preventivosProximos.length\n    ? t.preventivosProximos.map((p) => `- ${p.titulo} (${p.clienteNombre}) — ${p.proximaFecha}`).join('\\n')\n    : null;\n\n  let mensaje = `☀️ Buenos días ${t.usuarioNombre.split(' ')[0]}, tus tickets activos:\\n${lineasTickets}`;\n  if (lineasPreventivos) mensaje += `\\n\\nPreventivos próximos (7 días):\\n${lineasPreventivos}`;\n\n  agregarDestino('TELEGRAM', t.telegramChatId, mensaje);\n  agregarDestino('WHATSAPP', t.whatsappTelefono, mensaje);\n}\n\nfor (const s of data.staff) {\n  const r = s.resumen;\n  const mensaje = `📊 Resumen diario ${data.empresaNombre}\\n\\nTickets activos: ${r.ticketsActivos}\\nCríticos/altos sin asignar: ${r.criticosSinAsignar.length}\\nCumplimiento SLA: ${r.slaCumplimiento.pctCumplimiento ?? '—'}%\\nPreventivos vencidos: ${r.preventivosPorVigencia.vencido}`;\n  agregarDestino('TELEGRAM', s.telegramChatId, mensaje);\n  agregarDestino('WHATSAPP', s.whatsappTelefono, mensaje);\n}\n\nreturn items;"
      },
      "id": "aplanar-destinatarios",
      "name": "Aplanar destinatarios",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [
        440,
        0
      ]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "TELEGRAM",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            },
            {
              "conditions": {
                "conditions": [
                  {
                    "leftValue": "={{$json.canal}}",
                    "rightValue": "WHATSAPP",
                    "operator": {
                      "type": "string",
                      "operation": "equals"
                    }
                  }
                ]
              }
            }
          ]
        }
      },
      "id": "switch-canal-resumen-personalizado",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [
        660,
        0
      ]
    },
    {
      "parameters": {
        "chatId": "={{ $json.identificador }}",
        "text": "={{ $json.mensaje }}"
      },
      "id": "telegram-resumen-personalizado",
      "name": "Telegram - Enviar",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [
        880,
        -100
      ],
      "credentials": {
        "telegramApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Telegram Bot"
        }
      }
    },
    {
      "parameters": {
        "from": "whatsapp:+14155238886",
        "to": "=whatsapp:{{ $json.identificador }}",
        "message": "={{ $json.mensaje }}"
      },
      "id": "twilio-resumen-personalizado",
      "name": "Twilio - Enviar",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [
        880,
        100
      ],
      "credentials": {
        "twilioApi": {
          "id": "REEMPLAZAR",
          "name": "NexIT Twilio"
        }
      }
    }
  ],
  "connections": {
    "Todos los días 7am": {
      "main": [
        [
          {
            "node": "GET resumen diario",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "GET resumen diario": {
      "main": [
        [
          {
            "node": "Aplanar destinatarios",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Aplanar destinatarios": {
      "main": [
        [
          {
            "node": "Switch por canal",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Switch por canal": {
      "main": [
        [
          {
            "node": "Telegram - Enviar",
            "type": "main",
            "index": 0
          }
        ],
        [
          {
            "node": "Twilio - Enviar",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

## 10. Compartir un solo bot/número entre cliente, técnico y staff (opcional)

Los §6, §7 y §8 están pensados, por defecto, para que cada flujo tenga **su propio**
bot de Telegram / número de WhatsApp. Eso es intencional y sigue siendo la opción más
simple si no te importa tener 3 bots/números distintos. Pero un bot de Telegram (o un
número de WhatsApp vía Twilio) **solo puede tener un webhook activo a la vez** — si
activás los 3 workflows con el mismo bot/número, el último que actives le "roba" el
webhook a los otros dos, que dejan de recibir mensajes sin ningún error visible. Esta
sección es para quien quiere que **un solo** bot/número atienda a los tres roles.

### a) El problema de fondo

`conversacion/mensaje` (§6), `tecnico/contexto` (§7) y `staff/verificar` (§8) cada uno
**asume de antemano** qué rol va a encontrar, y trata cualquier otro rol como si no
existiera. No hay, en esos tres, ningún paso que primero resuelva "¿quién es esta
persona y qué rol tiene?" antes de decidir a qué flujo de negocio mandarla — por eso no
alcanza con "apuntar los tres workflows al mismo bot": haría falta que los tres estén
escuchando el mismo webhook a la vez, cosa que Telegram/Twilio no permiten.

### b) Endpoint

**`GET /api/n8n/identidad/resolver?canal=&identificador=&texto=`**

A diferencia de `conversacion/mensaje`/`tecnico/contexto`/`staff/verificar`, este
endpoint **no asume ningún rol** — solo dice quién es (si es alguien) y qué rol tiene,
para que el workflow arme un `Switch` antes de invocar el flujo de negocio
correspondiente. `texto` es puro passthrough (mismo motivo de siempre: la próxima
llamada ya pisó `$json`).

```json
// 200 — encontrado
{ "encontrado": true, "rol": "TECNICO", "usuarioNombre": "María Gómez", "canal": "TELEGRAM", "identificador": "555000111", "texto": "hice check-in del TCK-0002" }

// 200 — no encontrado
{ "encontrado": false, "rol": null, "motivo": "NO_ENCONTRADO", "canal": "WHATSAPP", "identificador": "+18095551234", "texto": "Hola" }

// 200 — encontrado pero inactivo
{ "encontrado": false, "rol": null, "motivo": "INACTIVO", "canal": "TELEGRAM", "identificador": "555000222", "texto": "Hola" }
```

`rol` es uno de `"CLIENTE" | "TECNICO" | "COORDINADOR" | "ADMIN"` cuando
`encontrado: true`. Los tres endpoints de rol específico (`conversacion/mensaje`,
`tecnico/contexto`, `staff/verificar`) siguen haciendo su propia verificación completa
cuando el `Switch` los invoque — la query extra es un costo aceptable a cambio de no
duplicar sus reglas de negocio acá (sucursales/activos para cliente, tickets activos
para técnico, etc.).

### c) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ GET identidad/resolver → IF identidad encontrada
Webhook WhatsApp (Twilio) ──→ Normalizar WhatsApp ─┘                      ├─ true  → Switch por rol
                                                                          │            ├─ CLIENTE      → Execute Workflow → workflow §6
                                                                          │            ├─ TECNICO      → Execute Workflow → workflow §7
                                                                          │            ├─ ADMIN        → Execute Workflow → workflow §8
                                                                          │            └─ COORDINADOR  → Execute Workflow → workflow §8
                                                                          └─ false → POST vinculación identidad → IF continuar
                                                                                       ├─ true  → POST contacto-pendiente/mensaje
                                                                                       │            → Switch por canal → responder
                                                                                       └─ false → Switch por canal → responder
```

El `Switch por rol` bifurca a los workflows de §6/§7/§8 **tal cual existen hoy**, vía
un nodo **Execute Workflow** — no hace falta reescribir su lógica de negocio. Cada uno
de esos 3 workflows ya termina enviando la respuesta por el canal correcto (su propio
`Switch por canal` → Telegram/Twilio), así que el router no necesita repetir ese paso
para esas tres ramas — solo lo necesita para su propio fallback de "no encontrado"
(vinculación / contacto pendiente), que no es parte de ningún sub-flujo.

### d) Cómo migrar sin perder la opción de volver atrás

Los workflows de §6/§7/§8 ya traen (de forma aditiva, sin tocar su `Telegram
Trigger`/`Webhook` propios) un nodo **`Execute Workflow Trigger (router)`** como punto
de entrada alternativo, conectado directo a su primer nodo real (`Guardar mensaje` /
`Contexto técnico` / `Verificar staff`). Para pasar a un solo bot/número:

1. Importá `n8n-workflows/0-router-canal-unico.json`.
2. En los nodos **Execute Workflow — Cliente/Técnico/Staff** del router, elegí (con el
   selector de n8n) el workflow real que importaste para §6/§7/§8 — el placeholder
   `REEMPLAZAR` es solo un punto de partida, cada instancia de n8n le asigna su propio
   ID interno al importar.
3. **Desactivá** los nodos `Telegram Trigger`/`Webhook WhatsApp` propios de §6/§7/§8
   (o directamente desactivá esos 3 workflows como automatizaciones independientes,
   dejándolos solo invocables vía Execute Workflow).
4. Activá el workflow 0 — es el único que necesita el bot de Telegram / número de
   WhatsApp compartido configurado en sus credenciales.

Si en algún momento preferís volver a bots separados, revertí el paso 3 (reactivá los
Triggers propios) y desactivá el workflow 0 — nada de esto borra ni reemplaza la
configuración original de §6/§7/§8.

### e) Fuera de alcance

Instagram como cuarto canal no está soportado — `canalChatSchema` (ver
`src/lib/zod/n8n.schema.ts`) solo acepta `"TELEGRAM" | "WHATSAPP"`, y `Usuario` no
tiene una columna para un identificador de Instagram (`resolverUsuarioPorChatId()`
solo sabe resolver esos dos). Sumar un tercer canal real requeriría cambios de schema,
no solo de workflow.

### f) JSON importable

[`n8n-workflows/0-router-canal-unico.json`](./n8n-workflows/0-router-canal-unico.json)
— después de importarlo, además de lo del punto d), revisá el nombre exacto del campo
de body crudo del Webhook node en tu versión de n8n (igual que en §5) y configurá
`WEBHOOK_SECRET` como variable de entorno si todavía no lo hiciste para los otros
workflows.
