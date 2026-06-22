import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import "./globals.css";

// Editorial display serif — wordmark, headline, history label, heading input.
const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Article Image Generation",
  description:
    "Generate abstract editorial artwork to sit beside an article heading, powered by MAI-Image-2.5.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={newsreader.variable}>
      <body>{children}</body>
    </html>
  );
}
