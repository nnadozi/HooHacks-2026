import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";
import AppHeader from "@/components/AppHeader";
import Providers from "@/components/providers";
import { cn } from "@/lib/utils";

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
      className={cn(GeistSans.variable, GeistMono.variable, "h-full antialiased")}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground">
        <Providers>
          <AppHeader />
          <div className="flex flex-1 flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
