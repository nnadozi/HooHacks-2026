import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

type SongCardProps = {
  title: string;
  bpm: number;
  tags: string[];
  selected?: boolean;
  distance?: number | null;
  onHover?: () => void;
  onLeave?: () => void;
  onClick?: () => void;
  onPlay?: () => void;
  onPractice?: () => void;
  isGridView?: boolean;
};

export default function SongCard({
  title,
  bpm,
  tags,
  selected = false,
  distance = null,
  onHover,
  onLeave,
  onClick,
  onPlay,
  onPractice,
  isGridView = false,
}: SongCardProps) {
  if (isGridView) {
    return (
      <div
        className={cn(
          "bg-zinc-900 border border-zinc-700/50 rounded-xl overflow-hidden cursor-pointer group transition-all duration-300 flex flex-col h-full",
          "hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] hover:-translate-y-1",
          selected && "border-cyan-500 shadow-[0_0_25px_rgba(34,211,238,0.25)]"
        )}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        onClick={onClick}
      >
        {/* Thumbnail */}
        <div className="w-full aspect-square bg-zinc-800 relative">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPlay?.();
              }}
              className="bg-cyan-600 text-white font-bold rounded-lg px-6 py-2 hover:bg-cyan-500 transition-all w-3/4 shadow-md scale-95 group-hover:scale-100"
            >
              PLAY
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onPractice?.();
              }}
              className="bg-zinc-800 border border-zinc-600 text-white font-bold rounded-lg px-6 py-2 hover:bg-zinc-700 transition-all w-3/4 shadow-md scale-95 group-hover:scale-100"
            >
              PRACTICE
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 flex flex-col gap-3">
          <h2 className="text-lg font-bold text-white leading-tight line-clamp-2">
            {title}
          </h2>

          <div className="flex gap-2 flex-wrap">
            <span className="text-[11px] px-2 py-0.5 bg-zinc-800 border border-zinc-700/50 rounded-md text-zinc-300 font-medium">
              {bpm} BPM
            </span>

            {tags.slice(0, 2).map((tag, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 bg-zinc-800 border border-zinc-700/50 rounded-md text-zinc-300 font-medium"
              >
                {tag}
              </span>
            ))}

            {tags.length > 2 && (
              <span className="text-[11px] px-2 py-0.5 bg-zinc-800 border border-zinc-700/50 rounded-md text-zinc-300 font-medium">
                +{tags.length - 2}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  const widthPercentage =
    distance !== null ? Math.max(60, 80 - distance * 5) : 60;

  return (
    <div
      className="flex items-center gap-4 py-2"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div
        onClick={onClick}
        style={{ width: `${widthPercentage}%` }}
        className={cn(
          "flex items-stretch bg-zinc-900 text-white border border-zinc-700 rounded-xl cursor-pointer h-[100px] transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          selected
            ? "scale-[1.02] border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
            : "hover:scale-[1.01]"
        )}
      >
        <div className="w-[84px] h-[84px] bg-zinc-800 rounded-md flex-shrink-0 m-2"></div>

        <div className="flex-1 py-2 px-4 flex flex-col justify-center overflow-hidden">
          <h2 className="text-[28px] tracking-tight font-bold mb-2 truncate">
            {title}
          </h2>

          <div className="flex gap-2 flex-wrap items-center">
            <span className="px-3 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700/50 text-sm rounded-md font-medium">
              {bpm} BPM
            </span>

            {tags.map((tag, i) => (
              <span
                key={i}
                className="px-3 py-0.5 bg-zinc-800 text-zinc-300 border border-zinc-700/50 text-sm rounded-md font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {selected && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            className="w-[84px] h-[84px] bg-cyan-600/20 text-cyan-400 flex items-center justify-center m-2 hover:bg-cyan-600 hover:text-white rounded-lg transition-colors"
          >
            <Play fill="currentColor" className="w-[36px] h-[36px] ml-1" />
          </button>
        )}
      </div>

      <div
        className={cn(
          "flex flex-col gap-2 transition-all duration-300",
          selected
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-4 pointer-events-none"
        )}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPractice?.();
          }}
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-lg font-bold rounded-xl px-6 py-2 hover:bg-zinc-800 hover:text-white transition-colors shadow-md w-[160px]"
        >
          PRACTICE
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          className="bg-cyan-600 text-white text-lg font-bold rounded-xl px-6 py-2 hover:bg-cyan-500 transition-colors shadow-md w-[160px]"
        >
          PLAY
        </button>
      </div>
    </div>
  );
}