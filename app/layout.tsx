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
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(productionHost),
  title: "BID — Bet the Block",
  description:
    "Three curated real estate prediction markets, seeded by BID and designed for Parcl-powered resolution on Solana.",
  icons: {
    icon: "/brand/bid-logo.png",
    apple: "/brand/bid-logo.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "BID — Bet the Block",
    description:
      "Three curated real estate markets. $50 USDC allocated to seed each. Resolution data by Parcl Labs.",
    url: "/",
    siteName: "BID",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 600,
        alt: "BID — three genesis real estate prediction markets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BID — Bet the Block",
    description:
      "Three curated real estate markets. $50 USDC allocated to seed each. Resolution data by Parcl Labs.",
    images: ["/og.png"],
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
