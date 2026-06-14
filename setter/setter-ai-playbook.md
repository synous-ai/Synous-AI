# Setter AI desde cero — Playbook de ingeniería + seteo

> Cómo recrear un sistema tipo Setter AI (trysetter.com) pensando como senior dev y senior setter a la vez.
> Stack base: Node + Fastify + TypeScript · Gemini (Vertex AI) · PostgreSQL + Prisma · Redis + BullMQ · WhatsApp Cloud API.
> Foco: LATAM (Argentina), WhatsApp como canal de primera clase, multi-tenant white-label.

---

## 0. Las 3 restricciones que definen toda la arquitectura

Antes de modelar una sola tabla, internalizá esto. No son detalles legales: son el esqueleto del diseño.

| Restricción | Qué implica en el código |
|---|---|
| **Meta prohíbe IA de propósito general (15-ene-2026), pero permite IA con propósito definido (calificación + booking).** | El agente NO puede ser un LLM libre. Tiene que estar scopeado por system prompt + tools acotadas + guardrails. Y si el lead pregunta si es un bot, **respondé la verdad** (no mientas: es policy y además convierte mejor de lo que pensás). |
| **Pricing per-message. La ventana de servicio (24hs desde el último mensaje del lead) permite responder gratis con free-form. Fuera de la ventana solo entran templates pagos.** | Todo el motor de follow-up se diseña para **maximizar trabajo dentro de la ventana gratis** y gastar templates solo para reabrir ventana cuando el lead se enfría. |
| **Cap ~2 templates marketing por usuario / 24hs (error 131049). No se esquiva.** | No podés brutear con templates. La cadencia de re-engagement tiene que ser quirúrgica y priorizar utility > marketing. |

**La regla de oro económica:** un lead que responde mantiene la ventana abierta → conversás gratis. Un lead que se calla cierra la ventana → cada reintento cuesta un template. Por eso el diseño del setter prioriza **provocar respuesta** (preguntas abiertas, micro-compromisos), no solo "mandar mensajes".

---

## 1. Arquitectura general

```
                         ┌─────────────────────────────────────────────┐
   Lead forms            │                 INGRESS                       │
   (Meta Lead Ads,       │  POST /webhooks/forms  ──┐                   │
    LinkedIn, web,       │  POST /webhooks/whatsapp ─┤                   │
    Tiendanube, etc.)    │       (verify + HMAC)     │                   │
        │                └───────────────────────────┼───────────────────┘
        ▼                                            ▼
   ┌─────────┐     enqueue          ┌──────────────────────────┐
   │  Queue  │◄────────────────────►│   Redis + BullMQ          │
   │ workers │                      │   - inbound-message       │
   └────┬────┘                      │   - outbound-send         │
        │                           │   - follow-up (delayed)   │
        ▼                           │   - reminder (delayed)    │
   ┌──────────────────────┐         └──────────────────────────┘
   │  Conversation Engine  │
   │  (el "cerebro")       │──► Gemini / Vertex AI (function calling)
   │  - load context       │        tools: check_availability,
   │  - run agent loop      │              book_appointment,
   │  - execute tools       │              save_qualification,
   │  - persist             │              handoff_to_human,
   └───────┬───────────────┘              mark_not_interested
           │
     ┌─────┴──────┬───────────────┬──────────────┐
     ▼            ▼               ▼              ▼
  WhatsApp     Calendar        Postgres       Human inbox
  Cloud API   (GCal/Calendly)  (Prisma)      (handoff UI)
```

Principios:
- **Todo asíncrono.** El webhook responde `200` en <5s y delega a la cola. Nunca llamás al LLM dentro del request del webhook (Meta reintenta y te duplica eventos).
- **Idempotencia en serio.** Meta reentrega webhooks. Guardás `wa_message_id` con unique constraint y descartás duplicados.
- **El estado vive en Postgres, no en el LLM.** El LLM es stateless; en cada turno le reconstruís el contexto. La fuente de verdad del stage del lead es una state machine en DB.

---

## 2. Modelo de dominio (Prisma)

