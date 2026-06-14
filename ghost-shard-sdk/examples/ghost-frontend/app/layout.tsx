import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "GhostShard Dashboard",
  description: "Privacy-preserving Ethereum asset management with stealth addresses",
  // viewport: {
  //   width: "device-width",
  //   initialScale: 1,
  //   maximumScale: 1,
  //   userScalable: false,
  // },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("bg-background", "font-sans", geist.variable)}>
      <body className={`${geist.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
