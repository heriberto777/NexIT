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

## 6. Asistente de IA por Telegram y WhatsApp (crear tickets por chat)

A diferencia de los workflows 1 y 2 (NexIT → n8n, notificaciones salientes), este es
**entrante**: un cliente le escribe a un bot de Telegram o a un número de WhatsApp,
un paso de IA interpreta el mensaje, y n8n crea el ticket en NexIT por API — sin que
el cliente entre al portal.

### a) Cómo un cliente se vincula

Cualquier usuario (los 4 roles) puede cargar su Telegram Chat ID y/o su teléfono de
WhatsApp desde `/perfil` → "Notificaciones por chat". Solo usuarios con rol `CLIENTE`
pueden crear tickets por este canal (mismo criterio que el portal de auto-servicio);
Admin/Coordinador/Técnico pueden vincular los campos igual, pero solo para *recibir*
las notificaciones salientes de §3.d, no para crear tickets por chat.

Para conseguir un chat_id de Telegram, el cliente le escribe a `@userinfobot` (o a tu
propio bot) y copia el número que le devuelve.

### b) Los dos endpoints que expone NexIT para este flujo

Ambos, igual que `/api/cron/sla-check`, se protegen con el mismo `WEBHOOK_SECRET`
(`Authorization: Bearer <secret>`) configurado en `/admin/configuracion` — no hay
sesión de usuario porque los golpea n8n, no un navegador.

**`GET /api/n8n/contexto-cliente?canal=TELEGRAM|WHATSAPP&identificador=...&texto=...`**

Resuelve `identificador` (chat_id de Telegram o teléfono de WhatsApp, tal cual llega
del mensaje) a un cliente de NexIT, y le da al paso de IA el contexto que necesita
para interpretar el mensaje (sus sucursales y activos, para resolver referencias como
"el aire acondicionado del piso 2" a un `activoId` real). `texto` es opcional y viaja
sin usarse — ver la nota de "por qué `texto` viaja de ida y vuelta" más abajo.

```json
// 200 — encontrado
{
  "encontrado": true,
  "canal": "TELEGRAM",
  "identificador": "999888777",
  "texto": "se dañó el aire acondicionado del piso 2",
  "usuarioNombre": "Juan Pérez",
  "clienteId": "cmue6oofs...",
  "clienteNombre": "Constructora ABC S.A.",
  "sucursales": [
    {
      "id": "cmue6oohm...",
      "nombre": "Bodega Norte",
      "direccion": "Av. Industrial 450",
      "ciudad": "Lima",
      "activos": [{ "id": "cmue6ooqu...", "categoria": "UPS", "marca": "APC", "modelo": "Smart-UPS 3000VA" }]
    }
  ]
}

// 200 — no vinculado (o usuario inactivo)
{
  "encontrado": false,
  "mensaje": "No encontramos tu número vinculado a NexIT. Pedile a soporte que lo configure en tu perfil.",
  "canal": "TELEGRAM",
  "identificador": "000000000",
  "texto": "..."
}
```

**`POST /api/n8n/crear-ticket-chat`**

Crea el ticket (`origen: "CHATBOT"`) una vez que la IA ya extrajo los campos del
mensaje. `tipo`/`categoriaSoporte`/`prioridad` tienen default (`CORRECTIVO`/
`SOFTWARE`/`MEDIA`) por si la IA no los infiere. Si el cliente tiene más de una
sucursal y no mandaste `sucursalId`, responde `422 SUCURSAL_AMBIGUA` con la lista de
sucursales — tu workflow debe volver a preguntarle al usuario cuál es, no reintentar
solo.

```json
// body
{
  "canal": "TELEGRAM",
  "identificador": "999888777",
  "titulo": "Aire acondicionado no enfría — piso 2",
  "descripcion": "El cliente reporta que el aire acondicionado del piso 2 dejó de enfriar desde esta mañana.",
  "prioridad": "MEDIA",
  "sucursalId": "cmue6oohm..."
}

// 200 — éxito
{
  "ok": true,
  "ticketId": "...",
  "numeroTicket": "TCK-0007",
  "mensaje": "Listo, creé el ticket #TCK-0007 con prioridad media. Te avisaremos cuando un técnico lo atienda.",
  "canal": "TELEGRAM",
  "identificador": "999888777"
}

// 422 — sucursal ambigua
{
  "ok": false,
  "error": "SUCURSAL_AMBIGUA",
  "mensaje": "¿De cuál de tus sedes es el problema?",
  "opciones": [{ "id": "...", "nombre": "Bodega Norte" }, { "id": "...", "nombre": "Sede Central" }],
  "canal": "TELEGRAM",
  "identificador": "999888777"
}
```

