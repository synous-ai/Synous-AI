# El setter unificado — Blueprint de producto

> Combinar lo mejor de Setter AI, AutoSetter, SetSmart, SetterFlo e InstantDM en un solo producto, y superarlos en lo que ninguno hace.
> Caso de uso primario: **tu propia máquina de conseguir clientes** (LATAM, español rioplatense). Productizable después, pero diseñado primero para vos.
> Se apoya en el playbook técnico ya entregado (`setter-ai-playbook.md`) — acá va el QUÉ y el POR QUÉ; el CÓMO base ya está ahí.

---

## 1. La idea en una frase

**Una máquina de adquisición end-to-end que prospecta, abre conversación, califica, agenda y recuerda — por WhatsApp e Instagram, en tu voz (texto y audio clonado), en rioplatense — y que aprende de tus propios cierres.**

No es "un setter". Es **lead-engine + setter + recordatorios** corriendo como un solo organismo, donde los demás venden solo el pedazo del medio.

---

## 2. Tabla maestra: qué toma de cada uno y cómo lo mejora

Esto es literalmente "combinar lo que hacen todos". Cada fila = una capacidad, de dónde la sacamos, y el upgrade.

| Capacidad | Setter AI | AutoSetter | SetSmart | **Qué tomamos** | **Cómo lo MEJORAMOS** |
|---|---|---|---|---|---|
| **Speed-to-lead** | 10s | sí | 30s | Primer toque <10s | Por canal, con warm-up de número para no comerte ban |
| **Canales** | WA, SMS, web | IG/WA DM | IG, WA, Messenger | Todos | **Un cerebro, identidad de lead cross-canal** (si te escribe en IG y sigue en WA, es el mismo lead, misma memoria) |
| **Voz clonada** | ❌ (solo texto) | "tu voz" (ambiguo) | ✅ notas de voz | Notas de voz con tu voz | **Rioplatense nativo + solo en beats de rapport + STT del audio entrante** (entiende las notas de voz del lead) |
| **Booking in-chat** | vía Calendly | ✅ | ✅ sin links | Agenda dentro del chat | **Timezone LATAM bien resuelto + reconfirmación antes de bookear** |
| **Follow-ups** | hasta responder/bookear | ✅ | 2 (~4h y ~23h) | Cadencia persistente | **Window-aware**: gratis dentro de la ventana de 24h, templates pagos solo para reabrir frío |
| **Comment-to-DM** | ❌ | ? | ✅ (Reels/posts) | Trigger desde comentarios | Keyword en Reel/post → DM automático → entra al pipeline |
| **Filtrar tire-kickers** | calificación | calificación | ✅ corta amable | Descartar curiosos | **Lead scoring** + cierre cordial que no quema marca |
| **Aprende tu estilo** | tono "marca" | "tu voz" | de transcripts | Imitar cómo vendés | **Fine-tune por vertical + alimentado de tus llamadas cerradas reales** |
| **Human handoff** | ✅ monitoreo | toggle | ✅ | Pasar a humano con contexto | **Shadow mode**: la IA redacta, vos aprobás, hasta que confiás y la soltás |
| **Dashboard / pipeline** | vía CRM | ✅ ingresos/reuniones | ✅ | Métricas de pipeline | **Unit economics**: costo por reunión agendada en vivo |
| **Recordatorios no-show** | ✅ | ? | ? | Recordatorio T-24h/T-2h | Templates `utility` baratos + re-booking si no confirma |
| **Generación de leads** | ❌ | ❌ | ❌ | **— nadie lo hace —** | **Tu lead-engine integrado** = la máquina arranca sola, no espera inbound |
| **Mercado/tono** | gringo, 113 idiomas | español | inglés/francés | — | **Rioplatense de verdad**: slang, "mandame info", ARS/USD, contexto local |

La lectura: de la fila "Generación de leads" para abajo es donde dejás de competir y empezás a tener algo que **ninguno tiene**.

---

## 3. Los diferenciadores que ninguno tiene (el moat)

Combinar features te da paridad. Esto te da ventaja:

**1. Es una máquina completa, no un eslabón.**
Todos los competidores empiezan cuando el lead ya levantó la mano. Vos arrancás antes: tu **lead-engine** (Fastify + Google Maps Places + Claude) prospecta y hace el primer toque, el **setter** convierte a reunión, los **recordatorios** la sostienen. Prospecto → primer toque → calificación → booking → recordatorio → handoff, en un solo flujo. Eso no se compra en ningún lado.

**2. Identidad de lead cross-canal.**
SetSmart maneja varios canales pero como inboxes separados. Vos unificás: un lead es una persona, no un thread por canal. Si lo tocaste en IG y te responde por WhatsApp, la IA ya sabe quién es y dónde quedaron. Memoria única.

**3. Voz clonada quirúrgica + bilingüe de formato.**
No es "mandar todo en audio" (cansa y suena raro). Es **texto para lo transaccional, audio en tu voz para los momentos de rapport** (apertura, una objeción clave, el pedido de la call), y **entender** las notas de voz que manda el lead (STT). En rioplatense. Eso es lo que hace que "nadie sospeche que es IA".

**4. Motor de economía integrado.**
Optimizás costo por reunión con la lógica de ventana de 24h (gratis dentro, template solo para reabrir). Lo ves en el dashboard. Para uso propio = más reuniones por el mismo gasto; como producto futuro = un número que ningún competidor muestra.

**5. Tu CRM/ERP propio como backend.**
Ya tenés un CRM (NOUS, schema tipo HubSpot). El setter no es otra tool aislada que sincronizás con Zapier: escribe directo en tu pipeline. Trazabilidad real, cero pegamento.

**6. Shadow mode → confianza progresiva.**
Las primeras semanas la IA **propone** la respuesta y vos aprobás con un tap. Aprende de tus correcciones. Cuando ves que clava el 90%, la soltás a piloto automático. Ninguno te da esa rampa; te tirás a la pileta de una.

---

## 4. Arquitectura unificada: un cerebro, N canales

Es el playbook que ya tenés, con la abstracción de canal y dos capas nuevas (voz + identidad cross-canal):

```
   LEAD-ENGINE (tuyo)                    INBOUND
   prospecta + 1er toque          IG DM · WhatsApp · web · comment-to-DM
          │                                  │
          └──────────────┬───────────────────┘
                         ▼
              ┌─────────────────────┐
              │  IDENTITY RESOLVER   │  ← un lead = una persona (cross-canal)
              └──────────┬──────────┘
                         ▼
              ┌─────────────────────┐
              │   EL CEREBRO         │  ← agente Gemini, state machine, tools
              │   (único, agnóstico  │     (idéntico al playbook)
              │    del canal)        │
              └──────────┬──────────┘
            ┌────────────┼───────────────┬──────────────┐
            ▼            ▼               ▼              ▼
     MessagingProvider  VoiceLayer    Calendar       CRM propio
     (interfaz común)   (ElevenLabs)  (GCal)         (pipeline)
       ├─ WhatsApp Cloud API           STT+TTS
       ├─ Instagram Messaging API      voz clonada
       ├─ Evolution/OpenWA (MVP)       rioplatense
       └─ SMS
```

Clave de diseño: **el cerebro no sabe en qué canal está**. Habla con una interfaz `MessagingProvider` (los métodos: `sendText`, `sendVoiceNote`, `sendTemplate`, `markRead`, `getWindowState`). Cada canal implementa esa interfaz. Agregar un canal = un adapter nuevo, cero cambios en el agente. Lo mismo te permite el swap OpenWA↔Cloud API que ya hablamos.

---

## 5. Las dos capas nuevas (lo que no estaba en el playbook)

### 5.1 Identity Resolver (cross-canal)
- Tabla `Person` por encima de `Lead`/canal. Un `Person` agrupa identidades (`ig_handle`, `phone`, `email`).
- Matching: por teléfono/email cuando los das; por señales (mismo nombre + ventana temporal + referencia a la misma oferta) cuando no.
- La memoria de conversación cuelga de `Person`, no del canal. Resultado: continuidad real.