```prisma
model Tenant {
  id            String   @id @default(cuid())
  name          String
  timezone      String   @default("America/Argentina/Buenos_Aires")
  wabaId        String   // WhatsApp Business Account ID
  phoneNumberId String   // de Meta
  calendarType  CalendarType @default(GOOGLE)
  // Config del negocio que el agente "conoce"
  businessBrief String   @db.Text  // qué vende, ICP, qué califica un lead, FAQs
  bookingUrl    String?  // Calendly fallback
  leads         Lead[]
  templates     WhatsappTemplate[]
}

enum CalendarType { GOOGLE CALENDLY }

model Lead {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  phone         String   // E.164: +549...
  name          String?
  source        String   // "meta_lead_ads" | "web_form" | ...
  status        LeadStatus @default(NEW)
  // Datos de calificación, estructurados por el agente vía tool
  qualification Json?    // { pain, budget, authority, timing, fit, notes }
  timezone      String?  // si difiere del tenant
  windowExpiresAt DateTime? // cuándo cierra la ventana de 24hs (último msg del lead +24h)
  conversation  Conversation?
  appointment   Appointment?
  followUps     FollowUp[]
  createdAt     DateTime @default(now())
  @@unique([tenantId, phone])
  @@index([status])
  @@index([windowExpiresAt])
}

enum LeadStatus {
  NEW            // recién entró, todavía no contactado
  CONTACTED      // se mandó la apertura
  ENGAGED        // respondió al menos una vez
  QUALIFYING     // en medio de la calificación
  QUALIFIED      // pasó el filtro, listo para booking
  BOOKING        // proponiendo/confirmando slot
  BOOKED         // turno agendado
  NO_SHOW        // no apareció
  NOT_INTERESTED // descartado
  UNRESPONSIVE   // agotó la cadencia de follow-up
  HANDED_OFF     // pasó a humano
}

model Conversation {
  id        String    @id @default(cuid())
  leadId    String    @unique
  lead      Lead      @relation(fields: [leadId], references: [id])
  messages  Message[]
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           MsgRole  // USER | ASSISTANT | SYSTEM | TOOL
  content        String   @db.Text
  waMessageId    String?  @unique   // idempotencia
  isTemplate     Boolean  @default(false)
  templateName   String?
  costCents      Int?     // para tracking de costo por lead
  createdAt      DateTime @default(now())
  @@index([conversationId, createdAt])
}

enum MsgRole { USER ASSISTANT SYSTEM TOOL }

model Appointment {
  id          String   @id @default(cuid())
  leadId      String   @unique
  startsAt    DateTime
  endsAt      DateTime
  calendarRef String?  // event id de GCal / Calendly
  status      String   @default("confirmed")
}

model FollowUp {
  id         String   @id @default(cuid())
  leadId     String
  lead       Lead     @relation(fields: [leadId], references: [id])
  stepIndex  Int      // 0,1,2,3...
  scheduledAt DateTime
  channel    String   @default("whatsapp")
  status     String   @default("scheduled") // scheduled|sent|cancelled
  jobId      String?  // BullMQ job id, para cancelar si el lead responde
}

model WhatsappTemplate {
  id         String  @id @default(cuid())
  tenantId   String
  tenant     Tenant  @relation(fields: [tenantId], references: [id])
  name       String  // nombre aprobado en Meta
  category   String  // UTILITY | MARKETING | AUTHENTICATION
  language   String  @default("es_AR")
  bodyVars   Int     @default(0)
}
```

Decisión de diseño: `qualification` como `Json` te da flexibilidad multi-tenant (cada negocio califica distinto) sin migrar el schema. Si después querés reporting fuerte, materializás campos.

---

## 3. Ingreso del lead y speed-to-lead

El diferencial #1 de un setter no es el copy: es la **latencia**. El claim de Setter AI de "10 segundos" no es marketing vacío — la curva de decaimiento de leads es brutal (responder en <1 min vs. >5 min cambia la conversión por un múltiplo). Tu objetivo de ingeniería: **del POST del form al primer mensaje en WhatsApp, <30s p95.**

