"use client";

import { useRef, useState } from "react";
import { Music, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ACCEPTED_AUDIO = "audio/mpeg,audio/wav,audio/ogg,audio/flac,audio/mp4,audio/webm";

interface MusicUploadDialogProps {
  open: boolean;
  onFileSelected: (file: File) => void;
  onSkip: () => void;
}

export default function MusicUploadDialog({
  open,
  onFileSelected,
  onSkip,
}: MusicUploadDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFile = (file: File) => {
    setSelectedFile(file);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-lg">
        {/* Skip button in top-right */}
        <button
          type="button"
          onClick={onSkip}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Skip
          <X className="size-3.5" />
        </button>

        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-primary/10">
            <Music className="size-8 text-primary" />
          </div>
          <DialogTitle className="text-xl">Add a Music Track</DialogTitle>
          <DialogDescription className="mx-auto max-w-sm">
            Upload an audio file to build your routine on a music timeline. This
            is optional — you can skip and use the simple editor.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith("audio/")) handleFile(file);
          }}
          className={`mt-2 flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20"
          }`}
        >
          {selectedFile ? (
            <>
              <Music className="size-10 text-primary" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                >
                  Change
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onFileSelected(selectedFile)}
                >
                  Use this track
                </Button>
              </div>
            </>
          ) : (
            <>
              <Upload className="size-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Drag & drop an audio file here, or
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED_AUDIO}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                Browse files
              </Button>
              <p className="text-xs text-muted-foreground">
                MP3, WAV, OGG, FLAC — any duration
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
