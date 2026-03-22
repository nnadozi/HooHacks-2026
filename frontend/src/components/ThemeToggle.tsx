"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/** Light / dark / system follow resolved theme; hidden until client to avoid hydration mismatch. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();

  const isDark = resolvedTheme === "dark";

  if (!mounted) {
    return <div className={cn("size-9 shrink-0", className)} aria-hidden />;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("size-9 text-muted-foreground hover:text-foreground", className)}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun className="size-[1.125rem]" strokeWidth={1.75} />
      ) : (
        <Moon className="size-[1.125rem]" strokeWidth={1.75} />
      )}
    </Button>
  );
}
