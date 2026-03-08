/** @type {import('next').NextConfig} */
// Куда проксировать /api-proxy. В Docker задайте BACKEND_URL=http://backend:4000. Локально — NEXT_PUBLIC_API_BASE_URL или localhost:4000
const API_TARGET = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lightweight-charts"],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/api-proxy/:path*", destination: `${API_TARGET}/:path*` },
    ];
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:4000",
    // Для реферальной программы на отдельном домене: URL API основного сайта
    NEXT_PUBLIC_REFERRAL_API_URL: process.env.NEXT_PUBLIC_REFERRAL_API_URL || "",
  },
};

export default nextConfig;

