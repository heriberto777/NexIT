# Integración NexIT ↔ n8n

Documentación de los eventos que NexIT envía por webhook, cómo verificarlos en n8n, y
una plantilla de workflow lista para importar (o armar a mano, paso a paso).

## 1. Especificación de los payloads

Todo evento se envía como `POST` a `WEBHOOK_N8N_URL` con este sobre común:

```json
{
  "evento": "TICKET_CREADO | TICKET_CAMBIO_ESTADO | SLA_EN_RIESGO",
  "timestamp": "2026-09-22T19:35:41.001Z",
  "data": { /* específico de cada evento, ver abajo */ }
}
```

Headers en cada request (fuente: `src/server/services/webhook.service.ts`):

```
Content-Type: application/json
X-NexIT-Signature: sha256=<hmac-sha256 hex del body completo, con WEBHOOK_SECRET>
Authorization: Bearer <WEBHOOK_SECRET>
```

Los dos headers de autenticación solo se envían si `WEBHOOK_SECRET` está configurado
en NexIT. Si no lo está, el payload llega sin firmar (no recomendado en producción).

### `TICKET_CREADO`

Se dispara al crear un ticket desde `/portal` (`origen: "PORTAL"`) o al generarse
automáticamente desde un plan preventivo (`origen: "PROGRAMADO"`).

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
> email propio de empresa — solo `Usuario.email`. Cuando `origen: "PORTAL"`,
> `reportadoPorEmail` es el correo del cliente que reportó la falla (destinatario
> correcto para la confirmación). Cuando `origen: "PROGRAMADO"`, es el correo del
> **coordinador** que corrió la generación automática, no un contacto del cliente — tu
> workflow debe filtrar por `origen` antes de mandar el email de confirmación (ver §3).

> **`reportadoPorTelegramChatId` / `reportadoPorWhatsapp`**: `null` si ese usuario
> nunca vinculó el canal desde `/perfil` (los 4 roles tienen esa opción en su perfil).
> A diferencia de `reportadoPorEmail` (siempre presente), estos dos SIEMPRE hay que
> chequearlos con un IF antes de usarlos — un chat_id o teléfono vacío rompe los nodos
> de Telegram/Twilio en vez de simplemente no hacer nada (ver §3.d).

### `TICKET_CAMBIO_ESTADO`

Se dispara en tres transiciones puntuales: check-in del técnico (`EN_DIAGNOSTICO`),
cierre del wizard de ejecución (`ESPERANDO_VALIDACION`) y aprobación del cliente
(`RESUELTO`). No se dispara en `REABIERTO` (rechazo del cliente) ni en `CERRADO`
(cierre administrativo) — no forman parte de los tres eventos de integración pedidos.

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

`estadoNuevo` es siempre uno de `"EN_DIAGNOSTICO" | "ESPERANDO_VALIDACION" | "RESUELTO"`.

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

## 2. Verificar la firma HMAC en n8n

El paso crítico es que n8n reciba el **body crudo** (los mismos bytes que NexIT
firmó), no el JSON ya re-parseado — si n8n lo reserializa antes de calcular el HMAC,
el resultado no va a coincidir aunque el contenido sea "igual" (cambia el orden de
llaves, espacios, etc.).

1. **Nodo Webhook**: método `POST`, en **Options** activa **"Raw Body"** (o
   "Response Data" según tu versión) para que el body llegue como string crudo en vez
   de objeto ya parseado. Configura **Respond**: "Using Respond to Webhook Node" (así
   controlas cuándo responder, en vez de que n8n responda automáticamente antes de
   terminar de procesar).

2. **Verificar la firma** — dos formas, usa la que prefieras:

   **Opción A — nodo Crypto** (sin `require`, más simple):
   - Operation: `Hmac`
   - Type: `SHA256`
   - Value: `{{$json.body}}` (el string crudo del paso 1 — el nombre exacto del
     campo puede variar según tu versión de n8n; revísalo ejecutando el workflow una
     vez con datos de prueba y mirando la pestaña "JSON" del nodo Webhook)
   - Secret: tu `WEBHOOK_SECRET`, idealmente como variable de entorno de n8n
     (`{{$env.WEBHOOK_SECRET}}`) en vez de pegarlo literal en el nodo
   - Output Property Name: `firmaCalculada`

   Después, un nodo **IF** comparando:
   `={{ 'sha256=' + $json.firmaCalculada }}` **igual a**
   `={{ $('Webhook').item.json.headers['x-nexit-signature'] }}`

   **Opción B — nodo Code** (todo en un paso, requiere que tu instancia de n8n
   permita `require('crypto')` en Code nodes — es un módulo built-in de Node, casi
   siempre permitido por defecto):

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

   Con la Opción B, un `throw` dentro de un Code node detiene el workflow y lo marca
   como fallido — suficiente para rechazar el request sin construir un branch de error
   aparte, aunque no le da un 401 explícito al llamador (NexIT no le importa el código
   de estado; ya despachó el webhook en segundo plano y no reintenta).

3. Si usaste la Opción A, agrega después del IN un nodo **Code** para convertir el
   string crudo en objeto: `return [{ json: JSON.parse($json.body) }];` — a partir de
   aquí, todos los ejemplos de expresiones (`{{$json.evento}}`, `{{$json.data...}}`)
   asumen que ya pasaste por este parseo.

## 3. Workflow: enrutar por tipo de evento

Con el body ya verificado y parseado, arma el resto así:

```
Webhook → Crypto/Code (firma) → IF (firma válida) ─┬─ false → (fin, sin responder = 401 implícito, o Respond to Webhook 401)
                                                     └─ true → Respond to Webhook (200 "recibido")
                                                              → Switch (por $json.evento)
                                                                 ├─ TICKET_CREADO
                                                                 ├─ TICKET_CAMBIO_ESTADO
                                                                 └─ SLA_EN_RIESGO
```

Responder ANTES del Switch es intencional: NexIT ya despachó el webhook de forma
fire-and-forget con un timeout de 8s — si el envío del email/Telegram tarda, no hay
razón para que NexIT espere. n8n sigue ejecutando los nodos posteriores al "Respond to
Webhook" en segundo plano igual.

