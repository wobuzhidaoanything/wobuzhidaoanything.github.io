import type { TeamMember } from "@/data/capstone";
import { UPDATE_WORKER_URL } from "@/lib/media";

export type ApiFailure = {
  ok: false;
  /** null means the request never completed (network error or timeout). */
  status: number | null;
  error: string;
  retryAfter?: number;
  current?: TeamMember;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const TIMEOUT_MS = 20_000;

function base(): string {
  return UPDATE_WORKER_URL.replace(/\/$/, "");
}

interface RawResponse {
  ok: true;
  response: Response;
  payload: Record<string, unknown>;
}

async function request(path: string, init: RequestInit): Promise<RawResponse | ApiFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${base()}${path}`, { ...init, signal: controller.signal });
    let payload: Record<string, unknown> = {};
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      // Non-JSON error body; fall through to the status-based message.
    }
    if (!response.ok || payload.ok !== true) {
      const retryAfter =
        typeof payload.retryAfter === "number"
          ? payload.retryAfter
          : Number(response.headers.get("retry-after")) || undefined;
      return {
        ok: false,
        status: response.status,
        error:
          typeof payload.error === "string" && payload.error
            ? payload.error
            : `Request failed (${response.status}).`,
        retryAfter,
        current: payload.current as TeamMember | undefined,
      };
    }
    return { ok: true, response, payload };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "AbortError";
    return {
      ok: false,
      status: null,
      error: timedOut
        ? "The request timed out. Check your connection and try again."
        : "Network error. Check your connection and try again.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function jsonInit(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function verifyPassword(password: string): Promise<ApiResult<true>> {
  const result = await request("/", jsonInit({ password, verifyOnly: true }));
  return result.ok ? { ok: true, data: true } : result;
}

export interface SaveResponse {
  member?: TeamMember;
}

export async function saveMember(
  password: string,
  memberId: string,
  member: Omit<TeamMember, "slug">,
  baseVersion: number | undefined,
): Promise<ApiResult<SaveResponse>> {
  const result = await request(
    "/",
    jsonInit({ password, memberId, member, baseVersion }),
  );
  return result.ok ? { ok: true, data: { member: result.payload.member as TeamMember | undefined } } : result;
}

export interface PhotoResponse {
  key?: string;
  member?: TeamMember;
}

export async function uploadPhoto(
  password: string,
  memberId: string,
  slot: "hero" | "secondary",
  file: File,
): Promise<ApiResult<PhotoResponse>> {
  const formData = new FormData();
  formData.set("password", password);
  formData.set("memberId", memberId);
  formData.set("slot", slot);
  formData.set("file", file);
  const result = await request("/photos", { method: "POST", body: formData });
  return result.ok
    ? {
        ok: true,
        data: {
          key: result.payload.key as string | undefined,
          member: result.payload.member as TeamMember | undefined,
        },
      }
    : result;
}

export async function removePhoto(
  password: string,
  memberId: string,
  slot: "hero" | "secondary",
): Promise<ApiResult<PhotoResponse>> {
  const result = await request("/photos/remove", jsonInit({ password, memberId, slot }));
  return result.ok ? { ok: true, data: { member: result.payload.member as TeamMember | undefined } } : result;
}

export interface HealthStatus {
  configured: boolean;
}

export async function fetchHealth(): Promise<HealthStatus | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${base()}/health`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = (await response.json()) as { configured?: boolean };
    return { configured: Boolean(payload.configured) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}