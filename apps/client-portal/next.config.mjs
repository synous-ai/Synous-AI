/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El lint se corre aparte (pnpm lint); no bloquea el build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@nous/shared', '@nous/api-client'],
}

export default nextConfig