```ts
// POST /webhooks/forms  (Fastify)
app.post('/webhooks/forms', async (req, reply) => {
  const { tenantId, phone, name, source, formData } = parseInbound(req);
  reply.code(200).send({ ok: true });           // 1. respondé YA

  const lead = await prisma.lead.upsert({         // 2. idempotente por (tenant, phone)
    where: { tenantId_phone: { tenantId, phone } },
    update: { source },
    create: { tenantId, phone, name, source, status: 'NEW',
              conversation: { create: {} } },
  });

  await inboundQueue.add('open-lead', { leadId: lead.id }, {
    jobId: `open-${lead.id}`,                      // idempotencia en la cola
    removeOnComplete: true,
  });
});
```

El worker `open-lead` arma la apertura (ver §6) y la manda. Como es un lead nuevo que vino de un form donde **dejó su número y opt-in**, podés iniciar conversación — pero si el opt-in no es claro o pasó tiempo, el primer toque tiene que ser un **template aprobado** (business-initiated). Si el lead viene de un *click-to-WhatsApp ad* o te escribió él, ya tenés ventana abierta y arrancás free-form gratis.

---

## 4. WhatsApp Cloud API — lo que importa de verdad

```ts
// POST /webhooks/whatsapp
// GET para verificación (hub.challenge); POST para eventos.
app.post('/webhooks/whatsapp', async (req, reply) => {
  if (!verifyMetaSignature(req)) return reply.code(401).send();
  reply.code(200).send();                          // siempre 200 rápido

  for (const entry of req.body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value;
      // Mensajes entrantes del lead
      for (const m of v.messages ?? []) {
        await inboundQueue.add('handle-message', {
          phoneNumberId: v.metadata.phone_number_id,
          from: m.from, waMessageId: m.id,
          text: extractText(m),                    // text | button | interactive
        }, { jobId: m.id });                        // dedupe por message id
      }
      // Statuses (sent/delivered/read/failed) → tracking de costo y errores
      for (const s of v.statuses ?? []) {
        await recordStatus(s);                      // captura 131049, fallos, costo
      }
    }
  }
});
```

Reglas que codificás como invariantes:
- **Ventana de 24hs:** cada vez que llega un `message` del lead, actualizás `lead.windowExpiresAt = now + 24h`. Antes de mandar cualquier cosa, el sender chequea: ¿hay ventana abierta? → free-form gratis. ¿Cerrada? → solo template aprobado (y registrás el costo).
- **Template selection:** preferí categoría `UTILITY` (recordatorios, confirmaciones) que es mucho más barata y dentro de ventana suele ser gratis; reservá `MARKETING` para reactivar leads fríos.
- **Manejo de 131049** (cap de marketing): si el status vuelve con ese error, no reintentes con otro template; marcá el lead para esperar o para handoff.
- **Quality rating:** Meta te puntúa (verde/amarillo/rojo) según bloqueos y reportes. Un setter que spamea baja el rating y te limita. Esto refuerza: calidad de conversación > volumen.

---

## 5. El cerebro: el agente conversacional

### 5.1 Por qué NO un LLM libre

Tres razones convergen al mismo diseño:
1. **Compliance Meta**: tiene que ser purpose-driven, no open-domain.
2. **Confiabilidad**: un LLM suelto inventa slots, promete precios, se va de tema. En seteo eso es plata perdida.
3. **Costo/control**: querés que las acciones (agendar, calificar) sean deterministas, no "texto que parece que agendó".

Solución: **LLM como motor de lenguaje, tools deterministas para las acciones, state machine para el control de flujo.** El LLM decide *qué decir* y *qué tool llamar*; el sistema decide *qué se puede hacer* en cada estado.

### 5.2 El loop del agente

```ts
async function runAgentTurn(leadId: string, userText: string) {
  const lead = await loadLeadWithContext(leadId);   // lead + tenant + últimos N msgs
  const history = toGeminiHistory(lead.conversation.messages);

  const tools = [checkAvailability, bookAppointment,
                 saveQualification, handoffToHuman, markNotInterested];

  let response = await gemini.generateContent({
    model: 'gemini-3.1-pro',                          // tu stack en Vertex
    systemInstruction: buildSystemPrompt(lead),       // ver §5.3
    contents: [...history, { role: 'user', parts: [{ text: userText }] }],
    tools: [{ functionDeclarations: tools.map(t => t.decl) }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 400 },
  });

  // Bucle de tool-calling (máx 2-3 hops para evitar loops)
  for (let hop = 0; hop < 3; hop++) {
    const call = extractFunctionCall(response);
    if (!call) break;
    const result = await executeTool(call, lead);     // ejecución determinista
    response = await gemini.generateContent({
      systemInstruction: buildSystemPrompt(lead),
      contents: [...history, userTurn(userText),
                 modelTurn(call), functionResponse(call.name, result)],
      tools: [{ functionDeclarations: tools.map(t => t.decl) }],
    });
  }

  const reply = extractText(response);
  await persistAndSend(lead, userText, reply, response.functionCalls);
  await advanceStateMachine(lead, response);          // actualiza LeadStatus
  await cancelPendingFollowUps(lead.id);              // respondió → no lo molestes
}
```

