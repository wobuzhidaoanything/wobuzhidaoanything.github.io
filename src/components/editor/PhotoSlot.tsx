import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { cn } from "cn";
import type { TeamMember } from "@/data/capstone";
import { removePhoto, uploadPhoto } from "@/lib/editorApi";
import { resolveImageSrc } from "@/lib/media";
import { compressPhoto, formatBytes, type CompressedPhoto } from "@/lib/photo";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusMessage, type StatusTone } from "./StatusMessage";
import { primaryButtonStyles, quietButtonStyles } from "./buttons";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_RAW_BYTES = 20 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type Phase = "idle" | "compressing" | "uploading" | "removing";

interface PhotoSlotProps {
  slot: "hero" | "secondary";
  label: string;
  member: TeamMember;
  password: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onSaved: (member: TeamMember | undefined) => void;
  onUnauthorized: () => void;
  onPendingPreview: (url: string | null) => void;
}

export function PhotoSlot({
  slot,
  label,
  member,
  password,
  busy,
  onBusyChange,
  onSaved,
  onUnauthorized,
  onPendingPreview,
}: PhotoSlotProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewRef = useRef<string | null>(null);

  const currentKey = slot === "hero" ? member.artifacts?.heroImage : member.artifacts?.secondaryImage;
  const currentSrc = resolveImageSrc(currentKey);
  const active = phase !== "idle";

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function setPreview(url: string | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
    onPendingPreview(url);
  }

  function clearSelection() {
    setFile(null);
    setDims(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(next: File) {
    if (busy || active) return;
    if (!ALLOWED_TYPES.includes(next.type)) {
      setStatus({
        tone: "danger",
        text: "Use a JPEG, PNG or WebP image. iPhone HEIC photos need to be exported as JPEG first.",
      });
      return;
    }
    if (next.size > MAX_RAW_BYTES) {
      setStatus({ tone: "danger", text: "That file is over 20 MB. Choose a smaller photo." });
      return;
    }
    setStatus(null);
    setFile(next);
    const url = URL.createObjectURL(next);
    setPreview(url);
    const img = new Image();
    img.onload = () => setDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
  }

  function fail(result: { status: number | null; error: string; retryAfter?: number }) {
    if (result.status === 401) {
      setStatus({ tone: "danger", text: "Password rejected. Unlock the editor again to upload." });
      onUnauthorized();
      return;
    }
    setStatus({
      tone: "danger",
      text:
        result.status === 429 && result.retryAfter
          ? `Too many attempts. Try again in ${result.retryAfter} seconds.`
          : result.error,
    });
  }

  async function handleUpload() {
    if (!file || busy || active) return;
    if (!password) {
      onUnauthorized();
      return;
    }
    setStatus(null);
    setPhase("compressing");
    onBusyChange(true);
    try {
      let compressed: CompressedPhoto;
      try {
        compressed = await compressPhoto(file);
      } catch {
        setStatus({
          tone: "danger",
          text: "This image can't be read in the browser. Export it as JPEG or PNG and try again.",
        });
        return;
      }
      if (compressed.file.size > MAX_UPLOAD_BYTES) {
        setStatus({
          tone: "danger",
          text: "Still over 5 MB after compression. Choose a smaller photo.",
        });
        return;
      }
      setPhase("uploading");
      const result = await uploadPhoto(password, member.id, slot, compressed.file);
      if (result.ok) {
        clearSelection();
        setStatus({ tone: "success", text: `${label} saved. It is live on the site now.` });
        onSaved(result.data.member);
      } else {
        fail(result);
      }
    } finally {
      setPhase("idle");
      onBusyChange(false);
    }
  }

  async function handleRemove() {
    if (busy || active || !password) return;
    setStatus(null);
    setPhase("removing");
    onBusyChange(true);
    try {
      const result = await removePhoto(password, member.id, slot);
      if (result.ok) {
        setStatus({ tone: "info", text: `${label} removed from the site.` });
        onSaved(result.data.member);
      } else {
        fail(result);
      }
    } finally {
      setPhase("idle");
      onBusyChange(false);
    }
  }

  return (
    <div className="grid content-start gap-3 rounded-card border border-edge bg-surface-alt p-[clamp(1rem,3cqi,1.25rem)]">
      <div className="flex min-h-11 items-center justify-between gap-2">
        <h3 className="m-0 type-ui font-semibold text-ink">{label}</h3>
        {currentSrc && !file ? (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            disabled={busy || active}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-control px-2 type-ui-sm font-semibold text-ink-secondary transition-colors duration-150 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      {currentSrc || previewUrl ? (
        <div className={cn("grid gap-3", currentSrc && previewUrl && "min-[30rem]:grid-cols-2")}>
          {currentSrc ? (
            <figure className="m-0 grid min-w-0 gap-1.5">
              <img
                key={member.version ?? 0}
                src={currentSrc}
                alt={`Current ${label.toLowerCase()} for ${member.name}`}
                className="aspect-[4/5] w-full rounded-frame border border-edge bg-surface-muted object-cover"
                loading="lazy"
              />
              <figcaption className="type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Current
              </figcaption>
            </figure>
          ) : null}
          {previewUrl ? (
            <figure className="m-0 grid min-w-0 gap-1.5">
              <img
                src={previewUrl}
                alt={`Selected ${label.toLowerCase()}, not saved yet`}
                className="aspect-[4/5] w-full rounded-frame border border-accent object-cover"
              />
              <figcaption className="type-micro font-semibold tracking-[0.06em] uppercase text-accent">
                New · not saved yet
              </figcaption>
            </figure>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy && !active) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) selectFile(dropped);
        }}
        disabled={busy || active}
        className={cn(
          "grid min-h-[7rem] w-full place-items-center gap-1.5 rounded-frame border border-dashed px-4 py-5 text-center transition-[background-color,border-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50",
          dragging ? "border-accent bg-accent/10" : "border-edge bg-surface hover:bg-surface-muted",
        )}
      >
        {phase === "compressing" || phase === "uploading" ? (
          <LoaderCircle className="size-5 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <ImagePlus className="size-5 text-ink-secondary" aria-hidden="true" />
        )}
        <span className="type-ui font-semibold text-ink">
          {phase === "compressing"
            ? "Compressing…"
            : phase === "uploading"
              ? "Uploading…"
              : phase === "removing"
                ? "Removing…"
                : file
                  ? "Choose a different photo"
                  : "Drag a photo here, or browse"}
        </span>
        <span className="type-ui-sm text-ink-muted">
          JPEG, PNG or WebP · up to 5 MB · resized to 1600px
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) selectFile(selected);
        }}
      />

      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 truncate type-ui-sm text-ink-secondary">
            {file.name}
            {dims ? ` · ${dims.w}×${dims.h}` : ""} · {formatBytes(file.size)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clearSelection}
              disabled={active}
              className={quietButtonStyles}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={busy || active}
              className={primaryButtonStyles}
            >
              {phase === "uploading" ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : null}
              {phase === "uploading" ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      ) : null}

      {status ? <StatusMessage tone={status.tone}>{status.text}</StatusMessage> : null}

      <ConfirmDialog
        open={confirmRemove}
        title={`Remove ${label.toLowerCase()}?`}
        description="The photo is deleted from the live site immediately. You can upload a new one anytime."
        confirmLabel="Remove photo"
        tone="danger"
        onConfirm={() => {
          setConfirmRemove(false);
          void handleRemove();
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}