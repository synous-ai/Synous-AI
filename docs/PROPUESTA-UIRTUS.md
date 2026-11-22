# Propuesta UIRTUS — estructura y copy

Mapa de la landing de propuesta para UIRTUS Consultoría Evolutiva, sección por
sección, en el orden en que el lector las recorre.

- **Fuente del copy:** [`apps/admin/app/portal/propuesta/proposal-content.ts`](../apps/admin/app/portal/propuesta/proposal-content.ts)
- **Orden de render:** [`apps/admin/components/proposal/proposal-landing.tsx`](../apps/admin/components/proposal/proposal-landing.tsx)
- **Ruta pública:** `/portal/propuesta` (plantilla) · `/p/<token>` (por lead)

> El orden de las secciones en el archivo de contenido **no** es el orden en que
> se muestran. Este documento sigue el de la página.

---

## El hilo narrativo

Toda la propuesta sostiene una sola idea, y conviene tenerla presente antes de
tocar cualquier texto:

> **Fase 1 = dejar de verse por debajo de lo que son.**
> **Fase 2 = empezar a convertirse en lo que imaginan.**

Cada sección empuja ese arco: primero el diagnóstico (dónde están), después la
fecha que ordena todo (9 de noviembre), después qué se construye, cómo encaja,
cuánto sale, y recién al final el pedido de decisión.

---

## Navegación

Cuatro anclas en el header flotante — no están todas las secciones, solo las que
el lector podría querer saltear hacia adelante:

| Etiqueta | Ancla |
| --- | --- |
| El punto de partida | `#de-donde-partimos` |
| La estrategia | `#alcance` |
| Inversión | `#inversion` |
| Cómo trabajamos | `#como-trabajamos` |

---

## 1. Hero

**Badge:** PROPUESTA · SEPTIEMBRE 2026

**Titular:** Una infraestructura digital a la altura de la consultora **UIRTUS**
(la última palabra va en acento azul)

**Bajada:**
> UIRTUS ya no es solamente un estudio contable. Hoy conviven distintas áreas,
> herramientas propias, un diagnóstico, contenidos y una visión clara de
> construir un ecosistema digital propio. Esta propuesta cubre los dos proyectos
> que lo hacen posible: la presencia institucional y la aplicación, trabajados en
> paralelo sobre una misma arquitectura.

**CTA:** Ver propuesta → baja a `#de-donde-partimos`

**Fondo:** shader Aurora (WebGL) + halo + grano.

---

## 2. De dónde partimos · `#de-donde-partimos`

El diagnóstico antes de proponer nada: primero demostramos que entendimos el
momento, después proponemos.

**Badge:** DE DÓNDE PARTIMOS

**Titular:** UIRTUS creció. Su presencia digital todavía no acompañó esa evolución.

**Bajada:**
> En estos nueve años, UIRTUS pasó de concentrarse principalmente en lo contable
> e impositivo a incorporar gestión, recursos humanos, legales, administración
> inmobiliaria y nuevas herramientas propias.

**Tres tarjetas** (con icono, altura pareja):

| # | Título | Cuerpo |
| --- | --- | --- |
| 1 | La evolución no tiene dónde verse | Esa transformación todavía no cuenta con un espacio digital que la represente de forma unificada. Quien busca a UIRTUS hoy no encuentra el alcance real de lo que hace. |
| 2 | Las piezas existen, pero separadas | El diagnóstico, el panel de clientes, la comunicación institucional y las futuras herramientas viven como piezas independientes, sin un lugar común que las conecte. |
| 3 | El objetivo no es una página | Es empezar a ordenar todo eso bajo un mismo ecosistema, con una arquitectura que sostenga lo que viene después. |

---

## 3. El primer hito · `#primer-hito`

La fecha del evento ordena las prioridades del proyecto, así que tiene sección
propia en vez de ser una línea perdida en los plazos.

**Badge:** EL PRIMER HITO

**Titular:** Llegar al 9 de noviembre con UIRTUS presentada como corresponde.

**Bajada:**
> Para el evento, la prioridad no es tener todo el ecosistema terminado. Es
> llegar con una presencia oficial, profesional y funcional desde la cual puedan
> presentar UIRTUS, sus áreas y el Diagnóstico UIRTUS como una herramienta propia
> de la consultora.

**Tarjeta de fecha:**

> ### 09 NOV
> Sitio institucional y MVP de su primer producto.

---

## 4. La estrategia · `#alcance`

**Badge:** LA ESTRATEGIA

**Titular:** Dos proyectos. Una misma infraestructura.

