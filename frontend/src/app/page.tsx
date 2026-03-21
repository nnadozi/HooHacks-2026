"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { generateChoreography } from "@/lib/api";

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
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          JustDance <span className="text-cyan-400">AI</span>
        </h1>
        <p className="mt-3 text-lg text-zinc-400">
          Upload a song, get a choreography, dance it out
        </p>
      </div>

      <Card className="w-full max-w-lg border-zinc-700 bg-zinc-900">
        <CardHeader>
          <CardTitle>Upload a Song</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-zinc-600 p-8 transition hover:border-cyan-500"
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
                className={`rounded-md px-3 py-1 text-sm capitalize transition ${
                  difficulty === level
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
            className="w-full"
            size="lg"
          >
            {isLoading ? "Generating..." : "Generate Choreography"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
