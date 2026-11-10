import type { NextConfig } from "next";

/**
 * Exportação estática: o app roda 100% no navegador (IndexedDB) e pode ser
 * hospedado em qualquer servidor de arquivos estáticos com HTTPS.
 *
 * Para publicar em um subcaminho (ex.: GitHub Pages), defina
 * NEXT_PUBLIC_BASE_PATH=/nome-do-repo antes do build.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Tailwind CSS v4 via loader do Turbopack (configuração gerada pelo create-next-app)
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
