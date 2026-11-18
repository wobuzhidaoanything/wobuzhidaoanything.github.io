import { useEffect, useSyncExternalStore } from "react";
import {
  getMembersState,
  refreshMembers,
  subscribeMembers,
  type MembersState,
} from "@/lib/membersStore";

export type LiveMembers = MembersState;

/**
 * Shared across every page: one fetch, one cache. The bundled members.json
 * remains the first-paint fallback; live data comes from private KV via the
 * Worker. Saves and uploads apply locally, then revalidate in the background.
 */
export function useLiveMembers(): LiveMembers {
  const snapshot = useSyncExternalStore(subscribeMembers, getMembersState, getMembersState);
  useEffect(() => {
    void refreshMembers();
  }, []);
  return snapshot;
}