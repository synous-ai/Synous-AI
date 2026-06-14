import { BrandKitForm } from '@portal/components/branding/brand-kit-form'

export const metadata = { title: 'Mi Marca — Portal' }

export default function MarcaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tu Marca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cargá tu logo, nombre y colores. Lo usamos para trabajar en tu proyecto y para que este
          portal se vea como tu propia plataforma.
        </p>
      </div>
      <BrandKitForm />
    </div>
  )
}