**Bajada:**
> Cada fase resuelve un problema distinto, pero se construyen sobre la misma
> base. La primera devuelve una presencia a la altura de lo que UIRTUS ya es; la
> segunda empieza a construir la visión que viene después.

### Las dos fases

**FASE 01 — PRESENCIA · Sitio institucional + CMS**
> El punto de entrada oficial a UIRTUS: quiénes son, qué hacen, sus áreas y
> servicios, el Diagnóstico UIRTUS y el acceso de clientes. Con un CMS propio
> para que el equipo pueda actualizar información sin depender de terceros.

**FASE 02 — PRODUCTO · MVP de la aplicación UIRTUS**
> El primer paso para transformar herramientas y procesos que hoy existen de
> forma independiente en una experiencia digital propia para los clientes de
> UIRTUS. Una base preparada para sumar funcionalidades a medida que el producto
> demuestre qué necesita realmente.

### Cómo puede seguir

**Subtítulo:** El MVP no define el techo de la aplicación. Define la base.

> Una vez validada la primera versión, UIRTUS puede seguir evolucionando según lo
> que tenga mayor impacto en ese momento.

- **Por módulos** — Para incorporar funcionalidades puntuales sin comprometer una inversión mayor.
- **Por versiones** — Para agrupar varias mejoras en una evolución más ambiciosa del producto.

**Nota al pie:**
> Ejemplos que aparecieron durante nuestra conversación: gestión de ingresos y
> gastos, vencimientos, obligaciones, herramientas financieras, medios de pago y
> un futuro Consultor UIRTUS impulsado por IA. Son visión futura, no están
> incluidos en esta propuesta.

---

## 5. Cómo se conecta todo · `#arquitectura`

Responde a la preocupación de avanzar por partes sin rehacer lo ya construido.
**Es la única sección con fondo claro** — el argumento es que las piezas encajan
entre sí, y sobre claro el recorrido se lee como un plano.

**Badge:** CÓMO SE CONECTA TODO

**Titular:** No estamos construyendo piezas aisladas.

**Bajada:**
> La arquitectura se plantea desde el inicio para que el sitio, el diagnóstico,
> el panel y las futuras funcionalidades puedan convivir dentro del mismo
> ecosistema. Así, cada nueva etapa aprovecha lo que ya fue construido en lugar
> de empezar nuevamente desde cero.

**Cuatro capas**, en tarjetas alternadas unidas por una curva punteada animada:

| Etiqueta | Título | Cuerpo |
| --- | --- | --- |
| FASE 01 | Sitio UIRTUS | Diagnóstico · Áreas · Contenido |
| FASE 01 | Acceso de clientes | La puerta que conecta las dos fases |
| FASE 02 | Aplicación UIRTUS | Panel de cliente · Herramientas · Gestión |
| EVOLUCIÓN | Nuevas versiones del producto | Lo que el producto pida cuando esté funcionando |

---

## 6. Inversión · `#inversion`

**Badge:** INVERSIÓN

**Titular:** Dos proyectos, una sola inversión.

**Bajada:**
> Cada proyecto tiene su precio, y tomarlos juntos tiene el suyo. Trabajarlos en
> paralelo comparte arquitectura, decisiones y horas de equipo — y ese ahorro
> vuelve al presupuesto.

### Sitio institucional + CMS — USD 2.350

Pago: 50% al inicio · 50% en la entrega

Incluye:

- Sitio institucional con áreas y servicios
- CMS para gestión de contenido
- Integración del Diagnóstico UIRTUS
- Acceso al panel de clientes
- Diseño responsive
- Deploy y configuración
- Capacitación de uso del CMS
- 15 días de estabilización técnica

### MVP de la aplicación

| Forma de pago | Precio | Condiciones |
| --- | --- | --- |
| En dos pagos | USD 6.300 | 50% al inicio · 50% en la entrega |
| En tres pagos | USD 7.500 | 40% al inicio · 30% en hito intermedio · 30% en la entrega |

Incluye:

- Portal institucional dentro de la app
- Diagnóstico UIRTUS integrado
- Panel de clientes
- Panel de administración
- Integración del sitio con el panel de administración
- Arquitectura preparada para sumar módulos o versiones
- Capacitación y documentación
- 15 días de estabilización técnica

### LOS DOS PROYECTOS — la opción recomendada

Va en tarjeta aparte **después** de las individuales, para que el número se lea
contra los dos que el lector acaba de ver.

**Título:** Todo el ecosistema, en un solo proyecto.

