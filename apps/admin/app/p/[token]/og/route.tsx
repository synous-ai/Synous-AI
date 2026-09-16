import { ImageResponse } from 'next/og'
import { proposal as template } from '@/app/portal/propuesta/proposal-content'

export const dynamic = 'force-dynamic'

/**
 * Imagen de la vista previa del link (1200×630), con el nombre del cliente.
 *
 * Todo es texto y degradé, sin archivos: así no depende de dónde quede
 * `public/` en el deploy.
 *
 * NO consulta la API: el endpoint público marca la propuesta como vista y
 * avisa a los admins la primera vez, y esta imagen la piden los bots de
 * WhatsApp, Slack y compañía apenas se pega el link, antes de que el cliente
 * lo abra. Nombre y fecha salen de la plantilla, que es pública igual.
 */
export function GET() {
  const client: string | undefined = template.envelope.recipient
  const date: string | undefined = template.envelope.dateLabel

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          color: '#eaf2ff',
          background: 'radial-gradient(circle at 78% 18%, #1c73ca 0%, #0b1430 42%, #010511 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, letterSpacing: 6 }}>SYNOUS</div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 4, color: '#96c0ff' }}>
            {date ? `PROPUESTA · ${date.toUpperCase()}` : 'PROPUESTA'}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 18,
              fontSize: client && client.length > 18 ? 76 : 104,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            {client ?? 'Tu propuesta está lista'}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 28, color: '#b9cbe6' }}>
          Alcance, inversión y próximos pasos
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
