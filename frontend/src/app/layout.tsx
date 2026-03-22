import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";

import "./globals.css";
import AppHeader from "@/components/AppHeader";
import Providers from "@/components/providers";
import { cn } from "@/lib/utils";

const fontSans = Outfit({
  subsets: ["latin"],
  variable: "--font-app-sans",
  display: "swap",
});

const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-app-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "JustDance AI",
  description: "AI-powered dance choreography and feedback",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(fontSans.variable, fontMono.variable, "h-full antialiased")}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <AppHeader />
          <div className="flex flex-1 flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
