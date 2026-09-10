"use client";

import { useSyncExternalStore } from "react";

/**
 * Client-only playback preference: when true, the reader renders every
 * playable video (JW, Mux, direct .m3u8/.mp4 files) with Mux Player for a
 * consistent experience. Provider embeds (YouTube, Vimeo, …) always keep
 * their native players.
 *
 * Stored in localStorage on purpose: article HTML is sanitized once at ingest
 * and shared, so per-user playback choice can only apply at view time in the
 * reader. No migration or API needed.
 */

const STORAGE_KEY = "rss.mux-override-all";
const CHANGE_EVENT = "rss:mux-override-all";

/**
 * Session fallback when storage is unavailable (sandboxed iframe,
 * blocked cookies/storage). Always updated on set; read back only when the
 * storage read itself throws.
 */
let memoryFallback = false;

function readStored(): boolean {
  try {
    if (typeof window === "undefined") return memoryFallback;
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return memoryFallback;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    // `key === null` covers `localStorage.clear()` from another tab.
    if (event.key === STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): boolean {
  return readStored();
}

function getServerSnapshot(): boolean {
  return false;
}

export function getMuxOverrideAll(): boolean {
  return readStored();
}

export function setMuxOverrideAll(value: boolean): void {
  memoryFallback = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable — readers fall back to `memoryFallback` above.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Reactive preference; re-renders every subscriber when the toggle flips. */
export function useMuxOverrideAll(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
