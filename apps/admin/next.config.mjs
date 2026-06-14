import withBundleAnalyzerInit from '@next/bundle-analyzer'

// Analyzer de bundle gateado por ANALYZE=true (solo para medir el baseline de performance).
const withBundleAnalyzer = withBundleAnalyzerInit({ enabled: process.env.ANALYZE === 'true' })

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El lint se corre aparte (pnpm lint); no bloquea el build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@devduo/shared', '@devduo/api-client'],
}

export default withBundleAnalyzer(nextConfig)
