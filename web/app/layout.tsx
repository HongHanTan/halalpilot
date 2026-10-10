import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HalalPilot",
  description: "Drop in your food business folder, get a halal certification readiness pack with every claim traced to a file.",
  icons: { icon: "/avatars/halalpilot.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