> Es la forma en que recomendamos encararlo. Trabajar las dos fases en paralelo
> permite decidir la arquitectura una sola vez, sin rehacer nada al pasar de una
> a la otra, y llegar al evento con el sitio publicado mientras la aplicación ya
> está en marcha.

- Por separado: **USD 8.650**
- Ahorro: **USD 850**

| Forma de pago | Precio | Condiciones |
| --- | --- | --- |
| En dos pagos | USD 7.800 | 50% al inicio · 50% en la entrega |
| En tres pagos | USD 9.300 | 40% al inicio · 30% en hito intermedio · 30% en la entrega |

**Nota:**
> Los precios están en dólares. Cada proyecto se puede tomar por separado, pero
> la arquitectura está pensada para construirlos juntos: es donde el presupuesto
> rinde más y donde el resultado llega antes.

---

## 7. Cómo trabajamos · `#como-trabajamos`

Sección full-bleed con video de fondo montado sobre el borde superior de las
tarjetas.

**Badge:** CÓMO TRABAJAMOS

**Titular:** Desde el primer día van a saber qué estamos haciendo y qué sigue.

**Seis fases:**

| # | Fase | Descripción |
| --- | --- | --- |
| 01 | Contexto | Entendemos cómo funciona el negocio: qué vende, cómo entrega, qué procesos sostiene y cómo se organiza su operación. Ese contexto guía todas las decisiones del proyecto. |
| 02 | Arquitectura | Definimos usuarios, roles, permisos, módulos, datos e integraciones. Al terminar esta fase queda por escrito qué se construye, por qué y en qué orden. |
| 03 | Prototipo | Diseñamos la experiencia. Van a ver cómo se va a ver y cómo se va a usar antes de que exista. |
| 04 | Desarrollo | Convertimos el prototipo aprobado en un producto funcional. Integramos cada parte y mostramos avances periódicos hasta completar el alcance acordado. |
| 05 | Lanzamiento | QA, configuración, capacitación, documentación y salida a producción. Entregamos el sistema y también cómo usarlo. |
| 06 | Acompañamiento | Durante 15 días después del lanzamiento acompañamos la puesta en marcha, respondemos dudas de uso y verificamos que la implementación funcione como fue definida. |

---

## 8. Nuestro compromiso · `#garantias`

Van **después** del precio, que es donde aparece la duda. Arco de puntos animado
de fondo (se rellena de abajo hacia arriba).

**Badge:** NUESTRO COMPROMISO

**Titular:** Lo que UIRTUS puede esperar durante todo el proyecto.

| Título | Cuerpo |
| --- | --- |
| Avances visibles desde el inicio | Trabajamos por hitos y demos. Van a poder ver cómo avanza el proyecto, validar decisiones y saber en qué etapa estamos en todo momento. |
| Arquitectura antes de código | Si después de la fase de arquitectura no queda claro qué construir, qué priorizar y cómo debería funcionar, hacemos una sesión adicional sin costo hasta que quede definido. |
| Activos a nombre de UIRTUS | Construimos activos suyos, no dependencias nuestras. El código, la base de datos, los repositorios y las cuentas quedan a nombre de UIRTUS. |
| 15 días de acompañamiento | Después del lanzamiento seguimos disponibles: capacitación, documentación y estabilización técnica incluidas. |

---

## 9. Portafolio · `#proyectos`

**Badge:** PORTAFOLIO

**Titular:** Mirá en la práctica algunos proyectos recientes.

**Consciencia MCE** — *Plataforma*
> Un programa de transformación que convertimos en una plataforma propia: portal
> de usuario, panel de administración, onboarding, contenido, comunidad,
> calendario, reportes, seguimiento de alumnos e IA contextual.

*Prueba:* Convertimos una metodología en un sistema.

**CASC** — *Plataforma institucional*
> Cámara Argentina de Shopping Centers. Sitio institucional y plataforma web para
> centralizar operación, información y conocimiento de una entidad con varias
> áreas.

*Prueba:* Trabajamos con instituciones y estructuras de múltiples áreas.

**Aura Studio** — *Plataforma con IA*
> Plataforma que automatiza parte de la producción de creativos publicitarios con
> IA: entiende la marca, genera ángulos de venta y los convierte en piezas listas.
> Con biblioteca de creativos clonables, perfiles de marca, variaciones y edición.

*Prueba:* Construimos productos con IA aplicada a un proceso real.

---

## ~~Quiénes somos~~ · `#quienes-somos` — OCULTA

> **No se está mostrando.** El bloque JSX está comentado en
> `proposal-landing.tsx`, y la línea `team` salió del destructuring. El contenido
> sigue intacto en `proposal-content.ts`: para reactivarla hay que descomentar el
> bloque y volver a agregar `team` arriba.