Detalle crítico: **temperature baja (0.3–0.5)**. Un setter no improvisa, ejecuta un framework. Y `maxOutputTokens` corto: los mensajes de WhatsApp son breves; un párrafo de 6 líneas grita "bot".

### 5.3 System prompt de referencia (rioplatense, B2B)

```
Sos {AGENT_NAME}, del equipo de {BUSINESS_NAME}. Tu único trabajo es:
calificar al lead y, si es buen fit, agendar una llamada con el equipo.
NO sos un asistente general. No respondas temas fuera del negocio.

CONTEXTO DEL NEGOCIO:
{businessBrief}  // qué vende, ICP, qué hace que un lead califique, FAQs

REGLAS DE CONVERSACIÓN:
- Hablás en español rioplatense, vos (nunca tú). Tono profesional pero cercano,
  como un humano del equipo comercial. Mensajes CORTOS (1-3 líneas). Una idea por mensaje.
- UNA pregunta por mensaje. Nunca interrogues con listas.
- Si te preguntan si sos una IA/bot, decí la verdad con naturalidad. No mientas.
- Nunca inventes precios, disponibilidad, ni detalles que no estén en el contexto.
  Para disponibilidad usá SIEMPRE la tool check_availability. Para agendar, book_appointment.
- No prometas nada que el negocio no ofrezca.

FLUJO (no es un script rígido, es un objetivo):
1. Apertura: referenciá lo concreto por lo que dejó sus datos. Bajá fricción. 1 pregunta.
2. Calificación conversacional: descubrí dolor, fit, autoridad y timing SIN que parezca
   formulario. Guardá lo que aprendés con save_qualification.
3. Si NO califica: cerrá amable con mark_not_interested. No fuerces.
4. Si califica: proponé la llamada asumiendo el sí
   ("¿te queda mejor mañana a la mañana o el jueves a la tarde?"), no preguntes
   "¿querés agendar?". Cuando confirme, usá book_appointment.
5. Si pide "mandame info" / "pasame precios": no es un no. Pivoteá a la llamada
   ("te lo muestro en 15 min sobre tu caso puntual, ¿te va mañana 10h?").
6. Si se pone difícil, técnico o pide humano: handoff_to_human.

NUNCA: mandes links sin contexto, uses más de 1 emoji por mensaje, suenes a vendedor
desesperado, repitas "¿seguís ahí?" como follow-up.
```

### 5.4 Guardrails anti-alucinación (fuera del prompt)

El prompt no alcanza. Capas duras:
- `check_availability` es la **única** fuente de slots. Si el LLM menciona un horario sin haber llamado la tool, lo detectás (regex de fechas/horas en el output) y forzás un re-turn.
- `book_appointment` valida contra el calendario real y devuelve éxito/conflicto. El LLM no "cree" que agendó: agenda la tool.
- Validación de salida: si el output supera N caracteres, contiene un precio no autorizado, o se va de tópico → lo regenerás o escalás a humano.

---

## 6. El motor de follow-up (acá se gana o se pierde la plata)

Dato que justifica todo: **el 80% de las ventas necesita 5+ follow-ups, pero el 44% de los reps abandona después del primero.** Un setter automatizado gana ahí: nunca se cansa. Pero —recordá §0— cada reintento fuera de ventana cuesta un template.

### 6.1 Cadencia diseñada alrededor de la ventana de 24hs

