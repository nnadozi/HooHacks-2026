"use client";

import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import StickFigure3D from "@/components/StickFigure3D";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createRoutine, getMove, listMoves } from "@/lib/api";
import type { Keypoint, Move, MoveSummary } from "@/types";

const MOVE_MIME = "application/x-justdance-move";
const TIMELINE_MIME = "application/x-justdance-timeline-index";

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
    <main className="flex h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Bin */}
      <aside className="flex w-80 flex-col gap-4 border-r border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Move Bin</h1>
          <Button variant="outline" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>

        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search moves..."
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Difficulty</span>
          <Select
            value={difficulty}
            onValueChange={(v) => setDifficulty(v as typeof difficulty)}
          >
            <SelectTrigger className="h-8">
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

        <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
          {isMovesLoading ? (
            <div className="p-4 text-sm text-zinc-500">Loading moves…</div>
          ) : filteredMoves.length === 0 ? (
            <div className="p-4 text-sm text-zinc-500">
              No moves found. Generate a choreography from a video to seed the pool.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredMoves.map((m) => {
                const isSelected = selectedMoveId === m.id;
                return (
                  <button
                    key={m.id}
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
                    className={[
                      "w-full rounded-lg border px-3 py-2 text-left transition",
                      isSelected
                        ? "border-cyan-500/60 bg-cyan-500/10"
                        : "border-zinc-800 bg-zinc-950/30 hover:bg-zinc-950/60",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-mono text-xs text-zinc-300">
                        {m.id.slice(0, 10)}…
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {m.difficulty}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                      <span>{formatDuration(m.duration_ms)}</span>
                      <span>
                        {m.bpm_range?.[0]}–{m.bpm_range?.[1]} BPM
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-xs text-zinc-500">
          Tip: Drag into the timeline, or double-click to append.
        </div>
      </aside>

      {/* Timeline */}
      <section className="flex min-w-0 flex-1 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" onClick={() => router.push("/")}>
              Home
            </Button>
            <div className="text-sm text-zinc-500">Routine</div>
            <input
              value={routineName}
              onChange={(e) => setRoutineName(e.target.value)}
              className="w-72 max-w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            <div className="text-xs text-zinc-500">
              {timeline.length} clips • {formatDuration(totalDurationMs)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsPlaying((p) => !p);
              }}
              disabled={routineFrames.length === 0}
            >
              {isPlaying ? "Pause" : "Play"}
            </Button>
            <Button
              onClick={() => saveRoutine.mutate()}
              disabled={saveRoutine.isPending || timeline.length === 0}
            >
              {saveRoutine.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <Card className="flex min-h-0 flex-1 flex-col border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnTimeline(e, null)}
              className="flex h-full flex-col rounded-lg border border-zinc-800 bg-zinc-950/30 p-3"
            >
              {timeline.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
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
                        className="group flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2"
                      >
                        <div className="flex min-w-0 flex-col">
                          <div className="truncate font-mono text-xs text-zinc-200">
                            {id.slice(0, 10)}…
                          </div>
                          <div className="text-[11px] text-zinc-500">{label}</div>
                        </div>

                        <Button
                          variant="outline"
                          className="h-7 px-2 opacity-0 transition group-hover:opacity-100"
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

      {/* Preview */}
      <aside className="flex w-[720px] flex-col gap-4 border-l border-zinc-800 p-4">
        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Preview</CardTitle>
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
            <div className="w-full text-xs text-zinc-500">
              {timeline.length === 0
                ? "Add clips to the timeline to preview your routine."
                : routineFrames.length === 0
                ? "Loading move keypoints…"
                : "Preview plays the full routine in sequence (looping)."}
            </div>
            <div className="w-full text-[11px] text-zinc-600">
              Model credit: “Low Poly Stick Figure Rigged” by Robersonjr.walker (CC-BY-4.0).
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Selected Move</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-zinc-200">
            {!selectedMoveId ? (
              <div className="text-sm text-zinc-500">Click a move in the bin.</div>
            ) : selectedMoveQuery.isLoading ? (
              <div className="text-sm text-zinc-500">Loading…</div>
            ) : selectedMoveQuery.data ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate font-mono text-xs text-zinc-300">
                    {selectedMoveQuery.data.id}
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {selectedMoveQuery.data.difficulty}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-500">
                  {formatDuration(selectedMoveQuery.data.duration_ms)} •{" "}
                  {selectedMoveQuery.data.bpm_range?.[0]}–{selectedMoveQuery.data.bpm_range?.[1]} BPM
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setTimeline((prev) => [...prev, selectedMoveQuery.data.id])}
                  >
                    Add To Timeline
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-sm text-zinc-500">Move not found.</div>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* Hover preview popover */}
      {hoverPreview && hoveredMoveQuery.data && (
        <div
          className="pointer-events-none fixed z-50 w-[320px] rounded-lg border border-zinc-800 bg-zinc-950/90 p-3 shadow-xl"
          style={{ top: hoverPreview.top, left: hoverPreview.left }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="truncate font-mono text-xs text-zinc-300">
              {hoverPreview.moveId.slice(0, 10)}…
            </div>
            <Badge variant="outline" className="capitalize">
              {hoveredMoveQuery.data.difficulty}
            </Badge>
          </div>
          <StickFigure3D
            frames={hoveredMoveQuery.data.keypoints}
            fps={30}
            isPlaying={true}
            width={294}
            height={220}
            className="rounded-md border border-zinc-800 bg-zinc-900"
            autoMirrorX
            depthScale={0.12}
          />
          <div className="mt-2 text-[11px] text-zinc-500">
            Hover preview
          </div>
        </div>
      )}
    </main>
  );
}
