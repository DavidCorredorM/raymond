import { useQuery } from "@tanstack/react-query";
import { fetchJSON } from "./client";
import type { NoteDetail, NoteSummary, VaultHealth } from "./types";

/**
 * Poll-based freshness (frontend-implementation-plan.md §7 — the server
 * watches the filesystem but pushes nothing to clients yet). 30s on the
 * list/health queries is enough for a single-user tailnet app; the open
 * note also refetches on window focus (TanStack Query default).
 */
const POLL_MS = 30_000;

export function useNotes() {
  return useQuery({
    queryKey: ["notes"],
    queryFn: () => fetchJSON<NoteSummary[]>("/api/notes"),
    refetchInterval: POLL_MS,
  });
}

export function useNote(path: string | undefined) {
  return useQuery({
    queryKey: ["note", path],
    queryFn: () => fetchJSON<NoteDetail>(`/api/note?path=${encodeURIComponent(path!)}`),
    enabled: !!path,
  });
}

export function useVaultHealth() {
  return useQuery({
    queryKey: ["vault-health"],
    queryFn: () => fetchJSON<VaultHealth>("/api/health/vault"),
    refetchInterval: POLL_MS,
  });
}
