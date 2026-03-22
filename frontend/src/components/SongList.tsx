"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Loader2 } from "lucide-react";
import {
  Dispatch,
  SetStateAction,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import SongCard, { type SessionRow } from "./SongCard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserHistory } from "@/lib/api";
import type { FeedbackResult } from "@/types";
import { cn } from "@/lib/utils";

type SongListProps = {
  activeTab?: "public" | "recent";
  onTabChange?: Dispatch<SetStateAction<"public" | "recent">>;
};

function formatWhen(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function feedbackToSession(f: FeedbackResult, index: number): SessionRow {
  const when = formatWhen(f.created_at);
  return {
    id: f.id,
    choreographyId: f.choreography_id,
    title: `Session ${index + 1}`,
    line2: when ? `${when} · Score ${f.score}` : `Score ${f.score}`,
    bpm: null,
    tags: [`${f.score} pts`],
  };
}

export default function SongList({
  activeTab = "public",
  onTabChange,
}: SongListProps) {
  const router = useRouter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isGridView, setIsGridView] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["user-history"],
    queryFn: getUserHistory,
  });

  const sessions = useMemo(() => {
    const list = data?.history ?? [];
    return [...list]
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      })
      .map((f, i) => feedbackToSession(f, i));
  }, [data?.history]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.choreographyId.toLowerCase().includes(q) ||
        s.line2.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  const displayed =
    activeTab === "recent" ? filtered : [];

  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex;

  const openPreview = (choreographyId: string) => {
    router.push(`/choreography/${choreographyId}`);
  };

  const openPerform = (choreographyId: string) => {
    router.push(`/feedback/${choreographyId}`);
  };

  return (
    <div className="flex h-full max-h-screen w-full flex-col overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === "public" || v === "recent") onTabChange?.(v);
        }}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <TabsList className="h-9 w-full max-w-sm shrink-0 rounded-lg p-1">
          <TabsTrigger value="public" className="flex-1 rounded-md text-sm">
            How it works
          </TabsTrigger>
          <TabsTrigger value="recent" className="flex-1 rounded-md text-sm">
            Recent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="public" className="mt-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
          <Card className="border-border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base font-medium">MVP scope</CardTitle>
              <CardDescription className="text-pretty">
                There isn&apos;t a shared song library yet. Upload a file above to
                generate a routine from your media or the move pool. Past runs
                appear under Recent after you finish feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Open{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => onTabChange?.("recent")}
              >
                Recent
              </button>{" "}
              to revisit a score.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent" className="mt-0 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden data-[state=inactive]:hidden">
          <div className="flex shrink-0 flex-wrap gap-2">
            <Input
              type="search"
              placeholder="Filter sessions…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="min-w-[180px] flex-1"
            />
            <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
              <Button
                type="button"
                variant={!isGridView ? "secondary" : "ghost"}
                size="icon-sm"
                className="rounded-md"
                onClick={() => setIsGridView(false)}
                aria-label="List view"
              >
                <List className="size-4" />
              </Button>
              <Button
                type="button"
                variant={isGridView ? "secondary" : "ghost"}
                size="icon-sm"
                className="rounded-md"
                onClick={() => setIsGridView(true)}
                aria-label="Grid view"
              >
                <LayoutGrid className="size-4" />
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-muted/20 p-3">
            {isLoading && (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                <Loader2 className="size-7 animate-spin" />
                <p className="text-sm">Loading…</p>
              </div>
            )}

            {isError && (
              <p className="py-10 text-center text-sm text-destructive">
                {error instanceof Error ? error.message : "Could not load history."}
              </p>
            )}

            {!isLoading && !isError && displayed.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No sessions yet.
              </p>
            )}

            {!isLoading && !isError && displayed.length > 0 && (
              <div
                className={cn(
                  isGridView
                    ? "grid auto-rows-fr grid-cols-2 items-stretch gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                    : "flex flex-col gap-1"
                )}
              >
                {displayed.map((row, i) => (
                  <SongCard
                    key={row.id}
                    {...row}
                    selected={activeIndex === i}
                    distance={
                      activeIndex !== null ? Math.abs(activeIndex - i) : null
                    }
                    onHover={() => setHoveredIndex(i)}
                    onLeave={() => setHoveredIndex(null)}
                    onSelect={() => setSelectedIndex(i)}
                    onPlay={() => openPreview(row.choreographyId)}
                    onPractice={() => openPerform(row.choreographyId)}
                    isGridView={isGridView}
                  />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
