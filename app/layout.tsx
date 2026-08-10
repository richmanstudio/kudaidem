import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "@/features/places/place-photo.css";
import "@/features/places/place-experience.css";
import { AnalyticsClient } from "@/features/analytics/components/analytics-client";
import { BetaBoundary } from "@/features/beta/components/beta-boundary";
import { FeedbackWidget } from "@/features/beta/components/feedback-widget";
import { TelegramBridge } from "@/lib/telegram/telegram-bridge";

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
  const beta = process.env.BETA_MODE === "1";
  return (
    <html lang="ru">
      <body>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <TelegramBridge />
        <main className="app-shell">
          <BetaBoundary>
            <AnalyticsClient />
            {children}
            {beta ? <FeedbackWidget /> : null}
          </BetaBoundary>
        </main>
      </body>
    </html>
  );
}
