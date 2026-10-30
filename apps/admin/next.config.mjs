import withBundleAnalyzerInit from '@next/bundle-analyzer'

// Analyzer de bundle gateado por ANALYZE=true (solo para medir el baseline de performance).
const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El lint se corre aparte (pnpm lint); no bloquea el build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@synous/shared', '@synous/api-client'],
  // Los documentos de alcance no están en `public/` (se bajan solo con acceso):
  // hay que sumarlos a mano al bundle de las rutas que los leen del disco.
  experimental: {
    outputFileTracingIncludes: {
      '/p/[token]/alcance': ['./assets/proposals/*.pdf'],
      '/admin/proposal-preview/[template]/alcance': ['./assets/proposals/*.pdf'],
    },
  },
}

export default withBundleAnalyzer(nextConfig)