### a) `TICKET_CREADO` → confirmación al cliente

```
Switch[TICKET_CREADO] → IF ($json.data.origen == "PORTAL")
                          ├─ true  → Send Email (SMTP)
                          │            To: {{$json.data.reportadoPorEmail}}
                          │            Subject: Ticket #{{$json.data.numeroTicket}} recibido
                          │            Body: "Hola {{$json.data.reportadoPorNombre}}, registramos tu
                          │                   solicitud '{{$json.data.titulo}}' con prioridad
                          │                   {{$json.data.prioridad}}. Te avisaremos cuando un
                          │                   técnico la atienda."
                          │          → (opcional) Telegram: sendMessage — requiere mapear
                          │             reportadoPorEmail → chat_id en una tabla propia de n8n
                          │             (el payload de NexIT no incluye chat_id de Telegram)
                          └─ false → NoOp (origen PROGRAMADO: el "reportador" es un
                                      coordinador, no un contacto del cliente — no se le
                                      manda una "confirmación de tu reporte")
```

### b) `TICKET_CAMBIO_ESTADO` → aviso de visita lista para aprobar

```
Switch[TICKET_CAMBIO_ESTADO] → IF ($json.data.estadoNuevo == "ESPERANDO_VALIDACION")
                                 ├─ true  → Send Email (SMTP)
                                 │            To: {{$json.data.reportadoPorEmail}}
                                 │            Subject: Visita completada — Ticket #{{$json.data.numeroTicket}}
                                 │            Body: "El técnico finalizó la visita para
                                 │                   '{{$json.data.clienteNombre}}'. Ingresa a
                                 │                   {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}}
                                 │                   para revisar el informe y aprobar o rechazar."
                                 └─ false → NoOp (EN_DIAGNOSTICO / RESUELTO: sin acción hoy,
                                             el Switch deja el branch listo para extender)
```

`NEXIT_BASE_URL` es una variable de entorno propia de tu instancia de n8n (ej.
`https://nexit.tuempresa.com`) — el payload trae `ticketId` pero no la URL base, ya
que esa es una decisión de despliegue, no algo que la app deba conocer sobre n8n.

### d) Reenviar la misma confirmación por Telegram/WhatsApp (opcional)

Antes, esta sección decía que mandar el aviso por Telegram "requiere mapear
`reportadoPorEmail` → `chat_id` en una tabla propia de n8n". Ya no: desde que el
usuario vincula su Telegram/WhatsApp en `/perfil`, el payload trae
`reportadoPorTelegramChatId`/`reportadoPorWhatsapp` directo — agregá estos nodos
después de (o en paralelo a) los `Send Email` de §3.a/§3.b, cada uno con su propio IF
de "¿el usuario vinculó este canal?" (null = todavía no lo hizo, no intentes mandar):

```
IF origen PORTAL (true) ─┬─ Send Email (como antes)
                          ├─ IF ($json.data.reportadoPorTelegramChatId != null)
                          │    └─ true → Telegram sendMessage
                          │         chatId: {{$json.data.reportadoPorTelegramChatId}}
                          │         text: "Ticket #{{$json.data.numeroTicket}} recibido —
                          │               prioridad {{$json.data.prioridad}}. Te avisaremos
                          │               cuando un técnico lo atienda."
                          └─ IF ($json.data.reportadoPorWhatsapp != null)
                               └─ true → Twilio (nodo Twilio, no HTTP Request)
                                    From: whatsapp:<tu número Twilio>
                                    To:   =whatsapp:{{$json.data.reportadoPorWhatsapp}}
                                    Message: mismo texto que el de Telegram
```

