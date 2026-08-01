/** @type {import('next').NextConfig} */
const nextConfig = {
  // standalone output 让 `next build` 生成 server.js + 必要依赖到 .next/standalone
  // Docker 构建时只需 COPY 该目录，大幅减小镜像体积
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
}
export default nextConfig
