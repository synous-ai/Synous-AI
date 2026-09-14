import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactEmail, LegalDocument, type LegalSection } from '../legal-document'

export const metadata: Metadata = {
  title: 'Condiciones del Servicio | Synous AI',
  description: 'Condiciones de uso del panel, el portal de clientes y las páginas públicas de Synous AI.',
}

const SECTIONS: LegalSection[] = [
  {
    id: 'aceptacion',
    title: 'Aceptación',
    body: (
      <p>
        Estas condiciones regulan el uso del panel (<strong>app.synousai.com</strong>), del portal de
        clientes y de las páginas públicas de propuestas y reservas de Synous AI (en adelante, “la
        plataforma”). Al acceder o usar la plataforma aceptás estas condiciones.
      </p>
    ),
  },
  {
    id: 'servicio',
    title: 'Qué es la plataforma',
    body: (
      <>
        <p>
          La plataforma es la herramienta con la que Synous AI gestiona sus proyectos de desarrollo y se
          comunica con sus clientes: seguimiento de proyectos, propuestas, entregables, documentos,
          facturación y reuniones.
        </p>
        <p>
          Los servicios de desarrollo en sí se rigen por la propuesta aceptada o el contrato firmado con
          cada cliente. Si alguna de estas condiciones contradice ese acuerdo, prevalece el acuerdo.
        </p>
      </>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas y acceso',
    body: (
      <ul>
        <li>Las cuentas las crea Synous AI para su equipo y para sus clientes; no hay registro abierto.</li>
        <li>Sos responsable de mantener la confidencialidad de tus credenciales y de la actividad de tu cuenta.</li>
        <li>Si detectás un acceso no autorizado, avisanos de inmediato a <ContactEmail />.</li>
        <li>Podemos suspender o dar de baja el acceso cuando termine la relación comercial o ante un uso indebido.</li>
      </ul>
    ),
  },
  {
    id: 'uso',
    title: 'Uso aceptable',
    body: (
      <>
        <p>Al usar la plataforma te comprometés a no:</p>
        <ul>
          <li>Acceder a información de otros clientes o intentar eludir los controles de acceso.</li>
          <li>Subir contenido ilícito, malicioso o que infrinja derechos de terceros.</li>
          <li>Interferir con el funcionamiento de la plataforma o sobrecargarla deliberadamente.</li>
          <li>Usar la plataforma para fines distintos de la relación de trabajo con Synous AI.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'contenido',
    title: 'Tu contenido',
    body: (
      <p>
        El contenido que cargás (archivos, documentos, formularios, comentarios) sigue siendo tuyo. Nos
        das permiso para almacenarlo, procesarlo y mostrarlo solo en la medida necesaria para prestar el
        servicio. Sos responsable de contar con los derechos sobre ese contenido.
      </p>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    body: (
      <p>
        La plataforma, su código, diseño y marca pertenecen a Synous AI. La titularidad de los
        entregables de cada proyecto se rige por lo acordado en la propuesta o el contrato
        correspondiente.
      </p>
    ),
  },
  {
    id: 'ia',
    title: 'Contenido generado con IA',
    body: (
      <p>
        Algunos borradores, como las propuestas comerciales, se generan con asistencia de inteligencia
        artificial y el equipo de Synous AI los revisa antes de enviarlos. Lo que tiene validez es la
        versión final aprobada y enviada.
      </p>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad',
    body: (
      <p>
        Trabajamos para que la plataforma esté disponible y funcione correctamente, pero no garantizamos
        un servicio ininterrumpido ni libre de errores. Podemos realizar mantenimientos, cambios y
        mejoras en cualquier momento.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Limitación de responsabilidad',
    body: (
      <p>
        En la medida permitida por la ley aplicable, Synous AI no es responsable por daños indirectos,
        lucro cesante o pérdida de datos derivados del uso o la imposibilidad de uso de la plataforma.
        Nada de lo aquí establecido limita los derechos que la legislación de defensa del consumidor
        reconoce cuando corresponda.
      </p>
    ),
  },
  {
    id: 'privacidad',
    title: 'Privacidad',
    body: (
      <p>
        El tratamiento de datos personales se describe en la{' '}
        <Link href="/privacidad">Política de Privacidad</Link>.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios en estas condiciones',
    body: (
      <p>
        Podemos modificar estas condiciones. Si el cambio es relevante, lo vamos a comunicar por email o
        dentro de la plataforma. Seguir usando la plataforma después del cambio implica aceptarlo.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y contacto',
    body: (
      <p>
        Estas condiciones se rigen por las leyes de la República Argentina. Para cualquier consulta
        escribinos a <ContactEmail />.
      </p>
    ),
  },
]

export default function TermsPage() {
  return (
    <LegalDocument
      current="terminos"
      eyebrow="Documento legal"
      title="Condiciones del Servicio"
      lede="Las reglas para usar el panel, el portal de clientes y las páginas públicas de Synous AI."
      sections={SECTIONS}
    />
  )
}
