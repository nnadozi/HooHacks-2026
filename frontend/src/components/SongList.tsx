"use client";

import { useState } from "react";
import SongCard from "./SongCard";

type Song = {
  id: number;
  title: string;
  bpm: number;
  tags: string[];
};

export default function SongList() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0); // Default to the first song
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState("all");

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

  return (
    <div className="flex flex-col w-full h-full max-h-screen">
      {/* Search & Filter Header */}
      <div className="flex gap-4 mb-4">
        <input
          type="text"
          placeholder="Search songs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-zinc-900 border border-zinc-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-500 transition-colors placeholder:text-zinc-500 font-medium"
        />
        <select
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-cyan-500 transition-colors font-medium cursor-pointer"
        >
          <option value="all">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>

      {/* Song List */}
      <div className="flex flex-col p-6 overflow-y-auto flex-1 bg-zinc-950/50 border border-zinc-700 rounded-xl w-full shadow-inner scroll-smooth">
        {filteredSongs.map((song, i) => (
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
          />
        ))}
        {filteredSongs.length === 0 && (
          <div className="text-zinc-500 text-center py-12 font-medium">No songs found.</div>
        )}
      </div>
    </div>
  );
}