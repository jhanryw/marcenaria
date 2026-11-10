import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/bootstrap";
import { assetUrl } from "@/lib/pwa";

const splash = (w: number, h: number, ratio: number) => ({
  url: assetUrl(`/icons/splash-${w}x${h}.png`),
  media: `(device-width: ${w / ratio}px) and (device-height: ${h / ratio}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: portrait)`,
});

export const metadata: Metadata = {
  title: { default: "Marcenaria — Orçamentos", template: "%s · Marcenaria" },
  description: "Plano de corte de MDF, custos e preço de venda para marcenaria. Funciona offline.",
  applicationName: "Marcenaria",
  manifest: assetUrl("/manifest.webmanifest"),
  icons: {
    icon: [
      { url: assetUrl("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: assetUrl("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: assetUrl("/icons/apple-touch-icon.png"), sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "Marcenaria",
    statusBarStyle: "default",
    startupImage: [
      splash(1170, 2532, 3), // iPhone 12/13/14
      splash(1179, 2556, 3), // iPhone 14 Pro/15/16
      splash(1290, 2796, 3), // iPhone Pro Max
      splash(750, 1334, 2), // iPhone SE / 8
      splash(1125, 2436, 3), // iPhone X/XS/11 Pro
      splash(828, 1792, 2), // iPhone XR/11
    ],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1f4a3a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
