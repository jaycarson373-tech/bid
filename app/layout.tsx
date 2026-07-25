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
  title: "BID — BID the Block",
  description:
    "Trade real estate outcomes across the world’s fastest-moving cities. YES/NO, head-to-head, and five-city markets on Solana.",
  icons: {
    icon: "/brand/bid-logo.png",
    apple: "/brand/bid-logo.png",
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "BID — BID the Block",
    description:
      "Real estate prediction markets on Solana. Trade cities, price housing, bet the block.",
    url: "/",
    siteName: "BID",
    type: "website",
    images: [
      {
        url: "/brand/bid-x-banner.png",
        width: 1500,
        height: 500,
        alt: "BID — BID the Block",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BID — BID the Block",
    description:
      "Real estate prediction markets on Solana. Trade cities, price housing, bet the block.",
    images: ["/brand/bid-x-banner.png"],
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
