"use client";

import { Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One row in “Recently played” — backed by real feedback history, not mock songs. */
export type SessionRow = {
  id: string;
  choreographyId: string;
  title: string;
  line2: string;
  bpm: number | null;
  tags: string[];
};

type SongCardProps = SessionRow & {
  selected?: boolean;
  distance?: number | null;
  onHover?: () => void;
  onLeave?: () => void;
  onSelect?: () => void;
  onPlay: () => void;
  onPractice: () => void;
  isGridView?: boolean;
};

export default function SongCard({
  title,
  line2,
  bpm,
  tags,
  selected = false,
  distance = null,
  onHover,
  onLeave,
  onSelect,
  onPlay,
  onPractice,
  isGridView = false,
}: SongCardProps) {
  if (isGridView) {
    return (
      <div
        className={cn(
          "group/card flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors",
          "hover:border-muted-foreground/25",
          selected && "border-foreground/25 ring-1 ring-border"
        )}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect?.();
          }
        }}
      >
        <div className="relative aspect-square w-full bg-muted">
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity group-hover/card:opacity-100">
            <Button
              type="button"
              size="sm"
              className="w-3/4"
              onClick={(e) => {
                e.stopPropagation();
                onPlay();
              }}
            >
              Preview
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-3/4 bg-background/80"
              onClick={(e) => {
                e.stopPropagation();
                onPractice();
              }}
            >
              Perform
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 p-4">
          <h2 className="line-clamp-2 text-lg font-semibold leading-tight">{title}</h2>
          <p className="line-clamp-1 text-xs text-muted-foreground">{line2}</p>
          <div className="flex flex-wrap gap-1.5">
            {bpm != null && (
              <Badge variant="secondary" className="text-[11px] font-medium">
                {bpm} BPM
              </Badge>
            )}
            {tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[11px] font-medium">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const widthPercentage =
    distance !== null ? Math.max(60, 80 - distance * 5) : 60;

  return (
    <div
      className="flex items-center gap-4 py-1.5"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div
        onClick={onSelect}
        style={{ width: `${widthPercentage}%` }}
        className={cn(
          "flex h-[100px] cursor-pointer items-stretch overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-colors",
          selected
            ? "border-foreground/20 ring-1 ring-border"
            : "hover:border-muted-foreground/30"
        )}
      >
        <div className="m-2 h-[84px] w-[84px] shrink-0 rounded-md bg-muted" />

        <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden py-2 pr-2 pl-1">
          <h2 className="mb-1 truncate text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="mb-2 truncate text-sm text-muted-foreground">{line2}</p>
          <div className="flex flex-wrap items-center gap-2">
            {bpm != null && (
              <Badge variant="secondary">{bpm} BPM</Badge>
            )}
            {tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {selected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
            className="m-2 flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Open choreography preview"
          >
            <Play className="ml-0.5 size-9 fill-current" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 transition-all duration-300",
          selected
            ? "pointer-events-auto translate-x-0 opacity-100"
            : "pointer-events-none -translate-x-2 opacity-0"
        )}
      >
        <Button
          type="button"
          variant="outline"
          className="min-w-[160px]"
          onClick={(e) => {
            e.stopPropagation();
            onPractice();
          }}
        >
          Perform
        </Button>
        <Button
          type="button"
          className="min-w-[160px]"
          onClick={(e) => {
            e.stopPropagation();
            onPlay();
          }}
        >
          Preview
        </Button>
      </div>
    </div>
  );
}
