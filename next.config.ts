import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Las páginas del panel no traen datos del servidor (los piden en el
    // navegador), así que se pueden reusar al volver a un módulo.
    staleTimes: { dynamic: 300 },
  },
};

export default nextConfig;
