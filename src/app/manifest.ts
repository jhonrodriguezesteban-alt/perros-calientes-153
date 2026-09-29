import type { MetadataRoute } from "next";

/** Para instalar la app en el celular o la tablet: el ícono es solo la salchicha. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bendito Perro Caliente",
    short_name: "Bendito",
    description: "Punto de venta y panel de gestión",
    start_url: "/pos",
    display: "standalone",
    orientation: "any",
    background_color: "#fff8f0",
    theme_color: "#4d1101",
    lang: "es-CO",
    icons: [
      { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/marca/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
