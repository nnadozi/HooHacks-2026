"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const MOVE_MIME = "application/x-remix-move";
const EDGE_HIT_PX = 8; // pixels from edge to trigger resize

export interface TimedMove {
  id: string;
  startMs: number;
  durationMs: number;
}

interface WaveformTimelineProps {
  audioBuffer: AudioBuffer;
  moves: TimedMove[];
  isPlaying: boolean;
  currentTimeMs: number;
  onDropMove: (moveId: string, timeMs: number) => void;
  onRemoveMove: (index: number) => void;
  onResizeMove: (index: number, newStartMs: number, newDurationMs: number) => void;
  onSeek: (timeMs: number) => void;
}

const WAVEFORM_COLOR = "rgba(56, 189, 248, 0.7)";
const MOVE_COLORS = [
  "rgba(168, 85, 247, 0.55)",
  "rgba(34, 197, 94, 0.55)",
  "rgba(251, 146, 60, 0.55)",
  "rgba(236, 72, 153, 0.55)",
  "rgba(59, 130, 246, 0.55)",
];
const CURSOR_COLOR = "rgba(250, 250, 250, 0.9)";
const TIME_MARKER_COLOR = "rgba(161, 161, 170, 0.5)";

type DragState = {
  moveIndex: number;
  edge: "left" | "right";
  origStartMs: number;
  origDurationMs: number;
};

function downsampleWaveform(buffer: AudioBuffer, targetSamples: number): Float32Array {
  const channelData = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channelData.length / targetSamples));
  const result = new Float32Array(targetSamples);

  for (let i = 0; i < targetSamples; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, channelData.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    result[i] = max;
  }

  return result;
}

