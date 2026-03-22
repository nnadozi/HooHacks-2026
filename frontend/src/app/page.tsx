"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import SongList from "@/components/SongList";
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

export default function HomePage() {
  const router = useRouter();

  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium"
  );
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const songListRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"public" | "recent">("public");

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

  const scrollToSessions = () => {
    songListRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleGenerate = async () => {
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateChoreography(file, difficulty, null);
      router.push(`/choreography/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="h-screen w-full snap-y snap-mandatory overflow-x-hidden overflow-y-auto scroll-smooth">
      <div className="flex h-screen w-full shrink-0 snap-start flex-col items-center justify-center p-6">
        <div className="mb-10 max-w-md text-center">
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            New choreography
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            Upload audio or video. Preview the skeleton, record your run, get a score
            and short notes.
          </p>
        </div>

        <Card className="w-full max-w-lg border-border shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle>File</CardTitle>
            <CardDescription>
              Audio (common formats) or video (MP4, MOV, WebM).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 p-9 transition-colors",
                "hover:border-primary/40 hover:bg-muted/60"
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
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button
              onClick={handleGenerate}
              disabled={!file || isLoading}
              className="w-full"
              size="lg"
            >
              {isLoading ? "Generating…" : "Generate"}
            </Button>

            <Separator />

            <Button
              type="button"
              variant="ghost"
              className="w-full gap-1 text-muted-foreground hover:text-foreground"
              onClick={scrollToSessions}
            >
              Sessions
              <ChevronDown className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <div
        ref={songListRef}
        className="flex h-screen w-full shrink-0 snap-start flex-col justify-center overflow-hidden p-6 sm:px-10"
      >
        <SongList activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
    </main>
  );
}
