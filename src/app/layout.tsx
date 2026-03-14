import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

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
      </head>
      <body className={`${geist.variable} ${arabicText.variable} antialiased`}>
        <ReadAudioProvider>{children}</ReadAudioProvider>
      </body>
    </html>
  );
}
