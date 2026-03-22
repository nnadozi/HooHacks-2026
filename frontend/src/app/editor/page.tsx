"use client";

import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import StickFigure3D from "@/components/StickFigure3D";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRoutine, getMove, listMoves } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Keypoint, Move, MoveSummary } from "@/types";

const MOVE_MIME = "application/x-remix-move";
const TIMELINE_MIME = "application/x-remix-timeline-index";

function formatDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 10) / 100);
  return `${s.toFixed(2)}s`;
}

function moveItem<T>(arr: T[], fromIndex: number, toIndex: number) {
  const next = arr.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export default function EditorPage() {
  const router = useRouter();
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "all">(
    "all"
  );
  const [search, setSearch] = useState("");
  const [routineName, setRoutineName] = useState("My Routine");
  const [timeline, setTimeline] = useState<string[]>([]);
  const [selectedMoveId, setSelectedMoveId] = useState<string | null>(null);
  const [hoverPreview, setHoverPreview] = useState<{
    moveId: string;
    top: number;
    left: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data: movesData, isLoading: isMovesLoading, refetch } = useQuery({
    queryKey: ["moves", difficulty],
    queryFn: () =>
      listMoves({
        difficulty: difficulty === "all" ? undefined : difficulty,
        limit: 200,
      }),
  });

  const filteredMoves: MoveSummary[] = useMemo(() => {
    const moves = movesData?.moves ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return moves;
    return moves.filter((m) => {
      const haystack = `${m.id} ${(m.genre_tags || []).join(" ")} ${m.difficulty}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [movesData?.moves, search]);

  const moveSummaryById = useMemo(() => {
    const map = new Map<string, MoveSummary>();
    for (const m of movesData?.moves ?? []) map.set(m.id, m);
    return map;
  }, [movesData?.moves]);

  const selectedMoveQuery = useQuery({
    queryKey: ["move", selectedMoveId],
    queryFn: () => getMove(selectedMoveId as string),
    enabled: !!selectedMoveId,
    staleTime: Infinity,
  });

  const hoveredMoveQuery = useQuery({
    queryKey: ["move", hoverPreview?.moveId],
    queryFn: () => getMove(hoverPreview?.moveId as string),
    enabled: !!hoverPreview?.moveId,
    staleTime: Infinity,
  });

  const uniqueTimelineMoveIds = useMemo(
    () => Array.from(new Set(timeline)),
    [timeline]
  );

  const timelineMoveQueries = useQueries({
    queries: uniqueTimelineMoveIds.map((id) => ({
      queryKey: ["move", id],
      queryFn: () => getMove(id),
      staleTime: Infinity,
      enabled: uniqueTimelineMoveIds.length > 0,
    })),
  });

  const moveById = useMemo(() => {
    const map = new Map<string, Move>();
    for (const q of timelineMoveQueries) {
      if (q.data) map.set(q.data.id, q.data);
    }
    return map;
  }, [timelineMoveQueries]);

  const routineFrames: Keypoint[][] = useMemo(() => {
    return timeline.flatMap((id) => moveById.get(id)?.keypoints ?? []);
  }, [timeline, moveById]);

  const totalDurationMs = useMemo(() => {
    return timeline.reduce((sum, id) => sum + (moveSummaryById.get(id)?.duration_ms ?? 0), 0);
  }, [timeline, moveSummaryById]);

  const saveRoutine = useMutation({
    mutationFn: () =>
      createRoutine({
        name: routineName,
        move_sequence: timeline,
      }),
    onSuccess: (res) => {
      alert(`Saved routine: ${res.name} (${res.id})`);
    },
    onError: (err) => {
      alert(err instanceof Error ? err.message : "Failed to save routine");
    },
  });

  const handleDropOnTimeline = (e: React.DragEvent, insertIndex: number | null) => {
    e.preventDefault();

    const moveId = e.dataTransfer.getData(MOVE_MIME);
    const fromIndexRaw = e.dataTransfer.getData(TIMELINE_MIME);
    const fromIndex = fromIndexRaw ? Number(fromIndexRaw) : null;
    const targetIndex = insertIndex ?? timeline.length;

    if (moveId) {
      setTimeline((prev) => {
        const next = prev.slice();
        next.splice(targetIndex, 0, moveId);
        return next;
      });
      return;
    }

    if (fromIndex !== null && !Number.isNaN(fromIndex)) {
      setTimeline((prev) => {
        const boundedFrom = Math.min(Math.max(fromIndex, 0), prev.length - 1);
        let boundedTo = Math.min(Math.max(targetIndex, 0), prev.length);
        if (boundedTo > boundedFrom) boundedTo -= 1;
        if (boundedFrom === boundedTo) return prev;
        return moveItem(prev, boundedFrom, boundedTo);
      });
    }
  };

  return (
    <main className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background text-foreground">
      <aside className="flex w-80 shrink-0 flex-col gap-4 border-r border-border p-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-heading text-base font-semibold">Move bin</h1>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="move-search" className="sr-only">
            Search moves
          </Label>
          <Input
            id="move-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search moves…"
            className="bg-background"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs text-muted-foreground">Difficulty</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as typeof difficulty)}
          >
            <SelectTrigger className="h-8 flex-1">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <ScrollArea className="min-h-0 flex-1 rounded-lg border border-border">
          <div className="p-2">
            {isMovesLoading ? (
              <p className="p-3 text-sm text-muted-foreground">Loading moves…</p>
            ) : filteredMoves.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No moves found. Generate choreography from a video to seed the pool.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredMoves.map((m) => {
                  const isSelected = selectedMoveId === m.id;
                  return (
                    <Button
                      key={m.id}
                      type="button"
                      variant="ghost"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(MOVE_MIME, m.id);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      onClick={() => setSelectedMoveId(m.id)}
                      onDoubleClick={() => setTimeline((prev) => [...prev, m.id])}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const desiredLeft = rect.right + 12;
                        const maxLeft = Math.max(12, window.innerWidth - 340);
                        const left = Math.min(desiredLeft, maxLeft);
                        const desiredTop = rect.top;
                        const maxTop = Math.max(12, window.innerHeight - 320);
                        const top = Math.min(desiredTop, maxTop);
                        setHoverPreview({ moveId: m.id, top, left });
                      }}
                      onMouseLeave={() => setHoverPreview(null)}
                      className={cn(
                        "h-auto w-full flex-col items-stretch gap-1 px-3 py-2 font-normal",
                        isSelected && "border border-foreground/15 bg-muted/80"
                      )}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs text-foreground">
                          {m.id.slice(0, 10)}…
                        </span>
                        <Badge variant="outline" className="shrink-0 capitalize">
                          {m.difficulty}
                        </Badge>
                      </div>
                      <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                        <span>{formatDuration(m.duration_ms)}</span>
                        <span>
                          {m.bpm_range?.[0]}–{m.bpm_range?.[1]} BPM
                        </span>
                      </div>
                    </Button>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        <p className="text-xs text-muted-foreground">
          Drag into the timeline, or double-click to append.
        </p>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => router.push("/")}>
              Home
            </Button>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <Label htmlFor="routine-name" className="sr-only">
              Routine name
            </Label>
            <Input
              id="routine-name"
              value={routineName}
              onChange={(e) => setRoutineName(e.target.value)}
              className="w-56 max-w-full bg-background sm:w-72"
            />
            <span className="text-xs text-muted-foreground">
              {timeline.length} clips · {formatDuration(totalDurationMs)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPlaying((p) => !p)}
              disabled={routineFrames.length === 0}
            >
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              type="button"
              onClick={() => saveRoutine.mutate()}
              disabled={saveRoutine.isPending || timeline.length === 0}
            >
              {saveRoutine.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Timeline</CardTitle>
            <CardDescription>Drop moves or reorder clips.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnTimeline(e, null)}
              className="flex h-full min-h-[200px] flex-col rounded-lg border border-dashed border-border bg-muted/20 p-3"
            >
              {timeline.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Drag moves here to build a routine.
                </div>
              ) : (
                <div className="flex flex-wrap items-start gap-2">
                  {timeline.map((id, index) => {
                    const summary = moveSummaryById.get(id);
                    const label = summary ? `${formatDuration(summary.duration_ms)}` : "";

                    return (
                      <div
                        key={`${id}-${index}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(TIMELINE_MIME, String(index));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnTimeline(e, index)}
                        className="group flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm"
                      >
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-mono text-xs text-foreground">
                            {id.slice(0, 10)}…
                          </span>
                          <span className="text-[11px] text-muted-foreground">{label}</span>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() =>
                            setTimeline((prev) => prev.filter((_, i) => i !== index))
                          }
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <aside className="flex w-[min(720px,42vw)] shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-4">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Preview</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <StickFigure3D
              frames={routineFrames}
              fps={30}
              isPlaying={isPlaying}
              width={640}
              height={480}
              autoMirrorX
              depthScale={0.12}
            />
            <p className="w-full text-xs text-muted-foreground">
              {timeline.length === 0
                ? "Add clips to preview your routine."
                : routineFrames.length === 0
                  ? "Loading keypoints…"
                  : "Plays the full routine in a loop."}
            </p>
            <p className="w-full text-[11px] text-muted-foreground/80">
              Model: “Low Poly Stick Figure Rigged” by Robersonjr.walker (CC-BY-4.0).
            </p>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Selected move</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {!selectedMoveId ? (
              <p className="text-muted-foreground">Click a move in the bin.</p>
            ) : selectedMoveQuery.isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : selectedMoveQuery.data ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-foreground">
                    {selectedMoveQuery.data.id}
                  </span>
                  <Badge variant="outline" className="capitalize">
                    {selectedMoveQuery.data.difficulty}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDuration(selectedMoveQuery.data.duration_ms)} ·{" "}
                  {selectedMoveQuery.data.bpm_range?.[0]}–{selectedMoveQuery.data.bpm_range?.[1]}{" "}
                  BPM
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setTimeline((prev) => [...prev, selectedMoveQuery.data!.id])}
                >
                  Add to timeline
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Move not found.</p>
            )}
          </CardContent>
        </Card>
      </aside>

      {hoverPreview && hoveredMoveQuery.data && (
        <Card
          className="pointer-events-none fixed z-50 w-[320px] shadow-lg"
          style={{ top: hoverPreview.top, left: hoverPreview.left }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono text-xs text-foreground">
                {hoverPreview.moveId.slice(0, 10)}…
              </span>
              <Badge variant="outline" className="capitalize">
                {hoveredMoveQuery.data.difficulty}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <StickFigure3D
              frames={hoveredMoveQuery.data.keypoints}
              fps={30}
              isPlaying={true}
              width={294}
              height={220}
              className="rounded-md border border-border bg-muted/30"
              autoMirrorX
              depthScale={0.12}
            />
            <p className="text-[11px] text-muted-foreground">Hover preview</p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