Todas las respuestas de ambos endpoints (éxito o error) traen siempre `canal` +
`identificador` (y `contexto-cliente` también `texto`) — es **intencional**: un nodo
HTTP Request de n8n reemplaza `$json` con el body de la respuesta, así que sin este
eco los pasos siguientes del workflow perderían de vista "a quién había que
responderle" apenas pasara por el primer HTTP Request. Evita tener que referenciar por
nombre un nodo Trigger anterior con `$('Nombre del nodo')`, algo que en n8n **falla**
si ese nodo no corrió en la ejecución actual — y como Telegram Trigger y el Webhook de
WhatsApp son mutuamente excluyentes (una ejecución viene de uno o del otro, nunca de
ambos), esa referencia rompería la mitad de las ejecuciones.

### c) Prerrequisitos

- **Bot de Telegram**: hablale a `@BotFather` en Telegram, `/newbot`, copiá el token.
  Se usa como credencial **Telegram API** en n8n.
- **WhatsApp vía Twilio**: una cuenta de Twilio con el *WhatsApp Sandbox* activado
  (gratis para pruebas: Twilio Console → Messaging → Try it out → Send a WhatsApp
  message; el cliente de prueba manda "join &lt;código&gt;" al número sandbox una vez).
  Necesitás el **Account SID** y el **Auth Token** (credencial **Twilio API** en n8n) y
  el número sandbox (`whatsapp:+14155238886` por defecto).
- **IA**: una API key de OpenAI (u otro proveedor con una API de chat compatible —
  ajustá la URL/body del nodo HTTP Request del paso de IA si usás otro). Se usa como
  credencial **Header Auth** (`Name: Authorization`, `Value: Bearer <tu API key>`).

### d) Diagrama

```
Telegram Trigger ──→ Normalizar Telegram ──┐
                                             ├─→ GET contexto-cliente → IF encontrado
Webhook (WhatsApp/Twilio, responseMode:    ─┘                           ├─ false → Switch por canal
  "onReceived") ──→ Normalizar WhatsApp                                 └─ true  → POST IA (extraer)
                                                                                      → Code (parsear JSON de la IA)
                                                                                      → POST crear-ticket-chat
                                                                                      → Switch por canal
                                                                        Switch por canal
                                                                          ├─ TELEGRAM → Telegram sendMessage
                                                                          └─ WHATSAPP → Twilio (sendMessage)
```

`responseMode: "onReceived"` en el Webhook de WhatsApp es a propósito: Twilio espera
una respuesta rápida (~15s) a su POST entrante; con "onReceived" n8n le contesta 200 OK
apenas recibe el mensaje y sigue procesando el resto del workflow (IA, crear ticket,
responder) en segundo plano — así no hay riesgo de que Twilio marque el webhook como
fallido si la IA tarda.

### e) JSON importable (punto de partida)

Igual que en §5: después de importar hace falta crear/asignar las credenciales
(Telegram API, Twilio API, tu proveedor de IA), reemplazar
`https://nexit.tuempresa.com` por tu dominio real, y revisar los nombres exactos de
campo del nodo Webhook/IF/Switch según tu versión de n8n.