### 5.2 Voice Layer
- **Clonado** una vez: subís muestras de tu voz a ElevenLabs (o equivalente) → `voiceId`.
- **Salida (TTS)**: el agente decide `format: text | voice` según el beat. Generás audio → lo mandás como nota de voz (`sendVoiceNote`). WhatsApp Cloud API soporta audio; en Instagram el envío de audio por API es más limitado — ahí priorizás texto y reservás voz para WhatsApp.
- **Entrada (STT)**: si el lead manda audio, lo transcribís (Whisper/Gemini) antes de pasárselo al cerebro. Así "entiende" notas de voz.
- **Criterio de setter (cuándo audio)**: apertura cálida, una objeción importante, el pedido de la call, un agradecimiento post-booking. **Nunca** para horarios, links o datos (eso en texto, se lee y se reenvía). Regla: máximo 1 audio cada 3-4 mensajes.

---

## 6. Flujo end-to-end (cómo se ve corriendo para vos)

```
1. lead-engine encuentra un prospecto (ICP tuyo) → genera 1er mensaje personalizado
2. Sale el primer toque (texto, o audio si es warm). Speed: inmediato.
3. Responde → Identity Resolver lo une → el cerebro toma la conversación
4. Califica conversacional (dolor/fit/timing) — guarda en tu CRM vía save_qualification
5. ¿No fit? → cierre cordial, marca en pipeline. ¿Fit? → propone call (asume el sí)
6. Confirma horario → book_appointment en tu calendario (timezone correcto)
7. Recordatorio T-24h y T-2h (utility templates, baratos) → baja no-show
8. Si pide humano / se complica → handoff con todo el contexto a tu inbox
9. Todo medido: costo por reunión, reply-rate por canal, conversión por vertical
```

Para uso propio, el modo recomendado las primeras semanas es **shadow** (vos aprobás cada salida) hasta calibrar el tono. Después, autopilot.

---

## 7. Roadmap priorizado (para conseguir clientes YA, no para tener "el producto perfecto")

**Sprint 0 — El cerebro + 1 canal + shadow mode**
Evolution API (Baileys) sobre número dedicado + agente Gemini + booking a tu calendario + shadow mode. Objetivo: que TE agende a vos calls reales con leads reales, vos aprobando. Acá ya tenés tracción.

**Sprint 1 — Lead-engine enchufado + follow-up window-aware**
Conectás tu lead-engine como fuente de leads + cadencia de follow-up. Acá la máquina deja de esperar y empieza a generar pipeline sola.

**Sprint 2 — Voice Layer**
Clonás tu voz, sumás audio en los beats de rapport + STT inbound. Es el diferencial que más mueve conversión en high-ticket LATAM.

**Sprint 3 — Segundo canal (Instagram DM) + Identity Resolver**
Sumás IG DM y la unificación cross-canal. Comment-to-DM desde tus Reels.

**Sprint 4 — Dashboard + unit economics + autopilot**
Métricas en vivo, costo por reunión, y soltás el shadow mode donde ya confiás.

**Sprint 5 (opcional) — Productizar**
Recién acá, si querés vender white-label: multi-tenant, Cloud API oficial (no Baileys), onboarding self-serve. Pero eso es otra etapa.

---

## 8. Métricas y unit economics (lo que mirás)

| Métrica | Objetivo | Por qué |
|---|---|---|
| Time-to-first-touch | <10s | el lever #1 |
| Reply rate por canal | comparar WA vs IG | dónde poner energía |
| Lead→booking rate | 15–52% (rango de mercado) | la métrica madre |
| Costo por reunión agendada | <US$2–3/lead | si esto no cierra, nada cierra |
| % audio vs texto | tunear | el audio sube conversión pero cansa si abusás |
| No-show rate | bajar ~40% con recordatorios | reuniones que no se desperdician |
| Cierre por vertical | identificar tu mejor ICP | para afinar el lead-engine |

---

## Lo que cambia respecto a "clonar un competidor"

Si copiabas Setter AI, tenías un setter de texto gringo. Si copiabas AutoSetter, un setter de DM en español pero sin generación de leads. **Esto** es la máquina entera —prospección + seteo + voz + recordatorios + tu CRM— en tu idioma y tu mercado, hecha primero para que vos consigas clientes, y productizable después si querés. El moat no es ninguna feature suelta: es que están todas integradas en un organismo, alimentado por leads que vos generás.
