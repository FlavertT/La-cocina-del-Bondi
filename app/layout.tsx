import type { Metadata } from "next";
import "./globals.css";
import "./bondi.css";

export const metadata: Metadata = {
  title: "La Cocina del Bondi · Gestión",
  description: "Compras, stock y entregas de viandas por empresa.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