```
Lead no responde a la apertura:
  +20 min  → free-form (ventana abierta, GRATIS) — segundo ángulo, más liviano
  +3 h     → free-form si todavía hay ventana (GRATIS)
  --- la ventana cierra a las 24h del último msg del lead ---
  +24 h    → TEMPLATE utility (reabre ventana, barato) — "te quedó pendiente esto..."
  +3 días  → TEMPLATE marketing (caro, ojo cap 131049) — ángulo de valor/urgencia
  +7 días  → TEMPLATE marketing final — breakup message ("¿lo dejamos para más adelante?")
  → UNRESPONSIVE
```

Los breakup messages convierten sorprendentemente bien: el "cerrar la puerta" reactiva a los que estaban tibios.

### 6.2 Implementación con BullMQ (delayed jobs cancelables)

```ts
async function scheduleFollowUps(leadId: string) {
  const steps = [
    { i: 0, delayMs: 20 * 60_000,        mode: 'freeform' },
    { i: 1, delayMs: 3 * 3600_000,       mode: 'freeform' },
    { i: 2, delayMs: 24 * 3600_000,      mode: 'template', tpl: 'reengage_utility' },
    { i: 3, delayMs: 3 * 86400_000,      mode: 'template', tpl: 'reengage_value' },
    { i: 4, delayMs: 7 * 86400_000,      mode: 'template', tpl: 'breakup' },
  ];
  for (const s of steps) {
    const job = await followUpQueue.add('follow-up',
      { leadId, stepIndex: s.i, mode: s.mode, tpl: s.tpl },
      { delay: s.delayMs, jobId: `fu-${leadId}-${s.i}` });
    await prisma.followUp.create({ data: {
      leadId, stepIndex: s.i, scheduledAt: new Date(Date.now() + s.delayMs),
      jobId: job.id } });
  }
}

// Cuando el lead responde:
async function cancelPendingFollowUps(leadId: string) {
  const pending = await prisma.followUp.findMany({
    where: { leadId, status: 'scheduled' } });
  for (const fu of pending) {
    if (fu.jobId) await followUpQueue.remove(fu.jobId);
    await prisma.followUp.update({ where: { id: fu.id },
      data: { status: 'cancelled' } });
  }
}
```

El worker de follow-up, antes de mandar, **revalida estado**: si el lead ya está `BOOKED`/`NOT_INTERESTED`/`ENGAGED`, descarta el job. Y si el modo es `template` pero todavía hay ventana abierta, manda free-form (ahorrás el costo).

---

## 7. Booking y calendario — el detalle que rompe en LATAM: timezones

`check_availability` y `book_appointment` integran con Google Calendar (freebusy + insert) o Calendly. Lo que más se rompe:

- **Timezone por tenant y por lead.** Argentina es `America/Argentina/Buenos_Aires` (UTC-3, sin DST), pero si el white-label sirve a México (con DST), Chile, Colombia, etc., un slot "a las 10" es ambiguo. Guardás todo en **UTC en DB** y mostrás en el tz del lead. El LLM nunca calcula horas: la tool devuelve slots ya formateados en el tz correcto ("mañana jueves 10:00 hs ARG").
- **Confirmación explícita antes de bookear.** El agente propone → el lead confirma → recién ahí `book_appointment`. Nunca agendes sobre un "dale" ambiguo sin reconfirmar el horario exacto.
- **Doble booking:** la tool hace freebusy check en el momento del insert, no antes. Entre que proponés y confirma pueden pasar minutos.

```ts
const checkAvailability = {
  decl: {
    name: 'check_availability',
    description: 'Devuelve slots libres reales en el tz del lead. Usar SIEMPRE antes de proponer horarios.',
    parameters: { type: 'object', properties: {
      preferredRange: { type: 'string', enum: ['morning','afternoon','this_week','next_week'] }
    }}
  },
  run: async (args, lead) => {
    const tz = lead.timezone ?? lead.tenant.timezone;
    const busy = await gcal.freebusy(lead.tenant, range(args.preferredRange));
    return formatSlots(openSlots(busy), tz);   // ["jue 10:00", "jue 15:30", ...]
  }
};
```

### Reducción de no-shows
El setter no termina al agendar. Recordatorios automáticos (templates `UTILITY`, baratos):
- T-24h: confirmación ("¿seguimos con la de mañana 10h?")
- T-2h: recordatorio + link de la call.
Esto solo baja no-shows un orden de magnitud. Y si el lead no confirma el T-24h, lo reinsertás en cadencia de re-booking.

