import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "@/styles/mushaf-live.css";

const arabicText = localFont({
  src: "../../assets/fonts/UthmanicHafs_V22.ttf",
  variable: "--font-quran-arabic",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Miftah — مفتاح",
  description: "Memorize the Quran by understanding, not just repetition.",
};

import { ReadAudioProvider } from "@/components/ReadAudioProvider";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ReadingStateSync } from "@/components/ReadingStateSync";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { UpdateBanner } from "@/components/UpdateBanner";
import { PwaDebugLoader } from "@/components/PwaDebugLoader";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var storageKey = "miftah:theme";
                  var theme = localStorage.getItem(storageKey);
                  var supportDarkMode = window.matchMedia("(prefers-color-scheme: dark)").matches === true;
                  if (!theme && supportDarkMode) theme = "dark";
                  if (!theme) theme = "light";
                  document.documentElement.dataset.theme = theme;
                  if (theme === "dark") {
                    document.documentElement.classList.add("dark");
                  } else {
                    document.documentElement.classList.remove("dark");
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <meta name="theme-color" content="#1a1a2e" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${arabicText.variable} antialiased`}>
        <ServiceWorkerRegistrar />
        <ReadingStateSync />
        <OfflineIndicator />
        <UpdateBanner />
        <PwaDebugLoader />
        <ReadAudioProvider>{children}</ReadAudioProvider>
      </body>
    </html>
  );
}
