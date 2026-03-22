"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import SongList from "@/components/SongList";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { generateChoreography } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Scroll sessions panel into view (works with sticky header). */
function scrollSessionsIntoView(el: HTMLElement | null) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function HomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium"
  );
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const songListRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<"public" | "recent">("public");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const goToSessions = (tab: "public" | "recent") => {
    setActiveTab(tab);
    // Defer until React commits tab + Tabs panel visibility.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollSessionsIntoView(songListRef.current);
      });
    });
  };

  const handleGenerate = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateChoreography(file, difficulty, null);
      queryClient.invalidateQueries({ queryKey: ["user-history"] });
      router.push(`/choreography/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="relative min-h-[calc(100dvh-3.5rem)] w-full overflow-x-hidden pb-16">
      {/* Top: natural height — avoids clipping when the card is taller than the viewport */}
      <section className="mx-auto w-full max-w-2xl px-4 pb-10 pt-8 sm:px-6">
        <div className="mb-10 w-full text-center">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm backdrop-blur-sm">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_8px_2px_color-mix(in_oklch,var(--primary)_45%,transparent)]" />
            Dance lab
          </p>
          <h1 className="font-heading text-4xl font-bold tracking-[-0.04em] text-foreground sm:text-5xl">
            New routine
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Upload audio or video, preview the skeleton, record your run, then see a
            score and short notes.
          </p>
        </div>

        <Card className="w-full gap-0 overflow-hidden rounded-2xl border-2 border-primary/15 bg-card/95 py-0 shadow-xl shadow-primary/[0.07] ring-1 ring-border/60 backdrop-blur-[2px]">
          <div
            className="h-1 w-full shrink-0 bg-gradient-to-r from-transparent via-primary/70 to-transparent"
            aria-hidden
          />
          <CardHeader className="space-y-1 px-4 pb-2 pt-6 sm:px-5">
            <CardTitle className="font-heading text-lg">Upload</CardTitle>
            <CardDescription>
              Audio (common formats) or video (MP4, MOV, WebM).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 px-4 pb-6 pt-2 sm:px-5">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/25 bg-primary/[0.06] p-9 transition-all",
                "hover:border-primary/45 hover:bg-primary/[0.1] hover:shadow-inner"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.mp4,.mov,.webm"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <p className="text-center text-sm font-medium text-foreground">
                  {file.name}
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  Drop a file here or click to choose
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-muted-foreground">Difficulty</Label>
              <ToggleGroup
                value={[difficulty]}
                onValueChange={(next) => {
                  const v = next[0];
                  if (v === "easy" || v === "medium" || v === "hard") {
                    setDifficulty(v);
                  }
                }}
                variant="outline"
                spacing={0}
                className="w-full justify-stretch"
              >
                {(["easy", "medium", "hard"] as const).map((level) => (
                  <ToggleGroupItem
                    key={level}
                    value={level}
                    className="flex-1 capitalize"
                  >
                    {level}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            {error && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!file || isLoading}
              className="w-full min-h-12 rounded-xl text-base font-semibold shadow-lg shadow-primary/25 transition-[transform,box-shadow] hover:shadow-xl hover:shadow-primary/30 active:translate-y-px disabled:shadow-none"
              size="lg"
            >
              {isLoading ? "Generating…" : "Generate"}
            </Button>

            <Separator />

            <div className="space-y-3">
              <p className="text-center text-xs text-muted-foreground">
                Jump to sessions
              </p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full"
                  onClick={() => goToSessions("public")}
                >
                  How it works
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full"
                  onClick={() => goToSessions("recent")}
                >
                  Recent
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        ref={songListRef}
        id="sessions"
        className="scroll-mt-20 border-t border-border/70 bg-gradient-to-b from-muted/25 to-muted/5 px-4 py-12 sm:px-8"
      >
        <div className="mx-auto w-full max-w-4xl">
          <h2 className="mb-8 flex items-center gap-2 font-heading text-xl font-bold tracking-tight text-foreground">
            <span
              className="h-px flex-1 max-w-[3rem] bg-gradient-to-r from-transparent to-primary/50"
              aria-hidden
            />
            Sessions
            <span
              className="h-px flex-1 bg-gradient-to-l from-transparent to-primary/50"
              aria-hidden
            />
          </h2>
          <SongList activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
      </section>
    </main>
  );
}