---

## 8. Handoff a humano y observabilidad

- **Handoff:** `handoff_to_human` cambia el estado a `HANDED_OFF`, **pausa el agente** para ese lead (flag `agentPaused`), notifica al inbox humano con el contexto completo (transcript + qualification). Cuando el humano agarra, el bot no vuelve a meterse salvo que se lo reactive. Esto cumple el espíritu de la policy de Meta ("un humano a un mensaje de distancia").
- **Triggers de handoff:** pedido explícito de hablar con persona, frustración detectada, pregunta fuera de scope que el brief no cubre, deal de alto ticket (configurable), o N turnos sin avanzar.
- **Observabilidad mínima viable:** por lead trackeás `cost_per_lead` (suma de `costCents` de templates), `time_to_first_message`, `messages_to_book`, y stage transitions. Logueás cada tool call. Sin esto, no podés optimizar ni saber si el costo por reunión te cierra.

---

## 9. Multi-tenancy / white-label

Como esto lo pensás white-label LATAM:
- **Aislamiento por `tenantId`** en cada query (RLS en Postgres si querés defensa en profundidad, alineado a tu modelo de ERP).
- **Config-as-data:** el `businessBrief`, los templates, el tz, el calendario y el tono viven en `Tenant`, no en código. Onboardear un cliente nuevo = cargar un brief + conectar su WABA + aprobar sus templates. Cero deploy.
- **Números de WhatsApp:** cada tenant trae su propio `phoneNumberId`/WABA (o vos los administrás como BSP/Tech Provider). El routing del webhook por `phone_number_id` te dice de qué tenant es el mensaje.
- **Prompt por tenant:** `buildSystemPrompt` compone el prompt base + el brief del tenant. El framework de seteo es tuyo; el contenido del negocio es del cliente.

---

## 10. El lado SETTER — el framework de conversación

La ingeniería sin esto es un bot que manda mensajes. Esto es lo que separa un setter que agenda del que molesta.

### Speed-to-lead
El primer mensaje en segundos no es vanity: es el mayor lever de conversión que existe. Si tu p95 de "form → primer msg" se va a minutos, perdés más leads que con cualquier mejora de copy.

### La apertura (primer mensaje)
- Referenciá **lo concreto** por lo que dejó sus datos ("Vi que pediste info sobre {X}").
- Bajá fricción: **una** pregunta, abierta, fácil de responder.
- No vendas en el primer mensaje. El objetivo del primer toque es solo **provocar una respuesta** (= abrir/mantener la ventana gratis).
- Ejemplo: *"Hola Mati, soy {nombre} de {empresa} 👋 Vi que dejaste tus datos por {X}. Para no marearte con info de más: ¿qué es lo que más te urge resolver hoy con eso?"*

### Calificación conversacional (no interrogatorio)
Querés descubrir **dolor + fit + autoridad + timing**, pero sin que se sienta formulario. Reglas:
- Una pregunta por mensaje, y que cada una se construya sobre la respuesta anterior (escucha activa).
- Reflejá su lenguaje. Si dice "facturación", no le hables de "revenue".
- Andá de lo amplio (dolor) a lo específico (presupuesto/timing) recién cuando hay rapport.
- Guardás cada dato en `save_qualification` para que el closer reciba el lead masticado.

### Manejo de objeciones típicas LATAM
- **"Mandame info / pasame un PDF"** → es el dodge #1. No es un no; es "no me convenciste de invertir tiempo". Pivoteá: *"Te lo muestro aplicado a tu caso en 15 min, rinde más que un PDF. ¿Te va mañana 10h o preferís a la tarde?"*
- **"¿Cuánto sale?"** muy temprano → no tirés número (no lo tenés autorizado y mata el deal sin contexto). *"Depende de {variable}, por eso la llamada: en 15 min te doy el número exacto para tu caso."*
- **"Ahora no tengo tiempo"** → micro-commitment a futuro: *"Cero drama. ¿Te escribo el lunes o preferís que te deje un horario reservado para la semana que viene?"*

