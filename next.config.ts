import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El service worker de las notificaciones siempre fresco
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  experimental: {
    // Las páginas del panel no traen datos del servidor (los piden en el
    // navegador), así que se pueden reusar al volver a un módulo.
    staleTimes: { dynamic: 300 },
  },
};

export default nextConfig;
