import { Play } from 'lucide-react';
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
}: SongCardProps) {

  // Calculate width based on distance simulating osu! expanding cards
  // 80% max width leaves 20% room for the side buttons on the selected card.
  const widthPercentage = distance !== null 
    ? Math.max(60, 80 - distance * 5) 
    : 60;

  return (
    <div
      className="flex items-center gap-4 py-2"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {/* Main Card */}
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
        {/* Thumbnail */}
        <div className="w-[84px] h-[84px] bg-zinc-800 rounded-md flex-shrink-0 m-2"></div>

        {/* Info */}
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

        {/* Inner Play Button */}
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

      {/* Side Buttons */}
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
          className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-lg font-bold rounded-xl px-6 py-2 hover:bg-zinc-800 hover:text-white transition-colors shadow-md w-[160px] text-center"
        >
          PRACTICE
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlay?.();
          }}
          className="bg-cyan-600 text-white text-lg font-bold rounded-xl px-6 py-2 hover:bg-cyan-500 transition-colors shadow-md w-[160px] text-center"
        >
          PLAY
        </button>
      </div>
    </div>
  );
}