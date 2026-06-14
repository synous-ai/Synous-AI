export interface ClientBranding {
  id: string
  email: string
  brandSlug: string | null
  brandName: string | null
  brandLogoKey: string | null
  logoUrl: string | null
  brandPrimary: string | null
  brandSecondary: string | null
}

export interface UpdateBrandingInput {
  brandSlug?: string | null
  brandName?: string | null
  brandLogoKey?: string | null
  brandPrimary?: string | null
  brandSecondary?: string | null
}
