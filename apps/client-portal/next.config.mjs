/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El lint se corre aparte (pnpm lint); no bloquea el build.
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@devduo/shared', '@devduo/api-client'],
}

export default nextConfig
