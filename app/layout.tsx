import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const productionHost =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://www.bidrh.com"
    : "http://localhost:3000");
const description =
  "European-style, fully collateralized stock options on Solana. Starting with HOOD.";

export const metadata: Metadata = {
  metadataBase: new URL(productionHost),
  title: "HOOD OPTIONS — European Stock Options on Solana",
  description,
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "HOOD OPTIONS",
    description,
    url: "/",
    siteName: "HOOD OPTIONS",
    type: "website",
    images: [
      {
        url: "/brand/hood-options-hero.png",
        width: 2048,
        height: 683,
        alt: "HOOD OPTIONS on Solana",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "HOOD OPTIONS",
    description,
    images: ["/brand/hood-options-hero.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