```json
{
  "name": "NexIT - Asistente IA Telegram/WhatsApp",
  "nodes": [
    {
      "parameters": { "updates": ["message"] },
      "id": "telegram-trigger",
      "name": "Telegram Trigger",
      "type": "n8n-nodes-base.telegramTrigger",
      "typeVersion": 1.1,
      "position": [0, -160],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "httpMethod": "POST", "path": "nexit-whatsapp-in", "responseMode": "onReceived" },
      "id": "webhook-whatsapp",
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
      "id": "normalizar-telegram",
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
      "id": "normalizar-whatsapp",
      "name": "Normalizar WhatsApp",
      "type": "n8n-nodes-base.set",
      "typeVersion": 3.4,
      "position": [220, 160]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "https://nexit.tuempresa.com/api/n8n/contexto-cliente",
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
      "id": "contexto-cliente",
      "name": "Contexto cliente",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [440, 0]
    },
    {
      "parameters": {
        "conditions": { "conditions": [{ "leftValue": "={{$json.encontrado}}", "rightValue": true, "operator": { "type": "boolean", "operation": "true" } }] }
      },
      "id": "if-encontrado",
      "name": "IF encontrado",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [660, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [ { role: 'system', content: 'Sos un asistente que extrae datos de tickets de soporte tecnico a partir de un mensaje de chat de un cliente. Devolve SOLO un JSON con las claves: titulo (string, maximo 120 caracteres), descripcion (string, el problema reescrito claramente), prioridad (uno de CRITICA, ALTA, MEDIA, BAJA - usa CRITICA solo si implica una interrupcion total del servicio), tipo (siempre CORRECTIVO), sucursalId (el id de la sucursal mencionada de esta lista, o null si no esta claro), activoId (el id del activo mencionado de esta lista, o null si no esta claro). Sucursales y activos disponibles: ' + JSON.stringify($json.sucursales) }, { role: 'user', content: $json.texto } ] }) }}"
      },
      "id": "ia-extraer",
      "name": "IA - Extraer datos del ticket",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [880, -100],
      "credentials": { "httpHeaderAuth": { "id": "REEMPLAZAR", "name": "OpenAI API Key" } }
    },
    {
      "parameters": {
        "jsCode": "const ai = JSON.parse($input.first().json.choices[0].message.content);\nconst contexto = $('Contexto cliente').item.json;\nreturn [{ json: {\n  canal: contexto.canal,\n  identificador: contexto.identificador,\n  titulo: ai.titulo,\n  descripcion: ai.descripcion,\n  prioridad: ai.prioridad || 'MEDIA',\n  tipo: ai.tipo || 'CORRECTIVO',\n  sucursalId: ai.sucursalId || undefined,\n  activoId: ai.activoId || undefined,\n} }];"
      },
      "id": "parsear-ia",
      "name": "Parsear respuesta IA",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1100, -100]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://nexit.tuempresa.com/api/n8n/crear-ticket-chat",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $env.WEBHOOK_SECRET }}" }] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json) }}"
      },
      "id": "crear-ticket-chat",
      "name": "Crear ticket (chat)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [1320, -100]
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
      "id": "switch-canal",
      "name": "Switch por canal",
      "type": "n8n-nodes-base.switch",
      "typeVersion": 3,
      "position": [1320, 200]
    },
    {
      "parameters": { "chatId": "={{ $json.identificador }}", "text": "={{ $json.mensaje }}" },
      "id": "telegram-responder",
      "name": "Telegram - Responder",
      "type": "n8n-nodes-base.telegram",
      "typeVersion": 1.2,
      "position": [1540, 100],
      "credentials": { "telegramApi": { "id": "REEMPLAZAR", "name": "NexIT Telegram Bot" } }
    },
    {
      "parameters": { "from": "whatsapp:+14155238886", "to": "=whatsapp:{{ $json.identificador }}", "message": "={{ $json.mensaje }}" },
      "id": "twilio-responder",
      "name": "Twilio - Responder",
      "type": "n8n-nodes-base.twilio",
      "typeVersion": 1,
      "position": [1540, 300],
      "credentials": { "twilioApi": { "id": "REEMPLAZAR", "name": "NexIT Twilio" } }
    }
  ],
  "connections": {
    "Telegram Trigger": { "main": [[{ "node": "Normalizar Telegram", "type": "main", "index": 0 }]] },
    "Webhook WhatsApp (Twilio)": { "main": [[{ "node": "Normalizar WhatsApp", "type": "main", "index": 0 }]] },
    "Normalizar Telegram": { "main": [[{ "node": "Contexto cliente", "type": "main", "index": 0 }]] },
    "Normalizar WhatsApp": { "main": [[{ "node": "Contexto cliente", "type": "main", "index": 0 }]] },
    "Contexto cliente": { "main": [[{ "node": "IF encontrado", "type": "main", "index": 0 }]] },
    "IF encontrado": {
      "main": [
        [{ "node": "IA - Extraer datos del ticket", "type": "main", "index": 0 }],
        [{ "node": "Switch por canal", "type": "main", "index": 0 }]
      ]
    },
    "IA - Extraer datos del ticket": { "main": [[{ "node": "Parsear respuesta IA", "type": "main", "index": 0 }]] },
    "Parsear respuesta IA": { "main": [[{ "node": "Crear ticket (chat)", "type": "main", "index": 0 }]] },
    "Crear ticket (chat)": { "main": [[{ "node": "Switch por canal", "type": "main", "index": 0 }]] },
    "Switch por canal": {
      "main": [
        [{ "node": "Telegram - Responder", "type": "main", "index": 0 }],
        [{ "node": "Twilio - Responder", "type": "main", "index": 0 }]
      ]
    }
  }
}
```

### f) Probar sin gastar en WhatsApp real

El WhatsApp Sandbox de Twilio es gratis y no requiere aprobación de Meta — alcanza
para todo este flujo en desarrollo. Para producción con un número propio hace falta
pasar por el proceso de verificación de WhatsApp Business de Meta (vía Twilio o
directo); el nodo/credencial de Twilio en n8n no cambia, solo el número `from`.

Para Telegram no hace falta nada especial: un bot de `@BotFather` funciona igual en
desarrollo y producción.
