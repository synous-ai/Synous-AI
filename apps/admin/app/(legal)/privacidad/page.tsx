import type { Metadata } from 'next'
import { ContactEmail, LegalDocument, type LegalSection } from '../legal-document'

export const metadata: Metadata = {
  title: 'Política de Privacidad | Synous AI',
  description: 'Cómo Synous AI trata los datos personales en su panel, su portal de clientes y sus páginas públicas.',
}

const SECTIONS: LegalSection[] = [
  {
    id: 'responsable',
    title: 'Quién es responsable',
    body: (
      <>
        <p>
          Synous AI es una agencia de desarrollo web y es la responsable del tratamiento de los datos
          personales descriptos en esta política. Para cualquier consulta sobre privacidad podés
          escribirnos a <ContactEmail />.
        </p>
        <p>
          Esta política aplica al panel interno (<strong>app.synousai.com</strong>), al portal de
          clientes (los subdominios de <strong>synousai.com</strong> asignados a cada cliente) y a las
          páginas públicas de propuestas y reservas de reuniones.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos tratamos',
    body: (
      <>
        <ul>
          <li>
            <strong>Datos de cuenta:</strong> nombre, email y foto de perfil. Si iniciás sesión con
            Google, recibimos solo esos datos básicos de tu perfil; nunca tu contraseña de Google.
          </li>
          <li>
            <strong>Datos de trabajo:</strong> la información que nuestro equipo y nuestros clientes
            cargan para gestionar proyectos: contactos, empresas, oportunidades, tareas, notas,
            documentos, facturas, formularios de onboarding y archivos adjuntos.
          </li>
          <li>
            <strong>Reservas de reuniones:</strong> nombre, email y los datos que completes al reservar.
          </li>
          <li>
            <strong>Reuniones grabadas:</strong> cuando usamos Fathom en una reunión, recibimos su
            resumen, transcripción y tareas acordadas.
          </li>
          <li>
            <strong>Emails:</strong> los emails que enviamos desde la plataforma pueden registrar si se
            abrieron y en qué enlaces se hizo clic.
          </li>
          <li>
            <strong>Datos técnicos:</strong> dirección IP, navegador y registros de actividad
            necesarios para la seguridad y el funcionamiento del servicio.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué los usamos',
    body: (
      <ul>
        <li>Autenticarte y mantener tu sesión.</li>
        <li>Prestar nuestros servicios: gestionar proyectos, propuestas, entregables, pagos y la comunicación con clientes.</li>
        <li>Enviar notificaciones, invitaciones, recordatorios de reuniones y documentos para firmar.</li>
        <li>Generar borradores de propuestas comerciales con asistencia de inteligencia artificial.</li>
        <li>Proteger la plataforma, prevenir abusos y cumplir obligaciones legales.</li>
      </ul>
    ),
  },
  {
    id: 'google',
    title: 'Datos de tu cuenta de Google',
    body: (
      <>
        <p>
          Si elegís iniciar sesión con Google, accedemos únicamente a tu nombre, email y foto de perfil
          (permisos <strong>openid</strong>, <strong>email</strong> y <strong>profile</strong>). Los
          usamos solo para identificarte y darte acceso a tu cuenta.
        </p>
        <p>
          No usamos esos datos para publicidad, no los vendemos y no los compartimos con terceros salvo
          con los proveedores necesarios para prestar el servicio. El uso de la información recibida de
          las APIs de Google cumple la{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Política de Datos del Usuario de los Servicios de API de Google
          </a>
          , incluidos los requisitos de uso limitado.
        </p>
      </>
    ),
  },
  {
    id: 'proveedores',
    title: 'Con quién los compartimos',
    body: (
      <>
        <p>No vendemos datos personales. Los compartimos únicamente con proveedores que nos ayudan a operar la plataforma, bajo sus propias obligaciones de confidencialidad y seguridad:</p>
        <ul>
          <li><strong>Clerk:</strong> autenticación e inicio de sesión.</li>
          <li><strong>Vercel:</strong> alojamiento de la aplicación, almacenamiento de archivos y caché.</li>
          <li><strong>Neon:</strong> base de datos.</li>
          <li><strong>Resend:</strong> envío de emails.</li>
          <li><strong>DocuSeal:</strong> firma electrónica de documentos.</li>
          <li><strong>Fathom:</strong> grabación y resumen de reuniones.</li>
          <li><strong>Anthropic y Google (Gemini):</strong> generación asistida de propuestas comerciales.</li>
        </ul>
        <p>
          Algunos de estos proveedores procesan datos fuera de la Argentina, principalmente en Estados
          Unidos. También podemos revelar datos cuando la ley o una autoridad competente lo exija.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <p>
        Usamos solo cookies necesarias para el funcionamiento: las de sesión de Clerk, que mantienen tu
        inicio de sesión, y una cookie que recuerda a qué portal de cliente entraste. No usamos cookies
        de publicidad.
      </p>
    ),
  },
  {
    id: 'conservacion',
    title: 'Conservación y seguridad',
    body: (
      <>
        <p>
          Conservamos los datos mientras dure la relación con el cliente o mientras sean necesarios para
          las finalidades descriptas y para cumplir obligaciones legales. Después los eliminamos o los
          anonimizamos.
        </p>
        <p>
          Aplicamos medidas técnicas y organizativas razonables: conexiones cifradas, acceso restringido
          por rol, archivos privados con enlaces de acceso temporales y separación de datos entre
          clientes.
        </p>
      </>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    body: (
      <>
        <p>
          Podés pedir acceso, rectificación, actualización o supresión de tus datos personales
          escribiendo a <ContactEmail />. Respondemos dentro de los plazos que fija la Ley 25.326 de
          Protección de los Datos Personales.
        </p>
        <p>
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
          mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
          interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley N°
          25.326. La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de
          la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
          quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en
          materia de protección de datos personales.
        </p>
      </>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    body: <p>La plataforma está pensada para uso profesional y no está dirigida a menores de 18 años.</p>,
  },
  {
    id: 'cambios',
    title: 'Cambios en esta política',
    body: (
      <p>
        Podemos actualizar esta política. Si el cambio es relevante, lo vamos a comunicar por email o
        dentro de la plataforma. La fecha de la última actualización figura al principio de esta página.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalDocument
      current="privacidad"
      eyebrow="Documento legal"
      title="Política de Privacidad"
      lede="Qué datos personales tratamos en el panel, el portal de clientes y las páginas públicas de Synous AI, para qué los usamos y cómo podés ejercer tus derechos."
      sections={SECTIONS}
    />
  )
}
