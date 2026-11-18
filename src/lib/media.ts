const DEFAULT_UPDATE_WORKER_URL = "https://capstone-update.jhyap.workers.dev";

export const UPDATE_WORKER_URL: string =
  ((import.meta.env.VITE_UPDATE_WORKER_URL ?? "") as string) ||
  DEFAULT_UPDATE_WORKER_URL;

export function resolveImageSrc(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("photo/")) {
    return `${UPDATE_WORKER_URL.replace(/\/$/, "")}/photos/${encodeURIComponent(value)}`;
  }
  return value;
}

export function membersUrl(): string {
  return `${UPDATE_WORKER_URL.replace(/\/$/, "")}/members.json`;
}
