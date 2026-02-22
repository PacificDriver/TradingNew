/** @type {import('next').NextConfig} */
const API_TARGET = "https://bdauratrade.ngrok.app";

const nextConfig = {
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false
  },
  async rewrites() {
    return [
      { source: "/api-proxy/:path*", destination: `${API_TARGET}/:path*` },
    ];
  },
  env: {
    NEXT_PUBLIC_API_BASE_URL: "/api-proxy",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "wss://bdauratrade.ngrok.app",
  },
};

export default nextConfig;

