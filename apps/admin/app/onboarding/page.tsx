import { OnboardingWizard } from '@portal/components/onboarding/onboarding-wizard'

export const metadata = {
  title: 'Empecemos tu proyecto — NOUS',
  description: 'Contanos sobre tu proyecto en 2 minutos.',
}

/**
 * Onboarding PÚBLICO de NOUS (funnel pre-venta). Vive en la raíz (apex), NO
 * bajo /portal. Estética dark-only (glassmorphism + acento verde + fondo de
 * rayos SideRays reutilizado de la propuesta): el wizard fuerza `.dark` internamente,
 * por eso no hay toggle de tema acá.
 */
export default function OnboardingPage() {
  return <OnboardingWizard />
}
