"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateChoreography } from "@/lib/api";

import SongList from "@/components/SongList";

export default function HomePage() {
  const router = useRouter();

  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">(
    "medium"
  );
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) setFile(droppedFile);
  }, []);

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
    <main className="h-screen w-full overflow-y-auto snap-y snap-mandatory scroll-smooth bg-black overflow-x-hidden">
      {/* Top section: Main content */}
      <div className="flex flex-col items-center justify-center h-screen w-full shrink-0 snap-start p-6">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight text-white mb-6">
            JustDance <span className="text-cyan-400">AI</span>
          </h1>
        </div>

        <Card className="w-full max-w-lg border-zinc-700 bg-zinc-900 text-white shadow-2xl">
          <CardHeader>
            <CardTitle>Upload a Song</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-600 p-8 transition hover:border-cyan-500 hover:bg-zinc-800/50"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.mp4,.mov,.webm"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file ? (
                <p className="text-sm text-zinc-300">{file.name}</p>
              ) : (
                <p className="text-sm text-zinc-500">
                  Drop a song or video here or click to browse
                </p>
              )}
            </div>

            {/* Difficulty selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-400">Difficulty:</span>
              {(["easy", "medium", "hard"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`rounded-md px-3 py-1 text-sm capitalize transition ${difficulty === level
                      ? "bg-cyan-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <Button
              onClick={handleGenerate}
              disabled={!file || isLoading}
              className="w-full bg-white text-black hover:bg-zinc-200"
              size="lg"
            >
              {isLoading ? "Generating..." : "Generate Choreography"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Bottom section: Song List bounded on the left */}
      <div className="h-screen w-full flex flex-col justify-center items-start px-12 shrink-0 snap-start overflow-hidden p-6">
        <SongList />
      </div>
    </main>
  );
}