export default function WaveformTimeline({
  audioBuffer,
  moves,
  isPlaying,
  currentTimeMs,
  onDropMove,
  onRemoveMove,
  onResizeMove,
  onSeek,
}: WaveformTimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 800, height: 160 });
  const [dropPreviewX, setDropPreviewX] = useState<number | null>(null);
  const [cursorStyle, setCursorStyle] = useState("crosshair");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Resize drag state
  const dragRef = useRef<DragState | null>(null);
  const isDraggingRef = useRef(false);

  const totalDurationMs = audioBuffer.duration * 1000;

  // Clear selection if moves change and index is out of bounds
  useEffect(() => {
    if (selectedIndex !== null && selectedIndex >= moves.length) {
      setSelectedIndex(null);
    }
  }, [moves.length, selectedIndex]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      if (width > 0) setSize({ width: Math.round(width), height: 160 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pre-render waveform to offscreen canvas
  useEffect(() => {
    const offscreen = document.createElement("canvas");
    offscreen.width = size.width * (window.devicePixelRatio || 1);
    offscreen.height = size.height * (window.devicePixelRatio || 1);
    const ctx = offscreen.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    const samples = downsampleWaveform(audioBuffer, size.width);
    const midY = size.height / 2;

    ctx.fillStyle = WAVEFORM_COLOR;
    for (let i = 0; i < samples.length; i++) {
      const amp = samples[i] * midY * 0.85;
      ctx.fillRect(i, midY - amp, 1, amp * 2);
    }

    ctx.fillStyle = TIME_MARKER_COLOR;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    const stepMs = totalDurationMs > 60000 ? 10000 : totalDurationMs > 20000 ? 5000 : 2000;
    for (let ms = stepMs; ms < totalDurationMs; ms += stepMs) {
      const x = (ms / totalDurationMs) * size.width;
      ctx.fillRect(x, 0, 1, size.height);
      const sec = Math.round(ms / 1000);
      const label = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : `${sec}s`;
      ctx.fillText(label, x, size.height - 4);
    }

    offscreenRef.current = offscreen;
  }, [audioBuffer, size, totalDurationMs]);

  // Hit-test: is the click inside a move block?
  const hitTestMove = useCallback(
    (clientX: number, clientY: number): number | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;

      for (let i = moves.length - 1; i >= 0; i--) {
        const m = moves[i];
        const x = (m.startMs / totalDurationMs) * size.width;
        const w = Math.max((m.durationMs / totalDurationMs) * size.width, 3);
        if (px >= x && px <= x + w && py >= 4 && py <= size.height - 4) {
          return i;
        }
      }
      return null;
    },
    [moves, totalDurationMs, size.width, size.height]
  );

  // Hit-test: is the mouse near a move edge?
  const hitTestEdge = useCallback(
    (clientX: number): { moveIndex: number; edge: "left" | "right" } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;

      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        const leftPx = (m.startMs / totalDurationMs) * size.width;
        const rightPx = ((m.startMs + m.durationMs) / totalDurationMs) * size.width;

        if (Math.abs(px - leftPx) <= EDGE_HIT_PX) return { moveIndex: i, edge: "left" };
        if (Math.abs(px - rightPx) <= EDGE_HIT_PX) return { moveIndex: i, edge: "right" };
      }
      return null;
    },
    [moves, totalDurationMs, size.width]
  );

  const getTimeFromClient = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      return (x / rect.width) * totalDurationMs;
    },
    [totalDurationMs]
  );

  const getXFromClient = useCallback(
    (clientX: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(clientX - rect.left, rect.width));
    },
    []
  );

  // Mouse move: update cursor and handle resize drag
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingRef.current && dragRef.current) {
        const timeMs = getTimeFromClient(e.clientX);
        const d = dragRef.current;
        const m = moves[d.moveIndex];
        if (!m) return;

        const MIN_DURATION_MS = 200;

        if (d.edge === "right") {
          const newDuration = Math.max(MIN_DURATION_MS, timeMs - d.origStartMs);
          const clamped = Math.min(newDuration, totalDurationMs - d.origStartMs);
          onResizeMove(d.moveIndex, d.origStartMs, clamped);
        } else {
          const newStart = Math.max(0, Math.min(timeMs, d.origStartMs + d.origDurationMs - MIN_DURATION_MS));
          const newDuration = d.origStartMs + d.origDurationMs - newStart;
          onResizeMove(d.moveIndex, newStart, newDuration);
        }
        return;
      }

      const hit = hitTestEdge(e.clientX);
      if (hit) {
        setCursorStyle("ew-resize");
      } else {
        const moveHit = hitTestMove(e.clientX, e.clientY);
        setCursorStyle(moveHit !== null ? "pointer" : "crosshair");
      }
    },
    [hitTestEdge, hitTestMove, getTimeFromClient, moves, totalDurationMs, onResizeMove]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const hit = hitTestEdge(e.clientX);
      if (hit) {
        e.preventDefault();
        const m = moves[hit.moveIndex];
        dragRef.current = {
          moveIndex: hit.moveIndex,
          edge: hit.edge,
          origStartMs: m.startMs,
          origDurationMs: m.durationMs,
        };
        isDraggingRef.current = true;
      }
    },
    [hitTestEdge, moves]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    dragRef.current = null;
  }, []);

  // Also listen for mouseup on window in case mouse leaves canvas
  useEffect(() => {
    const up = () => {
      isDraggingRef.current = false;
      dragRef.current = null;
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const offscreen = offscreenRef.current;
    if (!canvas || !offscreen) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.width * dpr;
    canvas.height = size.height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "rgba(9, 9, 11, 0.95)";
    ctx.fillRect(0, 0, size.width, size.height);

    ctx.drawImage(offscreen, 0, 0, size.width, size.height);

    // Move blocks
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const x = (m.startMs / totalDurationMs) * size.width;
      const w = (m.durationMs / totalDurationMs) * size.width;
      const color = MOVE_COLORS[i % MOVE_COLORS.length];

      ctx.fillStyle = color;
      ctx.fillRect(x, 4, Math.max(w, 3), size.height - 8);

      ctx.strokeStyle = color.replace("0.55", "1");
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, 4, Math.max(w, 3), size.height - 8);

      // Resize handles (small bars on edges)
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fillRect(x, 8, 3, size.height - 16);
      ctx.fillRect(x + Math.max(w, 3) - 3, 8, 3, size.height - 16);

      // Label
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      const label = m.id.slice(0, 8) + "…";
      const textX = x + 6;
      if (w > 55) {
        ctx.fillText(label, textX, 22);
      }
      ctx.font = "10px monospace";
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      if (w > 45) {
        ctx.fillText(`${(m.durationMs / 1000).toFixed(1)}s`, textX, 36);
      }
    }

    // Selection highlight
    if (selectedIndex !== null && selectedIndex < moves.length) {
      const sm = moves[selectedIndex];
      const sx = (sm.startMs / totalDurationMs) * size.width;
      const sw = Math.max((sm.durationMs / totalDurationMs) * size.width, 3);
      ctx.strokeStyle = "rgba(250, 250, 250, 0.9)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(sx - 1, 2, sw + 2, size.height - 4);
      ctx.setLineDash([]);
    }

    // Drop preview
    if (dropPreviewX !== null) {
      ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(dropPreviewX, 0);
      ctx.lineTo(dropPreviewX, size.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Playback cursor
    const cursorX = (currentTimeMs / totalDurationMs) * size.width;
    ctx.strokeStyle = CURSOR_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, size.height);
    ctx.stroke();

    ctx.fillStyle = CURSOR_COLOR;
    ctx.font = "bold 11px monospace";
    ctx.textAlign = cursorX > size.width - 50 ? "right" : "left";
    const curSec = currentTimeMs / 1000;
    const curLabel = curSec >= 60
      ? `${Math.floor(curSec / 60)}:${String(Math.floor(curSec % 60)).padStart(2, "0")}`
      : `${curSec.toFixed(1)}s`;
    ctx.fillText(curLabel, cursorX + (cursorX > size.width - 50 ? -4 : 4), 14);
  }, [size, moves, currentTimeMs, totalDurationMs, dropPreviewX, selectedIndex]);

  // Animation loop
  useEffect(() => {
    let animId: number;
    const loop = () => {
      draw();
      if (isPlaying || isDraggingRef.current) animId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animId);
  }, [draw, isPlaying]);

  useEffect(() => {
    if (!isPlaying) draw();
  }, [draw, isPlaying, moves, currentTimeMs]);

  return (
    <div ref={containerRef} className="flex h-full flex-col gap-2">
      <div className="relative flex-1">
        {selectedIndex !== null && selectedIndex < moves.length && (() => {
          const sm = moves[selectedIndex];
          const sx = (sm.startMs / totalDurationMs) * size.width;
          const sw = Math.max((sm.durationMs / totalDurationMs) * size.width, 3);
          const btnLeft = Math.min(sx + sw - 29, size.width - 32);
          return (
            <Button
              type="button"
              variant="destructive"
              size="icon-sm"
              className="absolute z-10 size-7 rounded-full shadow-lg"
              style={{ left: btnLeft, top: 6 }}
              onClick={() => {
                onRemoveMove(selectedIndex);
                setSelectedIndex(null);
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          );
        })()}
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height, cursor: cursorStyle }}
          className="w-full rounded-lg"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={(e) => {
            if (isDraggingRef.current) return;
            const moveIdx = hitTestMove(e.clientX, e.clientY);
            if (moveIdx !== null) {
              setSelectedIndex((prev) => (prev === moveIdx ? null : moveIdx));
            } else {
              setSelectedIndex(null);
              onSeek(getTimeFromClient(e.clientX));
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDropPreviewX(getXFromClient(e.clientX));
          }}
          onDragLeave={() => setDropPreviewX(null)}
          onDrop={(e) => {
            e.preventDefault();
            setDropPreviewX(null);
            const moveId = e.dataTransfer.getData(MOVE_MIME);
            if (moveId) {
              const timeMs = getTimeFromClient(e.clientX);
              onDropMove(moveId, timeMs);
            }
          }}
        />
      </div>

      {moves.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {moves.map((m, i) => (
            <div
              key={`${m.id}-${i}`}
              className="group flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <div
                className="size-2.5 rounded-full"
                style={{ backgroundColor: MOVE_COLORS[i % MOVE_COLORS.length].replace("0.55", "1") }}
              />
              <span className="font-mono text-foreground">{m.id.slice(0, 8)}…</span>
              <span className="text-muted-foreground">
                {(m.startMs / 1000).toFixed(1)}s · {(m.durationMs / 1000).toFixed(1)}s
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                onClick={() => onRemoveMove(i)}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
