import axios from 'axios'

/**
 * Scraper liviano de emails: baja el HTML de la home del negocio y extrae el
 * primer email plausible vía regex. Best-effort (~65% de cobertura).
 *
 * No sigue links internos ni rinde JS — es deliberadamente simple y rápido.
 * Si falla (timeout, 403, sin email), devuelve null sin tirar error: el
 * prospecto se guarda igual sin email.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g

// Falsos positivos típicos en HTML (assets, librerías, ejemplos).
const JUNK_PATTERNS = [
  /\.(png|jpe?g|gif|svg|webp|css|js)$/i,
  /@(2x|3x)\b/i,
  /(example|sentry|wixpress|godaddy|sentry\.io|domain)\./i,
  /^[0-9a-f]{16,}@/i, // hashes
]

function isPlausible(email: string): boolean {
  if (email.length > 60) return false
  return !JUNK_PATTERNS.some((re) => re.test(email))
}

export async function scrapeEmail(website: string): Promise<string | null> {
  try {
    const url = website.startsWith('http') ? website : `https://${website}`
    const { data } = await axios.get<string>(url, {
      timeout: 8_000,
      maxContentLength: 2_000_000,
      responseType: 'text',
      // Algunos sitios bloquean clients sin UA "de navegador".
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NOUSCRM/1.0; +https://nous.dev) prospecting-bot',
        Accept: 'text/html',
      },
      // No queremos que un redirect a un esquema raro rompa todo.
      maxRedirects: 3,
    })

    if (typeof data !== 'string') return null

    const matches = data.match(EMAIL_REGEX)
    if (!matches) return null

    const candidate = matches
      .map((m) => m.toLowerCase())
      .find(isPlausible)

    return candidate ?? null
  } catch {
    return null
  }
}
