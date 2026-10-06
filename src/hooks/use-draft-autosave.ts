import { useEffect, useRef, useState } from "react";

/** Shape of a saved notebook draft. */
export type Draft = { title: string; content: string; savedAt: number };

const PREFIX = "studio-draft:";

export function draftKey(userId: string | undefined, scope: string) {
  return `${PREFIX}${userId ?? "anon"}:${scope}`;
}

export function readDraft(key: string): Draft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    if (typeof parsed?.content !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * Debounced autosave of in-progress typing to the browser, so a student never
 * loses work if the tab closes, the Chromebook sleeps, or they hit Escape.
 * Returns the timestamp of the last save (null when nothing saved yet).
 */
export function useDraftAutosave(
  key: string | null,
  value: { title: string; content: string },
  enabled: boolean,
) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    firstRun.current = true;
    setSavedAt(null);
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) return;
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!value.title.trim() && !value.content.trim()) {
      clearDraft(key);
      return;
    }
    const t = window.setTimeout(() => {
      const now = Date.now();
      try {
        window.localStorage.setItem(
          key,
          JSON.stringify({ title: value.title, content: value.content, savedAt: now }),
        );
        setSavedAt(now);
      } catch {
        /* storage full or blocked — typing still works */
      }
    }, 700);
    return () => window.clearTimeout(t);
  }, [key, enabled, value.title, value.content]);

  return savedAt;
}
