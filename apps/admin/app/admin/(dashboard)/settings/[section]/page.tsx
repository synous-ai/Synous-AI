'use client'

import { useParams } from 'next/navigation'
import { ShieldCheck, FileText, Globe, Puzzle, SlidersHorizontal, Sparkles, Palette } from 'lucide-react'
import { RolesSection } from './sections/RolesSection'
import { FormulariosSection } from './sections/FormulariosSection'
import { PortalClientesSection } from './sections/PortalClientesSection'
import { IntegracionesSection } from './sections/IntegracionesSection'
import { CamposSection } from './sections/CamposSection'
import { ProspeccionSection } from './sections/ProspeccionSection'
import { WhiteLabelSection } from './sections/WhiteLabelSection'

// ─────────────────────────────────────────────────────────────────────────────
// Section registry
// ─────────────────────────────────────────────────────────────────────────────

const SECTION_META: Record<
  string,
  { title: string; subtitle: string; icon: typeof ShieldCheck; component: () => React.JSX.Element }
> = {
  roles: {
    title: 'Roles y permisos',
    subtitle: 'Matriz de capacidades por rol. Los roles se asignan en la sección Usuarios.',
    icon: ShieldCheck,
    component: RolesSection,
  },
  'custom-fields': {
    title: 'Campos personalizados',
    subtitle: 'Definí campos extra para Contactos, Deals y Empresas. Los valores se guardan en el campo JSON "custom" de cada registro.',
    icon: SlidersHorizontal,
    component: CamposSection,
  },
  forms: {
    title: 'Formularios de intake',
    subtitle: 'Plantillas de onboarding que se asignan a deals para recopilar información del cliente.',
    icon: FileText,
    component: FormulariosSection,
  },
  'client-portal': {
    title: 'Portal de cliente',
    subtitle: 'Cuentas de acceso al portal del cliente y sus deals asociados.',
    icon: Globe,
    component: PortalClientesSection,
  },
  integrations: {
    title: 'Integraciones',
    subtitle: 'Estado de las integraciones externas. La configuración va en variables de entorno.',
    icon: Puzzle,
    component: IntegracionesSection,
  },
  prospecting: {
    title: 'Prospección',
    subtitle: 'Definí qué ofrece la agencia. Se usa como contexto por defecto para la IA al prospectar.',
    icon: Sparkles,
    component: ProspeccionSection,
  },
  'white-label': {
    title: 'White-Label',
    subtitle: 'Branding del portal por cliente: logo, nombre y colores. Cada cliente entra por su propia URL.',
    icon: Palette,
    component: WhiteLabelSection,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Page dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export default function SettingsSectionPage() {
  const params = useParams<{ section: string }>()
  const section = params.section

  const meta = SECTION_META[section]

  if (!meta) {
    return (
      <div className="p-6">
        <p className="eyebrow">Ajustes</p>
        <h1 className="text-2xl font-medium tracking-tight">Sección no encontrada</h1>
        <p className="mt-2 text-muted-foreground">La sección &ldquo;{section}&rdquo; no existe.</p>
      </div>
    )
  }

  const { title, subtitle, icon: Icon, component: SectionComponent } = meta

  return (
    <div className="p-6">
      <div className="mb-6">
        <p className="eyebrow">Configuración</p>
        <div className="flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <SectionComponent />
    </div>
  )
}
