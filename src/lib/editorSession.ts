import { useSyncExternalStore } from "react";
import { verifyPassword, type ApiResult } from "@/lib/editorApi";

interface SessionState {
  unlocked: boolean;
  password: string;
}

/**
 * Module singleton: the unlock survives route changes but never a reload,
 * and the password is held in memory only, never written to storage.
 */
let session: SessionState = { unlocked: false, password: "" };
const listeners = new Set<() => void>();

function set(next: SessionState) {
  session = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): SessionState {
  return session;
}

export function useEditorSession(): SessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function unlockEditor(password: string): Promise<ApiResult<true>> {
  const result = await verifyPassword(password);
  if (result.ok) set({ unlocked: true, password });
  return result;
}

export function lockEditor() {
  set({ unlocked: false, password: "" });
}