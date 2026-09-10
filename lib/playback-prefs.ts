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

function readStored(): boolean {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
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
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Preference stays in memory for this session if storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Reactive preference; re-renders every subscriber when the toggle flips. */
export function useMuxOverrideAll(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