### El cierre (pedido de booking)
- **Asumí el sí.** "¿Te queda mejor jueves 10 o viernes 15?" convierte mucho más que "¿querés agendar una llamada?".
- Doble opción cerrada (dos horarios) > pregunta abierta ("¿cuándo podés?").
- Micro-compromisos antes del ask grande: que diga "sí" a cosas chicas (que tiene el problema, que le interesaría resolverlo) antes de pedir el horario.
- Confirmá el horario **exacto** y reconfirmá en sus palabras antes de bookear.

### Cadencia de follow-up (el lado humano de §6)
- Cada toque, **ángulo distinto**. Nunca "¿seguís ahí?". Probá: recordatorio del dolor que mencionó, un caso/resultado relevante, una pregunta nueva, y al final el breakup.
- El breakup ("entiendo que no sea el momento, ¿lo cierro por ahora?") reactiva a los tibios por reactancia.

### Tono rioplatense B2B
Vos, no tú. Profesional pero humano. Sin solemnidad de corporativo gringo traducido, sin exceso de emojis, sin signos de exclamación múltiples. Directo, respetuoso del tiempo del otro. Suena a persona del equipo comercial, no a "asistente virtual".

---

## 11. Roadmap por fases (lo que armaría, en orden)

**Fase 1 — Loop mínimo end-to-end (1 tenant, hardcodeado)**
Webhook WhatsApp → cola → agente Gemini con system prompt + 1 tool (`book_appointment` contra Calendly link) → responde. Sin follow-up todavía. Objetivo: probar que el agente saca un booking real de una conversación real.

**Fase 2 — Calificación + state machine + Postgres**
Tools de qualification, LeadStatus, persistencia de conversación, handoff a humano. Acá ya tenés un setter usable para vos mismo / un cliente piloto.

**Fase 3 — Motor de follow-up + economía de ventana**
BullMQ delayed jobs, cadencia, templates utility/marketing, tracking de costo por lead, recordatorios anti-no-show. Acá pasás de "responde" a "persigue", que es el 80% del valor.

**Fase 4 — Multi-tenant / white-label**
Config-as-data, onboarding sin deploy, routing por phone_number_id, prompt por tenant, dashboard de métricas. Acá es producto.

**Fase 5 — Optimización**
A/B de aperturas y cadencias, fine-tuning del prompt por vertical, integración con tu CRM/ERP, scoring de leads, voice notes (responden ~3x más que texto, pero suman complejidad de TTS).

---

## 12. Métricas que mirarías (y los benchmarks que se manejan)

| Métrica | Por qué | Referencia del mercado |
|---|---|---|
| Time-to-first-message | El lever #1 de conversión | objetivo <30s; Setter AI clama 10s |
| Lead-to-booking rate | La métrica madre | rango que se cita: 15% target, 25–52% en sistemas buenos |
| Cost-per-booked-meeting | Si esto no cierra, el negocio no cierra | apuntá a mantener costo/lead por debajo de US$2–3 |
| Messages-to-book | Eficiencia del agente | menos es mejor, pero no a costa de calificar mal |
| No-show rate | Recordatorios lo atacan | reducciones de ~40% con recordatorios automáticos |
| Reply rate por step de follow-up | Te dice qué ángulo funciona | el breakup suele sorprender |
| WhatsApp quality rating | Si baja, Meta te limita | mantené verde |

---

## Apéndice — los gotchas que te ahorran un rediseño

1. **No llames al LLM en el request del webhook.** Cola siempre. Meta reintenta y duplicás.
2. **Idempotencia por `wa_message_id`.** Sí o sí.
3. **La ventana de 24hs es la unidad económica.** Diseñá el follow-up para vivir adentro de ella; los templates son la excepción cara.
4. **No brutees templates de marketing.** Error 131049 = cap. Priorizá utility y free-form.
5. **El LLM nunca inventa slots ni precios.** Tools deterministas + validación de salida.
6. **Timezones en UTC en DB, render en tz del lead.** En LATAM con DUT mixto te rompe sí o sí.
7. **Sé honesto si preguntan si es IA.** Es policy de Meta y además convierte mejor.
8. **Trackeá costo por lead desde el día 1.** Sin eso no sabés si el unit economics cierra.
9. **El humano siempre a un mensaje de distancia.** Handoff limpio con contexto completo.
10. **Temperature baja, mensajes cortos.** Un setter ejecuta un framework, no improvisa ensayos.
