// Labels legibles para valores que se guardan en minúscula (ej. contact.custom.source).

const SOURCE_LABELS: Record<string, string> = {
  onboarding: 'Onboarding',
  prospecting: 'Prospección',
  setter: 'Setter',
  whatsapp: 'WhatsApp',
  referral: 'Recomendación',
  web_form: 'Formulario web',
  instagram: 'Instagram',
}

/** Fuente del lead capitalizada/legible. Fallback: capitaliza la primera letra. */
export function sourceLabel(s: string | null | undefined): string | null {
  if (!s) return null
  return SOURCE_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)
}
