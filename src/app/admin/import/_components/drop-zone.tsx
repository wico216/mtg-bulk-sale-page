"use client";
import { useRef, useState } from "react";

interface DropZoneProps {
  onFile: (file: File) => void;
  onInvalidExtension: () => void;
}

export function DropZone({ onFile, onInvalidExtension }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handle(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      onInvalidExtension();
      return;
    }
    onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload Manabox CSV file"
      className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
        dragOver
          ? "border-accent bg-accent-light dark:bg-indigo-950/20"
          : "border-zinc-300 dark:border-zinc-700"
      } focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className={dragOver ? "text-accent" : "text-zinc-400 dark:text-zinc-500"}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 12l3-3m0 0l3 3m-3-3v6M6.75 21A2.25 2.25 0 014.5 18.75V5.25A2.25 2.25 0 016.75 3H13.5L19.5 9v9.75A2.25 2.25 0 0117.25 21H6.75z" />
        </svg>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {dragOver ? "Release to upload" : "Drop a Manabox CSV here or click to browse"}
        </p>
        {!dragOver && (
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Accepts .csv files — your current inventory will be replaced.
          </p>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
    </div>
  );
}
