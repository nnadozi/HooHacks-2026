import type { Metadata } from "next";
import { JetBrains_Mono, Roboto } from "next/font/google";

import "./globals.css";
import AppHeader from "@/components/AppHeader";
import Providers from "@/components/providers";
import { cn } from "@/lib/utils";

/** Roboto for UI + headings; `className` on `<html>` ensures the face applies reliably. */
const roboto = Roboto({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-token",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remix",
  description: "Choreography preview, performance capture, and scored feedback.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        roboto.variable,
        roboto.className,
        jetbrainsMono.variable,
        "h-full antialiased"
      )}
      suppressHydrationWarning
    >
      <body
        className="min-h-full flex flex-col bg-background text-foreground"
        suppressHydrationWarning
      >
        <Providers>
          <AppHeader />
          <div className="remix-page-bg relative flex min-h-0 flex-1 flex-col">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
