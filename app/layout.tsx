import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { TelegramBridge } from "@/components/telegram-bridge";

export const metadata: Metadata = {
  title: "Куда идём?",
  description: "Telegram Mini App, которое решает, куда сходить сегодня.",
  applicationName: "Куда идём?",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Куда идём?", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f7f5",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramBridge />
        <main className="app-shell">{children}</main>
      </body>
    </html>
  );
}
