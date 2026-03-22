"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import SongCard from "./SongCard";

type Song = {
  id: number;
  title: string;
  bpm: number;
  tags: string[];
};

type SongListProps = {
  activeTab?: "public" | "recent";
  onTabChange?: Dispatch<SetStateAction<"public" | "recent">>;
};

export default function SongList({ activeTab = "public", onTabChange }: SongListProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");
  const [isGridView, setIsGridView] = useState(false);

  const activeIndex = hoveredIndex !== null ? hoveredIndex : selectedIndex;

  const songs: Song[] = [
    { id: 1, title: "tell me (u want it)", bpm: 144, tags: ["anime"] },
    { id: 2, title: "music", bpm: 144, tags: ["anime", "electronic"] },
    { id: 3, title: "hollywood forever", bpm: 128, tags: ["j-pop"] },
    { id: 4, title: "the peace", bpm: 160, tags: ["rock"] },
    { id: 5, title: "innuendo (i get u)", bpm: 175, tags: ["electronic", "hardcore"] },
    { id: 6, title: "lovefield", bpm: 140, tags: ["trance"] },
    { id: 7, title: "do it", bpm: 144, tags: ["electronic", "boss"] },
    { id: 8, title: "bodyfeeling", bpm: 200, tags: ["hardcore"] },
    { id: 9, title: "wish u well", bpm: 144, tags: ["other tags"] },
    { id: 10, title: "do it (yves remix)", bpm: 144, tags: ["other tags"] },
    { id: 11, title: "wallsocket", bpm: 144, tags: ["other tags"] },
    { id: 12, title: "harvest sky", bpm: 144, tags: ["other tags"] },
    { id: 13, title: "yay", bpm: 144, tags: ["pop"] },
  ];

  const allTags = Array.from(new Set(songs.flatMap((s) => s.tags))).sort();

  const filteredSongs = songs.filter((song) => {
    const matchesSearch = song.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = filterTag === "all" || song.tags.includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const displayedSongs = activeTab === "recent" ? [...filteredSongs].reverse().slice(0, 5) : filteredSongs;

  return (
    <div className="flex flex-col w-full h-full max-h-screen overflow-hidden">
      {/* View Tabs */}
      <div className="flex gap-2 mb-4 flex-shrink-0">
        <button
          onClick={() => onTabChange?.("public")}
          className={`px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "public"
            ? "bg-cyan-600 text-white shadow-md"
            : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
        >
          Public Beatmaps
        </button>
        <button
          onClick={() => onTabChange?.("recent")}
          className={`px-4 py-2 font-bold rounded-xl transition-colors ${activeTab === "recent"
            ? "bg-cyan-600 text-white shadow-md"
            : "bg-zinc-900 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800"
            }`}
        >
          Recently Played
        </button>
      </div>

      {/* Header */}
      <div className="flex gap-4 mb-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Search songs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-500 placeholder:text-zinc-500"
        />

        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-500"
        >
          <option value="all">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>

        <div className="flex gap-1 bg-zinc-900 border border-zinc-700 rounded-xl p-1">
          <button onClick={() => setIsGridView(false)}>
            <List />
          </button>
          <button onClick={() => setIsGridView(true)}>
            <LayoutGrid />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-zinc-950/50 border border-zinc-700 rounded-xl">
        <div
          className={
            isGridView
              ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 auto-rows-fr items-stretch"
              : "flex flex-col gap-2"
          }
        >
          {displayedSongs.map((song, i) => (
            <SongCard
              key={song.id}
              {...song}
              selected={activeIndex === i}
              distance={activeIndex !== null ? Math.abs(activeIndex - i) : null}
              onHover={() => setHoveredIndex(i)}
              onLeave={() => setHoveredIndex(null)}
              onClick={() => setSelectedIndex(i)}
              onPlay={() => console.log("Play:", song.title)}
              onPractice={() => console.log("Practice:", song.title)}
              isGridView={isGridView}
            />
          ))}
        </div>

        {displayedSongs.length === 0 && (
          <div className="text-zinc-500 text-center py-12">
            No songs found.
          </div>
        )}
      </div>
    </div>
  );
}