Mismo patrón para el email de §3.b (`ESPERANDO_VALIDACION`) — un IF por canal antes de
cada nodo de envío, en paralelo al `Send Email` existente, no reemplazándolo.

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
> `3-asistente-ia-telegram-whatsapp.json`, sin copiar/pegar.

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
        "options": { "rawBody": true }
      },
      "id": "webhook-nexit",
      "name": "Webhook NexIT",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "jsCode": "const crypto = require('crypto');\nconst secret = $env.WEBHOOK_SECRET;\nconst rawBody = $input.first().json.body;\nconst firmaRecibida = $input.first().json.headers['x-nexit-signature'] || '';\nconst firmaCalculada = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');\nif (firmaRecibida !== firmaCalculada) {\n  throw new Error('Firma invalida');\n}\nreturn [{ json: JSON.parse(rawBody) }];"
      },
      "id": "verificar-firma",
      "name": "Verificar firma HMAC",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 0]
    },
    {
      "parameters": { "respondWith": "json", "responseBody": "={{ { \"recibido\": true } }}" },
      "id": "responder-ok",
      "name": "Respond 200",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [440, 0]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "TICKET_CREADO", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "TICKET_CAMBIO_ESTADO", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.evento}}", "rightValue": "SLA_EN_RIESGO", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-evento",
      "name": "Switch por evento",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [660, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.data.origen}}", "rightValue": "PORTAL", "operator": { "type": "string", "operation": "equals" } }] }
      },
      "id": "if-origen-portal",
      "name": "IF origen PORTAL",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [880, -200]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Ticket #{{$json.data.numeroTicket}} recibido",
        "text": "=Hola {{$json.data.reportadoPorNombre}}, registramos tu solicitud \"{{$json.data.titulo}}\" con prioridad {{$json.data.prioridad}}. Te avisaremos cuando un tecnico la atienda."
      },
      "id": "email-ticket-creado",
      "name": "Email confirmacion ticket",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [1100, -260]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.data.estadoNuevo}}", "rightValue": "ESPERANDO_VALIDACION", "operator": { "type": "string", "operation": "equals" } }] }
      },
      "id": "if-esperando-validacion",
      "name": "IF ESPERANDO_VALIDACION",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [880, 0]
    },
    {
      "parameters": {
        "fromEmail": "notificaciones@nexit.tuempresa.com",
        "toEmail": "={{$json.data.reportadoPorEmail}}",
        "subject": "=Visita completada - Ticket #{{$json.data.numeroTicket}}",
        "text": "=El tecnico finalizo la visita. Ingresa a {{$env.NEXIT_BASE_URL}}/portal/tickets/{{$json.data.ticketId}} para revisar el informe y aprobar o rechazar."
      },
      "id": "email-esperando-validacion",
      "name": "Email revisar y aprobar",
      "type": "n8n-nodes-base.emailSend",
      "typeVersion": 2,
      "position": [1100, 40]
    },
    {
      "parameters": {
        "chatId": "={{$env.NEXIT_TELEGRAM_CHAT_ID}}",
        "text": "=🚨 SLA {{$json.data.estadoSla === 'vencido' ? 'VENCIDO' : 'en riesgo'}} - Ticket #{{$json.data.numeroTicket}} ({{$json.data.clienteNombre}})\nPrioridad: {{$json.data.prioridad}}\nTecnico: {{$json.data.tecnicoAsignadoNombre || 'SIN ASIGNAR'}}\nRestan: {{$json.data.minutosRestantes}} min"
      },
      "id": "telegram-alerta-sla",
      "name": "Telegram alerta SLA",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [880, 240]
    }
  ],
  "connections": {
    "Webhook NexIT": { "main": [[{ "node": "Verificar firma HMAC", "type": "main", "index": 0 }]] },
    "Verificar firma HMAC": { "main": [[{ "node": "Respond 200", "type": "main", "index": 0 }]] },
    "Respond 200": { "main": [[{ "node": "Switch por evento", "type": "main", "index": 0 }]] },
    "Switch por evento": {
      "main": [
        [{ "node": "IF origen PORTAL", "type": "main", "index": 0 }],
        [{ "node": "IF ESPERANDO_VALIDACION", "type": "main", "index": 0 }],
        [{ "node": "Telegram alerta SLA", "type": "main", "index": 0 }]
      ]
    },
    "IF origen PORTAL": { "main": [[{ "node": "Email confirmacion ticket", "type": "main", "index": 0 }], []] },
    "IF ESPERANDO_VALIDACION": { "main": [[{ "node": "Email revisar y aprobar", "type": "main", "index": 0 }], []] }
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
Asistente: Eso suele pasar cuando el UPS está a batería por un corte de luz.
           ¿Revisaste que haya corriente normal y que esté bien conectado?    [SUGERIR_SOLUCION]
Cliente:   Ya revisé, la corriente está bien y sigue pitando
Asistente: Entendido, voy a crear un ticket para que un técnico lo revise.
           ✅ Ticket #TCK-0006 creado (prioridad alta).                       [CREAR_TICKET]
```

Si en el primer intercambio el cliente hubiera contestado "ah listo, ya se apagó solo",
la IA habría respondido `CERRAR_SIN_TICKET` y ahí termina, sin generar nada en
`/admin/tickets`.

### b) Modelo de datos

`ConversacionChat` (una por cliente+canal, mientras esté `ACTIVA`) y
`MensajeConversacion` (cada turno, `rol` `USUARIO` o `ASISTENTE`). Una conversación
`ACTIVA` sin mensajes nuevos en más de 6 horas se da por abandonada — si el cliente
vuelve a escribir después, arranca una conversación nueva en vez de resucitar contexto
viejo. Al crear el ticket, la conversación pasa a `CONVERTIDA_A_TICKET` y queda
vinculada (`ticketId`) — puede usarse a futuro para mostrar la transcripción completa
en el detalle del ticket.

### c) Endpoints

Ambos protegidos con `WEBHOOK_SECRET`, igual que el resto de `/api/n8n/*`.

**`POST /api/n8n/conversacion/mensaje`** — body `{ canal, identificador, texto }`

Primer paso de cada mensaje entrante: resuelve el cliente, guarda `texto` como un
mensaje `USUARIO` (busca la conversación `ACTIVA` existente o crea una si no hay, o si
la que había quedó abandonada), y devuelve **todo el historial** + el contexto del
cliente (sucursales y sus activos) para que la IA decida con memoria real.

```json
// 200 — encontrado
{
  "encontrado": true,
  "conversacionId": "cmuluoqaj0001p40ujpv2csxe",
  "usuarioNombre": "Juan Pérez",
  "clienteNombre": "Constructora ABC S.A.",
  "sucursales": [{ "id": "...", "nombre": "Bodega Norte", "direccion": "...", "ciudad": "...", "activos": [{ "id": "...", "categoria": "UPS", "marca": "APC", "modelo": "Smart-UPS 3000VA" }] }],
  "historial": [
    { "rol": "USUARIO", "contenido": "Hola" },
    { "rol": "ASISTENTE", "contenido": "Hola Juan! Contame, ¿qué problema tenés con algún equipo?" },
    { "rol": "USUARIO", "contenido": "El UPS de la sala de servidores está pitando" }
  ],
  "canal": "TELEGRAM",
  "identificador": "999888777"
}

// 200 — no vinculado
{ "encontrado": false, "mensaje": "No encontramos tu número vinculado a NexIT...", "canal": "TELEGRAM", "identificador": "000000000" }
```

**`POST /api/n8n/conversacion/turno`** — body `{ conversacionId, accion, mensajeAsistente, ticket? }`

Persiste la respuesta de la IA (`mensajeAsistente`) como un mensaje `ASISTENTE`, y según
`accion`:

- `PREGUNTAR` / `SUGERIR_SOLUCION` — no hace nada más; la conversación sigue `ACTIVA`.
- `CERRAR_SIN_TICKET` — marca la conversación `RESUELTA_SIN_TICKET`.
- `CREAR_TICKET` — requiere `ticket: { titulo, descripcion, prioridad, sucursalId?, activoId?, tipo?, categoriaSoporte? }` (el schema lo exige con `.refine()` solo para esta acción). Crea el ticket (`origen: "CHATBOT"`), vincula la conversación (`CONVERTIDA_A_TICKET`), y dispara `TICKET_CREADO`. Mismo manejo de `SUCURSAL_AMBIGUA` que el flujo anterior si el cliente tiene más de una sede y la IA no mandó `sucursalId`.

```json
// 200 — CREAR_TICKET exitoso
{
  "ok": true,
  "ticketId": "...",
  "numeroTicket": "TCK-0006",
  "mensaje": "Entendido, voy a crear un ticket para que un técnico lo revise.\n\n✅ Ticket #TCK-0006 creado (prioridad alta). Te avisaremos cuando un técnico lo atienda.",
  "canal": "TELEGRAM",
  "identificador": "999888777"
}
```

Notá que `mensaje` en la respuesta es `mensajeAsistente` + un sufijo de confirmación que
arma NexIT (nunca la IA) — así el número de ticket que se le muestra al cliente es
siempre el real, nunca algo que el modelo podría llegar a inventar.

### d) El prompt: preguntar y sugerir antes de crear

El nodo "IA: decidir siguiente paso" le manda al modelo el historial completo + las
sucursales/activos del cliente, y le exige devolver un JSON con `accion` +`mensaje` +
`ticket` (null salvo que `accion = CREAR_TICKET`). Las reglas clave del prompt:

1. Un saludo o mensaje sin detalle técnico → `PREGUNTAR`, nunca crear ticket todavía.
2. Problema con una solución simple y segura para que el cliente pruebe él mismo
   (reiniciar, revisar corriente/cables) → `SUGERIR_SOLUCION` primero.
3. Sugerencia ya descartada por el cliente, o problema evidentemente grave (no
   enciende, olor a quemado, corte total) → recién ahí `CREAR_TICKET`.
4. Cliente dice que ya se resolvió → `CERRAR_SIN_TICKET`.

Ajustá este prompt libremente según el tipo de fallas más comunes de tus clientes —
está pensado como punto de partida, no como texto final.

### e) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ POST conversacion/mensaje → IF encontrado
Webhook WhatsApp (onReceived) ──→ Normalizar WhatsApp ─┘                     ├─ false → Switch por canal → responder
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
      "parameters": { "updates": ["message"] },
      "id": "telegram-trigger-cliente",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [0, -160],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "httpMethod": "POST", "path": "nexit-cliente-whatsapp-in", "responseMode": "onReceived" },
      "id": "webhook-whatsapp-cliente",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 160]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "TELEGRAM", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.message.chat.id }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.message.text }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-telegram-cliente",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, -160]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "WHATSAPP", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.body.From.replace('whatsapp:', '') }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.body.Body }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-whatsapp-cliente",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, 160]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/conversacion/mensaje",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, texto: $json.texto }) }}"
      },
      "id": "guardar-mensaje-cliente",
      "name": "Guardar mensaje",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.encontrado}}", "rightValue": true, "operator": { "type": "boolean", "operation": "true" } }] }
      },
      "id": "if-encontrado-cliente",
      "name": "IF encontrado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [660, 0]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $json;\nconst openaiKey = $env.OPENAI_API_KEY;\n\nconst historialTexto = contexto.historial.map((m) => `${m.rol === 'USUARIO' ? 'Cliente' : 'Asistente'}: ${m.contenido}`).join('\\n');\n\nconst prompt = `Sos el asistente de soporte tecnico de NexIT, atendiendo por chat a ${contexto.usuarioNombre} de ${contexto.clienteNombre}.\n\nSucursales y equipos (activos) de este cliente:\n${JSON.stringify(contexto.sucursales)}\n\nHistorial completo de la conversacion (el ultimo mensaje es el mas reciente):\n${historialTexto}\n\nTu trabajo, en este orden:\n1. Si el ultimo mensaje del cliente es un saludo o no tiene detalle tecnico (\"hola\", \"tengo un problema\"), NO crees un ticket todavia - respondé con una pregunta concreta para entender que pasa (que equipo, que sintoma exacto, desde cuando).\n2. Si ya entendiste el problema y existe una solucion simple y segura que el cliente pueda intentar el mismo (reiniciar el equipo, revisar que este enchufado/con corriente, verificar un cable), sugerisela y pregunta si funciono - todavia sin crear ticket.\n3. Si el cliente ya confirmo que la sugerencia no resolvio nada, o el problema es evidentemente grave o no autogestionable (no enciende, olor a quemado, chispas, corte total, dano fisico), crea el ticket con los datos ya reunidos en la conversacion. Prioriza ALTA o CRITICA para fallas totales/de seguridad, MEDIA para lo demas.\n4. Si el cliente dice que ya se solucino o no necesita nada mas, cerra la conversacion sin ticket.\n\nNunca inventes datos que el cliente no dio - si falta el nombre de la sede y el cliente tiene mas de una, deja sucursalId en null (el sistema le va a preguntar directamente cual es).\n\nDevolve SOLO un JSON con esta forma exacta:\n{\n  \"accion\": \"PREGUNTAR\" o \"SUGERIR_SOLUCION\" o \"CREAR_TICKET\" o \"CERRAR_SIN_TICKET\",\n  \"mensaje\": \"el texto que le vas a responder al cliente, en español, tono cordial y breve\",\n  \"ticket\": null o { \"titulo\": \"...\", \"descripcion\": \"...\", \"prioridad\": \"CRITICA\" o \"ALTA\" o \"MEDIA\" o \"BAJA\", \"sucursalId\": \"...\" o null, \"activoId\": \"...\" o null }\n}`;\n\nconst respuesta = await this.helpers.httpRequest({\n  method: 'POST',\n  url: 'https://api.openai.com/v1/chat/completions',\n  headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n  body: { model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt }] },\n  json: true,\n});\n\nconst ai = JSON.parse(respuesta.choices[0].message.content);\n\nreturn [{ json: {\n  conversacionId: contexto.conversacionId,\n  canal: contexto.canal,\n  identificador: contexto.identificador,\n  accion: ai.accion,\n  mensajeAsistente: ai.mensaje,\n  ticket: ai.ticket || undefined,\n} }];"
      },
      "id": "ia-decidir-paso",
      "name": "IA: decidir siguiente paso",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [880, -100]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/conversacion/turno",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ conversacionId: $json.conversacionId, accion: $json.accion, mensajeAsistente: $json.mensajeAsistente, ticket: $json.ticket }) }}"
      },
      "id": "guardar-turno-cliente",
      "name": "Guardar turno",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1100, -100]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "TELEGRAM", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "WHATSAPP", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-canal-cliente",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1320, 0]
    },
    {
      "parameters": { "chatId": "={{ $json.identificador }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-responder-cliente",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1540, -100],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "from": "whatsapp:+14155238886", "to": "=whatsapp:{{ $json.identificador }}", "message": "={{ $json.mensaje }}" },
      "id": "twilio-responder-cliente",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [1540, 100],
      "credentials": { "twilioApi": { "id": "REEMPLAZAR", "name": "NexIT Twilio" } }
    }
  ],
  "connections": {
    "Telegram Trigger": { "main": [[{ "node": "Normalizar Telegram", "type": "main", "index": 0 }]] },
    "Webhook WhatsApp (Twilio)": { "main": [[{ "node": "Normalizar WhatsApp", "type": "main", "index": 0 }]] },
    "Normalizar Telegram": { "main": [[{ "node": "Guardar mensaje", "type": "main", "index": 0 }]] },
    "Normalizar WhatsApp": { "main": [[{ "node": "Guardar mensaje", "type": "main", "index": 0 }]] },
    "Guardar mensaje": { "main": [[{ "node": "IF encontrado", "type": "main", "index": 0 }]] },
    "IF encontrado": {
      "main": [
        [{ "node": "IA: decidir siguiente paso", "type": "main", "index": 0 }],
        [{ "node": "Switch por canal", "type": "main", "index": 0 }]
      ]
    },
    "IA: decidir siguiente paso": { "main": [[{ "node": "Guardar turno", "type": "main", "index": 0 }]] },
    "Guardar turno": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Switch por canal": {
      "main": [
        [{ "node": "Telegram - Responder", "type": "main", "index": 0 }],
        [{ "node": "Twilio - Responder", "type": "main", "index": 0 }]
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
(no `RESUELTO`/`CERRADO`/`CANCELADO`). `texto`/`tieneFoto`/`fileId`/`mediaUrl` son puro
passthrough — el endpoint no los usa, solo los hace viajar de vuelta para que el paso
de IA los tenga disponibles después de esta llamada (mismo motivo que `texto` en
`contexto-cliente`: un HTTP Request de n8n reemplaza `$json` con la respuesta).

```json
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
IA) — podés reusar el mismo bot/número que ya configuraste para el flujo de clientes,
o crear uno separado si preferís mantenerlos distintos.

### c) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ GET tecnico/contexto → IF autorizado
Webhook WhatsApp (onReceived) ──→ Normalizar WhatsApp ─┘                 ├─ false → Switch por canal → responder
                                                                          └─ true  → IA: interpretar mensaje
                                                                                       (clasifica intención y, si
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
      "parameters": { "updates": ["message"] },
      "id": "telegram-trigger-tecnico",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [0, -160],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "httpMethod": "POST", "path": "nexit-tecnico-whatsapp-in", "responseMode": "onReceived" },
      "id": "webhook-whatsapp-tecnico",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 160]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "TELEGRAM", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.message.chat.id }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.message.text || $json.message.caption || '' }}", "type": "string" },
            { "id": "4", "name": "tieneFoto", "value": "={{ $json.message.photo ? 'true' : 'false' }}", "type": "string" },
            { "id": "5", "name": "fileId", "value": "={{ $json.message.photo ? $json.message.photo[$json.message.photo.length - 1].file_id : '' }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-telegram-tecnico",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, -160]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "WHATSAPP", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.body.From.replace('whatsapp:', '') }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.body.Body || '' }}", "type": "string" },
            { "id": "4", "name": "tieneFoto", "value": "={{ $json.body.NumMedia && $json.body.NumMedia !== '0' ? 'true' : 'false' }}", "type": "string" },
            { "id": "5", "name": "mediaUrl", "value": "={{ $json.body.MediaUrl0 || '' }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-whatsapp-tecnico",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, 160]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/contexto",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "canal", "value": "={{ $json.canal }}" },
            { "name": "identificador", "value": "={{ $json.identificador }}" },
            { "name": "texto", "value": "={{ $json.texto }}" },
            { "name": "tieneFoto", "value": "={{ $json.tieneFoto }}" },
            { "name": "fileId", "value": "={{ $json.fileId || '' }}" },
            { "name": "mediaUrl", "value": "={{ $json.mediaUrl || '' }}" }
          ]
        },
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] }
      },
      "id": "contexto-tecnico",
      "name": "Contexto técnico",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.autorizado}}", "rightValue": true, "operator": { "type": "boolean", "operation": "true" } }] }
      },
      "id": "if-autorizado-tecnico",
      "name": "IF autorizado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [660, 0]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $json;\nconst openaiKey = $env.OPENAI_API_KEY;\n\nlet imagenBase64 = null;\nconst contentType = 'image/jpeg';\n\nif (contexto.tieneFoto === 'true') {\n  if (contexto.canal === 'TELEGRAM') {\n    const token = $env.TELEGRAM_BOT_TOKEN;\n    const fileInfo = await this.helpers.httpRequest({ url: `https://api.telegram.org/bot${token}/getFile?file_id=${contexto.fileId}`, json: true });\n    const filePath = fileInfo.result.file_path;\n    const bytes = await this.helpers.httpRequest({ url: `https://api.telegram.org/file/bot${token}/${filePath}`, encoding: 'arraybuffer' });\n    imagenBase64 = Buffer.from(bytes).toString('base64');\n  } else {\n    const bytes = await this.helpers.httpRequest({\n      url: contexto.mediaUrl,\n      encoding: 'arraybuffer',\n      auth: { username: $env.TWILIO_ACCOUNT_SID, password: $env.TWILIO_AUTH_TOKEN },\n    });\n    imagenBase64 = Buffer.from(bytes).toString('base64');\n  }\n}\n\nconst prompt = `Sos un asistente para tecnicos de soporte que siguen sus tickets por chat.\nTickets asignados activos:\n${JSON.stringify(contexto.tickets)}\n\nMensaje del tecnico: \"${contexto.texto}\"\nTrae una foto adjunta?: ${contexto.tieneFoto === 'true' ? 'si' : 'no'}\n\nDevolve SOLO un JSON con esta forma:\n{\n  \"intencion\": \"LISTAR\" o \"CHECKIN\" o \"NOTA\" o \"EVIDENCIA\" o \"ERROR\",\n  \"numeroTicket\": \"TCK-0001\" o null,\n  \"comentario\": \"texto de la nota, solo si intencion=NOTA\"\n}\n\nReglas:\n- Si trae foto adjunta, intencion SIEMPRE es EVIDENCIA. Si el tecnico tiene un solo ticket activo usa ese numeroTicket aunque no lo haya escrito. Si tiene mas de uno, buscá el numero en el texto/caption; si no aparece, intencion=ERROR.\n- Si pregunta por sus tickets o dice algo como \"que tengo pendiente\", intencion=LISTAR.\n- Si dice que llego, que esta en sitio, que empieza a revisar, intencion=CHECKIN con el numeroTicket que mencione (o el unico ticket ASIGNADO si solo tiene uno).\n- Cualquier otro comentario sobre un ticket es intencion=NOTA.\n- Si no podes determinar de que ticket habla y hay mas de uno activo, intencion=ERROR.`;\n\nconst respuesta = await this.helpers.httpRequest({\n  method: 'POST',\n  url: 'https://api.openai.com/v1/chat/completions',\n  headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n  body: { model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: prompt }] },\n  json: true,\n});\n\nconst ai = JSON.parse(respuesta.choices[0].message.content);\n\nreturn [{ json: {\n  canal: contexto.canal,\n  identificador: contexto.identificador,\n  intencion: ai.intencion,\n  numeroTicket: ai.numeroTicket || null,\n  comentario: ai.comentario || null,\n  imagenBase64,\n  contentType,\n} }];"
      },
      "id": "ia-interpretar-tecnico",
      "name": "IA: interpretar mensaje",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [880, -100]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.intencion}}", "rightValue": "LISTAR", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.intencion}}", "rightValue": "CHECKIN", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.intencion}}", "rightValue": "NOTA", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.intencion}}", "rightValue": "EVIDENCIA", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        },
        "fallbackOutput": "extra"
      },
      "id": "switch-intencion",
      "name": "Switch por intención",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1100, -100]
    },
    {
      "parameters": {
        "jsCode": "const contexto = $('Contexto técnico').item.json;\nconst lineas = contexto.tickets.map((t) => `#${t.numeroTicket} - ${t.titulo} (${t.clienteNombre}, ${t.prioridad}, ${t.estado})`).join('\\n');\nreturn [{ json: {\n  canal: $json.canal,\n  identificador: $json.identificador,\n  mensaje: contexto.tickets.length ? `Tus tickets activos:\\n${lineas}` : 'No tenés tickets activos asignados.',\n} }];"
      },
      "id": "formatear-lista-tickets",
      "name": "Formatear lista de tickets",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1320, -280]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/checkin",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket }) }}"
      },
      "id": "post-checkin",
      "name": "POST check-in",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, -100]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/nota",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket, comentario: $json.comentario }) }}"
      },
      "id": "post-nota",
      "name": "POST nota",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, 60]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/tecnico/evidencia",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ canal: $json.canal, identificador: $json.identificador, numeroTicket: $json.numeroTicket, imagenBase64: $json.imagenBase64, contentType: $json.contentType }) }}"
      },
      "id": "post-evidencia",
      "name": "POST evidencia",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, 220]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "={{ $json.canal }}", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.identificador }}", "type": "string" },
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
      "position": [1320, 380]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "TELEGRAM", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "WHATSAPP", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-canal-tecnico",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1560, 0]
    },
    {
      "parameters": { "chatId": "={{ $json.identificador }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-responder-tecnico",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1780, -100],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "from": "whatsapp:+14155238886", "to": "=whatsapp:{{ $json.identificador }}", "message": "={{ $json.mensaje }}" },
      "id": "twilio-responder-tecnico",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [1780, 100],
      "credentials": { "twilioApi": { "id": "REEMPLAZAR", "name": "NexIT Twilio" } }
    }
  ],
  "connections": {
    "Telegram Trigger": { "main": [[{ "node": "Normalizar Telegram", "type": "main", "index": 0 }]] },
    "Webhook WhatsApp (Twilio)": { "main": [[{ "node": "Normalizar WhatsApp", "type": "main", "index": 0 }]] },
    "Normalizar Telegram": { "main": [[{ "node": "Contexto técnico", "type": "main", "index": 0 }]] },
    "Normalizar WhatsApp": { "main": [[{ "node": "Contexto técnico", "type": "main", "index": 0 }]] },
    "Contexto técnico": { "main": [[{ "node": "IF autorizado", "type": "main", "index": 0 }]] },
    "IF autorizado": {
      "main": [
        [{ "node": "IA: interpretar mensaje", "type": "main", "index": 0 }],
        [{ "node": "Switch por canal", "type": "main", "index": 0 }]
      ]
    },
    "IA: interpretar mensaje": { "main": [[{ "node": "Switch por intención", "type": "main", "index": 0 }]] },
    "Switch por intención": {
      "main": [
        [{ "node": "Formatear lista de tickets", "type": "main", "index": 0 }],
        [{ "node": "POST check-in", "type": "main", "index": 0 }],
        [{ "node": "POST nota", "type": "main", "index": 0 }],
        [{ "node": "POST evidencia", "type": "main", "index": 0 }],
        [{ "node": "Mensaje: no entendido", "type": "main", "index": 0 }]
      ]
    },
    "Formatear lista de tickets": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "POST check-in": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "POST nota": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "POST evidencia": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Mensaje: no entendido": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Switch por canal": {
      "main": [
        [{ "node": "Telegram - Responder", "type": "main", "index": 0 }],
        [{ "node": "Twilio - Responder", "type": "main", "index": 0 }]
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
                                                                         └─ true  → GET staff/resumen
                                                                                    → Responder consulta (comando fijo o IA libre)
                                                                                    → Switch por canal → responder
```

### d) JSON importable — consultas on-demand

[`n8n-workflows/5-staff-consultas.json`](./n8n-workflows/5-staff-consultas.json)

```json
{
  "name": "NexIT - Staff consultas por chat",
  "nodes": [
    {
      "parameters": { "updates": ["message"] },
      "id": "telegram-trigger-staff",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [0, -120],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "httpMethod": "POST", "path": "nexit-staff-whatsapp-in", "responseMode": "onReceived" },
      "id": "webhook-whatsapp-staff",
      "name": "Webhook WhatsApp (Twilio)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 120]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "TELEGRAM", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.message.chat.id }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.message.text }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-telegram-staff",
      "name": "Normalizar Telegram",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, -120]
    },
    {
      "parameters": {
        "assignments": {
          "assignments": [
            { "id": "1", "name": "canal", "value": "WHATSAPP", "type": "string" },
            { "id": "2", "name": "identificador", "value": "={{ $json.body.From.replace('whatsapp:', '') }}", "type": "string" },
            { "id": "3", "name": "texto", "value": "={{ $json.body.Body }}", "type": "string" }
          ]
        }
      },
      "id": "normalizar-whatsapp-staff",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, 120]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/verificar",
        "sendQuery": true,
        "queryParameters": {
          "parameters": [
            { "name": "canal", "value": "={{ $json.canal }}" },
            { "name": "identificador", "value": "={{ $json.identificador }}" },
            { "name": "texto", "value": "={{ $json.texto }}" }
          ]
        },
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] }
      },
      "id": "verificar-staff",
      "name": "Verificar staff",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.autorizado}}", "rightValue": true, "operator": { "type": "boolean", "operation": "true" } }] }
      },
      "id": "if-autorizado-staff",
      "name": "IF autorizado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [660, 0]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/resumen",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] }
      },
      "id": "get-resumen-staff",
      "name": "GET resumen",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, -100]
    },
    {
      "parameters": {
        "jsCode": "const resumen = $json;\nconst identidad = $('Verificar staff').item.json;\nconst texto = (identidad.texto || '').toLowerCase();\n\nfunction formatearAbiertos() {\n  const lineas = Object.entries(resumen.ticketsPorEstado).map(([k, v]) => `${k}: ${v}`).join('\\n');\n  return `Tickets por estado:\\n${lineas}`;\n}\nfunction formatearSla() {\n  const s = resumen.slaCumplimiento;\n  return s.resueltos === 0 ? 'Todavía no hay tickets resueltos para medir SLA.' : `Cumplimiento de SLA: ${s.pctCumplimiento}% (${s.cumplidos} de ${s.resueltos} resueltos a tiempo).`;\n}\nfunction formatearCriticos() {\n  if (!resumen.criticosSinAsignar.length) return 'No hay tickets críticos/altos sin asignar.';\n  const lineas = resumen.criticosSinAsignar.map((t) => `#${t.numeroTicket} - ${t.titulo} (${t.clienteNombre}, ${t.prioridad}, ${t.horasAbierto}h abierto)`).join('\\n');\n  return `Críticos/altos sin asignar:\\n${lineas}`;\n}\nfunction formatearCarga() {\n  if (!resumen.cargaPorTecnico.length) return 'Nadie tiene tickets activos ahora mismo.';\n  const lineas = resumen.cargaPorTecnico.map((t) => `${t.tecnico}: ${t.activos} activos, ${t.resueltosUltimos30Dias} resueltos (30d)`).join('\\n');\n  return `Carga por técnico:\\n${lineas}`;\n}\n\nlet mensaje = null;\nif (texto.includes('abiert')) mensaje = formatearAbiertos();\nelse if (texto.includes('sla')) mensaje = formatearSla();\nelse if (texto.includes('critic') || texto.includes('sin asignar')) mensaje = formatearCriticos();\nelse if (texto.includes('carga') || texto.includes('tecnico') || texto.includes('técnico')) mensaje = formatearCarga();\n\nif (!mensaje) {\n  const openaiKey = $env.OPENAI_API_KEY;\n  const prompt = `Sos un asistente que responde preguntas de un ${identidad.rol} de NexIT sobre el estado de los tickets, usando SOLO estos datos (no inventes nada que no este aca):\\n${JSON.stringify(resumen)}\\n\\nPregunta: \"${identidad.texto}\"\\n\\nRespondé en texto plano, corto y directo, en español.`;\n  const respuesta = await this.helpers.httpRequest({\n    method: 'POST',\n    url: 'https://api.openai.com/v1/chat/completions',\n    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },\n    body: { model: 'gpt-4o-mini', messages: [{ role: 'system', content: prompt }] },\n    json: true,\n  });\n  mensaje = respuesta.choices[0].message.content;\n}\n\nreturn [{ json: { canal: identidad.canal, identificador: identidad.identificador, mensaje } }];"
      },
      "id": "responder-consulta-staff",
      "name": "Responder consulta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1100, -100]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "TELEGRAM", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "WHATSAPP", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-canal-staff",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1320, 0]
    },
    {
      "parameters": { "chatId": "={{ $json.identificador }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-responder-staff",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1540, -100],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "from": "whatsapp:+14155238886", "to": "=whatsapp:{{ $json.identificador }}", "message": "={{ $json.mensaje }}" },
      "id": "twilio-responder-staff",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [1540, 100],
      "credentials": { "twilioApi": { "id": "REEMPLAZAR", "name": "NexIT Twilio" } }
    }
  ],
  "connections": {
    "Telegram Trigger": { "main": [[{ "node": "Normalizar Telegram", "type": "main", "index": 0 }]] },
    "Webhook WhatsApp (Twilio)": { "main": [[{ "node": "Normalizar WhatsApp", "type": "main", "index": 0 }]] },
    "Normalizar Telegram": { "main": [[{ "node": "Verificar staff", "type": "main", "index": 0 }]] },
    "Normalizar WhatsApp": { "main": [[{ "node": "Verificar staff", "type": "main", "index": 0 }]] },
    "Verificar staff": { "main": [[{ "node": "IF autorizado", "type": "main", "index": 0 }]] },
    "IF autorizado": {
      "main": [
        [{ "node": "GET resumen", "type": "main", "index": 0 }],
        [{ "node": "Switch por canal", "type": "main", "index": 0 }]
      ]
    },
    "GET resumen": { "main": [[{ "node": "Responder consulta", "type": "main", "index": 0 }]] },
    "Responder consulta": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Switch por canal": {
      "main": [
        [{ "node": "Telegram - Responder", "type": "main", "index": 0 }],
        [{ "node": "Twilio - Responder", "type": "main", "index": 0 }]
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
      "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 8 * * *" }] } },
      "id": "schedule-resumen-diario",
      "name": "Todos los días 8am",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/staff/resumen",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] }
      },
      "id": "get-resumen-diario",
      "name": "GET resumen",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [220, 0]
    },
    {
      "parameters": {
        "jsCode": "const r = $json;\nconst lineas = [\n  '📊 Resumen diario NexIT',\n  '',\n  `Tickets activos: ${r.ticketsActivos}`,\n  `Críticos/altos sin asignar: ${r.criticosSinAsignar.length}`,\n  `Cumplimiento SLA: ${r.slaCumplimiento.pctCumplimiento ?? '—'}%`,\n  `Preventivos vencidos: ${r.preventivosPorVigencia.vencido}`,\n];\nif (r.criticosSinAsignar.length) {\n  lineas.push('', 'Sin asignar:');\n  for (const t of r.criticosSinAsignar.slice(0, 5)) {\n    lineas.push(`- #${t.numeroTicket} (${t.clienteNombre}, ${t.prioridad}, ${t.horasAbierto}h)`);\n  }\n}\nreturn [{ json: { mensaje: lineas.join('\\n') } }];"
      },
      "id": "formatear-resumen-diario",
      "name": "Formatear resumen",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 0]
    },
    {
      "parameters": { "chatId": "={{ $env.NEXIT_TELEGRAM_CHAT_ID }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-resumen-diario",
      "name": "Telegram - Grupo",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [660, 0],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    }
  ],
  "connections": {
    "Todos los días 8am": { "main": [[{ "node": "GET resumen", "type": "main", "index": 0 }]] },
    "GET resumen": { "main": [[{ "node": "Formatear resumen", "type": "main", "index": 0 }]] },
    "Formatear resumen": { "main": [[{ "node": "Telegram - Grupo", "type": "main", "index": 0 }]] }
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
      "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 7 * * *" }] } },
      "id": "schedule-resumen-personalizado",
      "name": "Todos los días 7am",
      "type": "n8n-nodes-base.scheduleTrigger",
      "typeVersion": 1.2,
      "position": [0, 0]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/resumen-diario",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] }
      },
      "id": "get-resumen-diario-personalizado",
      "name": "GET resumen diario",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [220, 0]
    },
    {
      "parameters": {
        "jsCode": "const data = $json;\nconst items = [];\n\nfunction agregarDestino(canal, identificador, mensaje) {\n  if (!identificador) return;\n  items.push({ json: { canal, identificador, mensaje } });\n}\n\nfor (const t of data.tecnicos) {\n  const lineasTickets = t.ticketsHoy.length\n    ? t.ticketsHoy.map((tk) => {\n        const alerta = tk.estadoSla === 'vencido' ? ' ⚠️ SLA VENCIDO' : tk.estadoSla === 'en_riesgo' ? ' ⏰ SLA en riesgo' : '';\n        return `- #${tk.numeroTicket} ${tk.titulo} (${tk.clienteNombre}, ${tk.prioridad})${alerta}`;\n      }).join('\\n')\n    : 'Sin tickets activos asignados.';\n  const lineasPreventivos = t.preventivosProximos.length\n    ? t.preventivosProximos.map((p) => `- ${p.titulo} (${p.clienteNombre}) — ${p.proximaFecha}`).join('\\n')\n    : null;\n\n  let mensaje = `☀️ Buenos días ${t.usuarioNombre.split(' ')[0]}, tus tickets activos:\\n${lineasTickets}`;\n  if (lineasPreventivos) mensaje += `\\n\\nPreventivos próximos (7 días):\\n${lineasPreventivos}`;\n\n  agregarDestino('TELEGRAM', t.telegramChatId, mensaje);\n  agregarDestino('WHATSAPP', t.whatsappTelefono, mensaje);\n}\n\nfor (const s of data.staff) {\n  const r = s.resumen;\n  const mensaje = `📊 Resumen diario NexIT\\n\\nTickets activos: ${r.ticketsActivos}\\nCríticos/altos sin asignar: ${r.criticosSinAsignar.length}\\nCumplimiento SLA: ${r.slaCumplimiento.pctCumplimiento ?? '—'}%\\nPreventivos vencidos: ${r.preventivosPorVigencia.vencido}`;\n  agregarDestino('TELEGRAM', s.telegramChatId, mensaje);\n  agregarDestino('WHATSAPP', s.whatsappTelefono, mensaje);\n}\n\nreturn items;"
      },
      "id": "aplanar-destinatarios",
      "name": "Aplanar destinatarios",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [440, 0]
    },
    {
      "parameters": {
        "rules": {
          "values": [
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "TELEGRAM", "operator": { "type": "string", "operation": "equals" } }] } },
            { "conditions": { "conditions": [{ "leftValue": "={{$json.canal}}", "rightValue": "WHATSAPP", "operator": { "type": "string", "operation": "equals" } }] } }
          ]
        }
      },
      "id": "switch-canal-resumen-personalizado",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [660, 0]
    },
    {
      "parameters": { "chatId": "={{ $json.identificador }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-resumen-personalizado",
      "name": "Telegram - Enviar",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [880, -100],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "from": "whatsapp:+14155238886", "to": "=whatsapp:{{ $json.identificador }}", "message": "={{ $json.mensaje }}" },
      "id": "twilio-resumen-personalizado",
      "name": "Twilio - Enviar",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [880, 100],
      "credentials": { "twilioApi": { "id": "REEMPLAZAR", "name": "NexIT Twilio" } }
    }
  ],
  "connections": {
    "Todos los días 7am": { "main": [[{ "node": "GET resumen diario", "type": "main", "index": 0 }]] },
    "GET resumen diario": { "main": [[{ "node": "Aplanar destinatarios", "type": "main", "index": 0 }]] },
    "Aplanar destinatarios": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Switch por canal": {
      "main": [
        [{ "node": "Telegram - Enviar", "type": "main", "index": 0 }],
        [{ "node": "Twilio - Enviar", "type": "main", "index": 0 }]
      ]
    }
  }
}
```
