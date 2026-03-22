"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Home" },
  { href: "/editor", label: "Editor" },
] as const;

export default function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/85 shadow-[0_1px_0_0_color-mix(in_oklch,var(--primary)_8%,transparent)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-0 outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
        >
          <img
            src="/logo.png"
            alt=""
         
            height={130}
            decoding="async"
            className="block h-14 w-auto max-h-14 shrink-0 object-contain"
          />
        </Link>
        <div className="flex shrink-0 items-center gap-0.5">
          <nav className="flex items-center" aria-label="Main">
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    active &&
                      "bg-muted/80 font-medium text-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
