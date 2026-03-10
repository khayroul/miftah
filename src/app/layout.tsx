import type { Metadata } from "next";
import { Geist } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

const uthmani = localFont({
  src: "../../assets/fonts/KFGQPCUthmanTahaNaskh-Regular.ttf",
  variable: "--font-kfg-uthmani",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Miftah — مفتاح",
  description: "Memorize the Quran by understanding, not just repetition.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ms">
      <body className={`${geist.variable} ${uthmani.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
