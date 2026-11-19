import { useRef, useState } from "react";
import { Crop, ImagePlus, RotateCcw, Trash2, Upload } from "lucide-react";
import { cn } from "cn";
import type { TeamMember } from "@/data/capstone";
import { useFileObjectUrl } from "@/hooks/useFileObjectUrl";
import { resolveImageSrc } from "@/lib/media";
import { formatBytes } from "@/lib/photo";
import { PhotoCropDialog } from "./PhotoCropDialog";
import { StatusMessage } from "./StatusMessage";
import { quietButtonStyles } from "./buttons";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_RAW_BYTES = 20 * 1024 * 1024;

interface PhotoSlotProps {
  slot: "hero" | "secondary";
  label: string;
  hint: string;
  member: TeamMember;
  stagedFile: File | null;
  stagedRemove: boolean;
  onStageFile: (file: File) => void;
  onStageRemove: () => void;
  onUndoStage: () => void;
}

export function PhotoSlot({
  slot,
  label,
  hint,
  member,
  stagedFile,
  stagedRemove,
  onStageFile,
  onStageRemove,
  onUndoStage,
}: PhotoSlotProps) {
  const previewUrl = useFileObjectUrl(stagedFile);
  const [dims, setDims] = useState<{ src: string; w: number; h: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropSession, setCropSession] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currentKey =
    slot === "hero" ? member.artifacts?.heroImage : member.artifacts?.secondaryImage;
  const currentSrc = resolveImageSrc(currentKey);

  function selectFile(next: File) {
    if (!ALLOWED_TYPES.includes(next.type)) {
      setError("Use JPEG, PNG, or WebP. Export iPhone HEIC photos as JPEG first.");
      return;
    }
    if (next.size > MAX_RAW_BYTES) {
      setError("That file exceeds 20 MB. Choose a smaller photo.");
      return;
    }
    setError(null);
    onStageFile(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  const activeSrc = stagedRemove ? undefined : (previewUrl ?? currentSrc);
  const activeDims = activeSrc && dims?.src === activeSrc ? dims : null;
  const hasStagedChange = Boolean(stagedFile) || stagedRemove;

  return (
    <div className="grid content-start gap-3 rounded-card border border-edge bg-surface p-[clamp(1rem,3cqi,1.35rem)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="m-0 type-ui font-semibold text-ink">{label}</h3>
          <p className="m-0 type-ui-sm text-ink-muted">{hint}</p>
        </div>
        {stagedFile ? (
          <span className="rounded-chip border border-warning/40 bg-warning-surface px-2 py-0.5 type-micro font-semibold text-warning">
            Staged · save to publish
          </span>
        ) : stagedRemove ? (
          <span className="rounded-chip border border-danger/40 bg-danger-surface px-2 py-0.5 type-micro font-semibold text-danger">
            Removing on save
          </span>
        ) : null}
      </div>

      {activeSrc ? (
        <div className="overflow-hidden rounded-frame border border-edge bg-surface-alt">
          <div className="grid place-items-center p-2">
            <img
              key={previewUrl ?? `${currentSrc ?? "empty"}-${member.version ?? 0}`}
              src={activeSrc}
              alt={
                previewUrl
                  ? `Selected ${label.toLowerCase()} preview`
                  : `Current ${label.toLowerCase()} for ${member.name}`
              }
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth && el.naturalHeight) {
                  setDims({ src: activeSrc, w: el.naturalWidth, h: el.naturalHeight });
                }
              }}
              className="block h-auto max-h-[18rem] w-auto max-w-full rounded-[calc(var(--radius-frame)-0.35rem)]"
            />
          </div>
          {stagedFile || activeDims ? (
            <div className="border-t border-rule bg-surface px-3 py-1.5 type-micro tabular text-ink-secondary">
              {stagedFile ? (
                <>
                  {stagedFile.name}
                  {activeDims ? ` · ${activeDims.w} × ${activeDims.h} px` : ""} ·{" "}
                  {formatBytes(stagedFile.size)}
                </>
              ) : activeDims ? (
                `Actual dimensions: ${activeDims.w} × ${activeDims.h} px`
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) selectFile(dropped);
          }}
          className={cn(
            "grid min-h-[10rem] w-full cursor-pointer place-items-center gap-1.5 rounded-frame border border-dashed px-4 py-6 text-center transition-[background-color,border-color] duration-150",
            dragging
              ? "border-accent bg-accent/10"
              : "border-edge bg-surface-alt hover:bg-surface-muted",
          )}
        >
          <ImagePlus className="size-5 text-ink-secondary" aria-hidden="true" />
          <span className="type-ui font-semibold text-ink">
            {stagedRemove ? "Photo marked for removal" : "Drop a photo here, or browse"}
          </span>
          <span className="type-ui-sm text-ink-muted">
            JPEG, PNG or WebP · shown at actual dimensions
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={`Choose ${label.toLowerCase()}`}
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) selectFile(selected);
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={quietButtonStyles}
        >
          <Upload className="size-4" aria-hidden="true" />
          {activeSrc ? "Replace" : "Choose photo"}
        </button>

        {activeSrc ? (
          <button
            type="button"
            onClick={() => {
              setCropSession((s) => s + 1);
              setCropOpen(true);
            }}
            className={quietButtonStyles}
          >
            <Crop className="size-4" aria-hidden="true" />
            Crop
          </button>
        ) : null}

        {hasStagedChange ? (
          <button type="button" onClick={onUndoStage} className={quietButtonStyles}>
            <RotateCcw className="size-4" aria-hidden="true" />
            Undo
          </button>
        ) : currentSrc ? (
          <button
            type="button"
            onClick={onStageRemove}
            className={cn(quietButtonStyles, "hover:text-danger")}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      <PhotoCropDialog
        open={cropOpen}
        sessionKey={cropSession}
        src={activeSrc ?? null}
        label={label}
        suggestedName={stagedFile?.name ?? `${member.slug}-${slot}`}
        sourceMime={stagedFile?.type}
        onApply={(croppedFile) => {
          setError(null);
          onStageFile(croppedFile);
          setCropOpen(false);
        }}
        onClose={() => setCropOpen(false)}
      />
    </div>
  );
}