<details>
<summary>Copy que quedó guardado</summary>

**Badge:** QUIÉNES SOMOS

**Titular:** Las mentes detrás de Synous

> Synous AI es una agencia de software y automatización. Trabajamos con negocios
> que ya funcionan y necesitan que su parte digital esté a la altura de lo que son.

- **Laureano Sierra** — CEO. Diseñador y programador web con más de 4 años de experiencia y más de 50 proyectos concluidos, especializado en construir interfaces digitales de alto rendimiento.
- **Jeremías Ingla** — CEO. Programador web con más de 4 años de experiencia, especializado en infraestructuras y operaciones digitales.

</details>

---

## 10. Información importante · `#informacion-importante`

Todo lo que el cliente debería leer antes de firmar, junto y después del precio.

**Badge:** INFORMACIÓN IMPORTANTE

**Titular:** Lo esencial antes de comenzar.

**Sobre los plazos**
> Las fechas se confirman en el kickoff y requieren que los materiales y las
> aprobaciones se entreguen en los tiempos acordados.

**Lo que no entra en esta cotización**

- Identidad visual de marca (logo, manual, redes sociales)
- Soporte a usuarios finales
- Funcionalidades no definidas en el alcance. Si aparece algo nuevo, se evalúa costo e impacto y se aprueba antes de desarrollar
- Cambios ilimitados
- Medios de pago
- Los módulos de gestión: gastos, ingresos, vencimientos, facturas
- Consultor UIRTUS (asistente IA)

---

## 11. Preguntas frecuentes · `#dudas`

**Badge:** PREGUNTAS FRECUENTES

**Titular:** Lo que suelen preguntarnos.

**¿Cuánto tarda?**
> Alrededor de 45 días, y el plazo exacto se confirma en la fase de arquitectura
> según el alcance final. Trabajamos por hitos justamente para evitar proyectos
> eternos: siempre hay fecha de entrega y demos en el camino.

**¿Qué pasa si aparece algo nuevo a mitad del proyecto?**
> Se evalúa costo, tiempo e impacto, y se aprueba antes de desarrollarlo. No
> trabajamos con "ya que estamos, agreguemos esto", porque es lo que hace que los
> proyectos no terminen nunca.

**¿El sistema queda a nombre nuestro?**
> Sí. Código, base de datos, repositorios, cuentas e infraestructura son del
> cliente. Nosotros recibimos permisos.

**¿Qué pasa después del lanzamiento?**
> Están incluidos 15 días de estabilización técnica para resolver errores del
> desarrollo y acompañar la puesta en marcha. Después, si quieren, se puede
> continuar con un plan mensual de evolución. No es obligatorio.

**¿Llegamos con el sitio al evento de noviembre?**
> Sí. Es la fecha que ordena la Fase 1 y el plazo que nos comprometemos a cumplir.

**¿El Diagnóstico UIRTUS también va a estar en la app?**
> Sí, está incluido en el MVP. La idea es que el diagnóstico sea entrada al
> ecosistema tanto desde el sitio como desde la app.

---

## 12. El siguiente paso · `#siguiente-paso`

La página cierra pidiendo una decisión concreta: sin esto el lector termina el
FAQ y no sabe qué se espera de él.

**Badge:** EL SIGUIENTE PASO

**Titular:** Si esta es la dirección que quieren tomar, estamos listos para
construirla con ustedes.

**CTA:** Avanzar con la propuesta → WhatsApp (+54 9 2944 68-8181), con el mensaje
"Hola, vimos la propuesta y queremos avanzar." ya redactado.

---

## Footer · `#cierre`

Logotipo · UIRTUS Consultoría Evolutiva · Septiembre 2026 · Instagram
[@synous.ai](https://www.instagram.com/synous.ai/)

© 2026 Synous AI. Todos los derechos reservados.

---

## Metadatos

| Campo | Valor |
| --- | --- |
| Cliente | UIRTUS Consultoría Evolutiva |
| Fecha | Septiembre 2026 |
| Validez | 30 días |

---

## Cómo se edita

El archivo de contenido es la **plantilla**: lo que ve cualquiera que abra
`/portal/propuesta`.

Para una propuesta con link propio (`/p/<token>`), `resolveProposal` mergea la
plantilla con lo guardado en la base, **campo por campo**. La regla es simple:

- Campo con texto en la DB → **pisa** la plantilla
- Campo vacío o ausente → **cae** a la plantilla

Por eso el fallback de IA deja los campos vacíos en vez de escribir placeholders:
un placeholder es texto, y el texto gana.
