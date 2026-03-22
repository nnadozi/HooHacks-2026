import type { Metadata } from "next";

import "./globals.css";
import AppHeader from "@/components/AppHeader";
import Providers from "@/components/providers";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Remix",
  description: "Choreography preview, performance capture, and scored feedback.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
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
