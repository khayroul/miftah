import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import localFont from "next/font/local";
import "./globals.css";
import "@/styles/mushaf-live.css";

const arabicText = localFont({
  // woff2 re-encode of UthmanicHafs_V22.ttf: 297,700 B -> 106,988 B (64%
  // smaller on disk, same glyph outlines/metrics — behavior-identical
  // render). woff2 has had universal browser support since ~2016, so no
  // ttf fallback entry is carried here (would only add transfer weight).
  // The source .ttf stays in assets/fonts/ for future re-encodes.
  src: "../../assets/fonts/UthmanicHafs_V22.woff2",
  variable: "--font-quran-arabic",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: "Miftah — مفتاح",
    description: t("description"),
  };
}

import { ReadingStateSync } from "@/features/read";
import { FahamPwaDebugLoader } from "@/features/faham/client-debug";
import {
  OfflineIndicator,
  ServiceWorkerRegistrar,
  UpdateBanner,
} from "@/shared/pwa/components";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
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
        <meta
          name="theme-color"
          content="#f6f3eb"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#061224"
          media="(prefers-color-scheme: dark)"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body className={`${arabicText.variable} antialiased`}>
        <NextIntlClientProvider>
          <ServiceWorkerRegistrar />
          <ReadingStateSync />
          <OfflineIndicator />
          <UpdateBanner />
          <FahamPwaDebugLoader />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
