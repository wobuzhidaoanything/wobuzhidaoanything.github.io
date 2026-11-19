import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Crop, RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import { attachBackdropLightDismiss, closeDialogSmoothly } from "@/lib/dialogMotion";
import { cropImageToFile, type NormalizedCrop } from "@/lib/photo";
import { primaryButtonStyles, quietButtonStyles } from "./buttons";
import { StatusMessage } from "./StatusMessage";

interface PhotoCropDialogProps {
  open: boolean;
  sessionKey: number;
  src: string | null;
  label: string;
  suggestedName: string;
  sourceMime?: string;
  onApply: (file: File) => void;
  onClose: () => void;
}

type PresetId = "free" | "original" | "1:1" | "4:5" | "3:4" | "4:3" | "16:10";
type CornerHandle = "nw" | "ne" | "sw" | "se";

const PRESETS: { id: PresetId; label: string; ratio: number | null }[] = [
  { id: "free", label: "Free", ratio: null },
  { id: "original", label: "Original", ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:5", label: "4:5", ratio: 4 / 5 },
  { id: "3:4", label: "3:4", ratio: 3 / 4 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:10", label: "16:10", ratio: 16 / 10 },
];

const FULL_CROP: NormalizedCrop = { x: 0, y: 0, w: 1, h: 1 };

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function resolveTargetRatio(
  preset: PresetId,
  natDims: { w: number; h: number } | null,
): number | null {
  if (preset === "original") {
    return natDims ? natDims.w / natDims.h : null;
  }
  return PRESETS.find((p) => p.id === preset)?.ratio ?? null;
}

function fitCropToRatio(
  current: NormalizedCrop,
  targetRatio: number,
  natW: number,
  natH: number,
): NormalizedCrop {
  const normRatio = targetRatio * (natH / natW);
  const minW = Math.min(0.5, 48 / natW);
  const minH = Math.min(0.5, 48 / natH);
  const cx = current.x + current.w / 2;
  const cy = current.y + current.h / 2;

  let w = current.w;
  let h = w / normRatio;
  if (h > current.h) {
    h = current.h;
    w = h * normRatio;
  }
  if (w > 1) {
    w = 1;
    h = w / normRatio;
  }
  if (h > 1) {
    h = 1;
    w = h * normRatio;
  }
  if (w < minW) {
    w = Math.min(1, minW);
    h = w / normRatio;
  }
  if (h < minH) {
    h = Math.min(1, minH);
    w = h * normRatio;
  }
  if (w > 1) {
    w = 1;
    h = w / normRatio;
  }
  if (h > 1) {
    h = 1;
    w = h * normRatio;
  }

  return {
    x: clamp(cx - w / 2, 0, Math.max(0, 1 - w)),
    y: clamp(cy - h / 2, 0, Math.max(0, 1 - h)),
    w,
    h,
  };
}

interface CropWorkspaceProps {
  blobSrc: string;
  label: string;
  suggestedName: string;
  sourceMime?: string;
  onApply: (file: File) => void;
  onClose: () => void;
}

function CropWorkspace({
  blobSrc,
  label,
  suggestedName,
  sourceMime,
  onApply,
  onClose,
}: CropWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);

  const [natDims, setNatDims] = useState<{ w: number; h: number } | null>(null);
  const [preset, setPreset] = useState<PresetId>("free");
  const [crop, setCrop] = useState<NormalizedCrop>(FULL_CROP);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<"move" | CornerHandle | null>(null);

  const interactionRef = useRef<
    | {
        mode: "move" | CornerHandle;
        startClientX: number;
        startClientY: number;
        startCrop: NormalizedCrop;
        stageW: number;
        stageH: number;
      }
    | null
  >(null);

  const targetRatio = resolveTargetRatio(preset, natDims);

  const outDims = useMemo(() => {
    if (!natDims) return null;
    return {
      w: Math.max(1, Math.round(crop.w * natDims.w)),
      h: Math.max(1, Math.round(crop.h * natDims.h)),
    };
  }, [crop.h, crop.w, natDims]);

  function announce(msg: string) {
    if (liveRef.current) {
      liveRef.current.textContent = msg;
    }
  }

  function handlePresetClick(nextPreset: PresetId) {
    setPreset(nextPreset);
    setApplyError(null);
    const nextRatio = resolveTargetRatio(nextPreset, natDims);
    if (!nextRatio || !natDims) return;
    setCrop((prev) => fitCropToRatio(prev, nextRatio, natDims.w, natDims.h));
  }

  function handleReset() {
    setPreset("free");
    setCrop(FULL_CROP);
    setApplyError(null);
    announce("Crop reset to full image.");
  }

  function minNormalizedSizes() {
    if (!natDims) return { minW: 0.1, minH: 0.1 };
    return {
      minW: Math.min(0.4, Math.max(0.06, 48 / natDims.w)),
      minH: Math.min(0.4, Math.max(0.06, 48 / natDims.h)),
    };
  }

  function computeResizedCrop(
    corner: CornerHandle,
    startCrop: NormalizedCrop,
    dxNorm: number,
    dyNorm: number,
  ): NormalizedCrop {
    const { minW, minH } = minNormalizedSizes();
    const isWest = corner.includes("w");
    const isEast = corner.includes("e");
    const isNorth = corner.includes("n");
    const isSouth = corner.includes("s");

    const ax = isWest ? startCrop.x + startCrop.w : startCrop.x;
    const ay = isNorth ? startCrop.y + startCrop.h : startCrop.y;
    const rawCornerX = isWest ? startCrop.x + dxNorm : startCrop.x + startCrop.w + dxNorm;
    const rawCornerY = isNorth ? startCrop.y + dyNorm : startCrop.y + startCrop.h + dyNorm;

    if (!targetRatio || !natDims) {
      const x1 = isWest ? clamp(rawCornerX, 0, ax - minW) : ax;
      const x2 = isEast ? clamp(rawCornerX, ax + minW, 1) : ax;
      const y1 = isNorth ? clamp(rawCornerY, 0, ay - minH) : ay;
      const y2 = isSouth ? clamp(rawCornerY, ay + minH, 1) : ay;
      return {
        x: x1,
        y: y1,
        w: Math.max(minW, x2 - x1),
        h: Math.max(minH, y2 - y1),
      };
    }

    const normRatio = targetRatio * (natDims.h / natDims.w);
    const availW = isEast ? 1 - ax : ax;
    const availH = isSouth ? 1 - ay : ay;
    const rawW = clamp(isWest ? ax - rawCornerX : rawCornerX - ax, 0, availW);
    const rawH = clamp(isNorth ? ay - rawCornerY : rawCornerY - ay, 0, availH);

    let w = Math.max(rawW, rawH * normRatio);
    let h = w / normRatio;

    if (w > availW) {
      w = availW;
      h = w / normRatio;
    }
    if (h > availH) {
      h = availH;
      w = h * normRatio;
    }
    if (w < minW) {
      w = Math.min(availW, minW);
      h = w / normRatio;
    }
    if (h < minH) {
      h = Math.min(availH, minH);
      w = h * normRatio;
    }
    if (w > availW) {
      w = availW;
      h = w / normRatio;
    }
    if (h > availH) {
      h = availH;
      w = h * normRatio;
    }

    return {
      x: isWest ? ax - w : ax,
      y: isNorth ? ay - h : ay,
      w,
      h,
    };
  }

  function startPointer(mode: "move" | CornerHandle, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || !stageRef.current) return;
    e.stopPropagation();
    const rect = stageRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    interactionRef.current = {
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCrop: crop,
      stageW: rect.width,
      stageH: rect.height,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraggingHandle(mode);
  }

  function movePointer(e: React.PointerEvent<HTMLButtonElement>) {
    const active = interactionRef.current;
    if (!active || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dxNorm = (e.clientX - active.startClientX) / active.stageW;
    const dyNorm = (e.clientY - active.startClientY) / active.stageH;

    if (active.mode === "move") {
      const nextX = clamp(active.startCrop.x + dxNorm, 0, Math.max(0, 1 - active.startCrop.w));
      const nextY = clamp(active.startCrop.y + dyNorm, 0, Math.max(0, 1 - active.startCrop.h));
      setCrop({
        ...active.startCrop,
        x: nextX,
        y: nextY,
      });
      return;
    }

    setCrop(computeResizedCrop(active.mode, active.startCrop, dxNorm, dyNorm));
  }

  function endPointer(mode: "move" | CornerHandle) {
    interactionRef.current = null;
    setDraggingHandle(null);
    if (outDims) {
      announce(
        mode === "move"
          ? `Crop moved to ${outDims.w} by ${outDims.h} pixels`
          : `Crop resized to ${outDims.w} by ${outDims.h} pixels`,
      );
    }
  }

  function handleMoveKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 0.05 : 0.015;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;

    e.preventDefault();
    setCrop((prev) => ({
      ...prev,
      x: clamp(prev.x + dx, 0, Math.max(0, 1 - prev.w)),
      y: clamp(prev.y + dy, 0, Math.max(0, 1 - prev.h)),
    }));
  }

  function handleCornerKeyDown(corner: CornerHandle, e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 0.05 : 0.015;
    let dx = 0;
    let dy = 0;
    if (e.key === "ArrowLeft") dx = -step;
    else if (e.key === "ArrowRight") dx = step;
    else if (e.key === "ArrowUp") dy = -step;
    else if (e.key === "ArrowDown") dy = step;
    else return;

    e.preventDefault();
    setCrop((prev) => computeResizedCrop(corner, prev, dx, dy));
  }

  async function handleApplyClick() {
    if (!imgRef.current || !natDims) return;
    setApplying(true);
    setApplyError(null);
    try {
      const file = await cropImageToFile(imgRef.current, crop, suggestedName, sourceMime);
      onApply(file);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : "Could not crop image.");
    } finally {
      setApplying(false);
    }
  }

  const cornerMeta: {
    id: CornerHandle;
    posClass: string;
    cursorClass: string;
    label: string;
  }[] = [
    {
      id: "nw",
      posClass: "top-0 left-0",
      cursorClass: "cursor-nwse-resize",
      label: "Resize top left crop corner",
    },
    {
      id: "ne",
      posClass: "top-0 left-full",
      cursorClass: "cursor-nesw-resize",
      label: "Resize top right crop corner",
    },
    {
      id: "sw",
      posClass: "top-full left-0",
      cursorClass: "cursor-nesw-resize",
      label: "Resize bottom left crop corner",
    },
    {
      id: "se",
      posClass: "top-full left-full",
      cursorClass: "cursor-nwse-resize",
      label: "Resize bottom right crop corner",
    },
  ];

  return (
    <div className="grid gap-4 bg-page p-[clamp(1rem,3cqi,1.5rem)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Aspect ratio presets"
        >
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={preset === p.id}
              onClick={() => handlePresetClick(p.id)}
              className={cn(
                "ui-press min-h-9 cursor-pointer rounded-control border px-2.5 py-1 type-micro font-semibold pointer-coarse:min-h-11",
                preset === p.id
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-edge bg-surface text-ink-secondary hover:bg-surface-muted hover:text-ink",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleReset}
          className={cn(quietButtonStyles, "min-h-9 px-3 py-1 type-ui-sm pointer-coarse:min-h-11")}
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          Reset
        </button>
      </div>

      <div className="grid place-items-center overflow-hidden rounded-frame border border-edge bg-surface-alt p-[clamp(0.75rem,2.5cqi,1.25rem)]">
        <div
          ref={stageRef}
          className="relative inline-block max-w-full select-none rounded-[calc(var(--radius-frame)-0.25rem)]"
        >
          <img
            ref={imgRef}
            src={blobSrc}
            alt={`Crop preview for ${label.toLowerCase()}`}
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              if (el.naturalWidth && el.naturalHeight) {
                setNatDims({ w: el.naturalWidth, h: el.naturalHeight });
              }
            }}
            className="pointer-events-none block h-auto max-h-[min(46dvb,26rem)] w-auto max-w-full rounded-[calc(var(--radius-frame)-0.25rem)] select-none"
          />

          {natDims ? (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[calc(var(--radius-frame)-0.25rem)]">
              <div
                className="pointer-events-auto absolute"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.w * 100}%`,
                  height: `${crop.h * 100}%`,
                  boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.56)",
                }}
              >
                <div
                  className="pointer-events-none absolute inset-0 border-2 border-white"
                  aria-hidden="true"
                >
                  <span className="absolute inset-x-0 top-1/3 border-t border-white/40" />
                  <span className="absolute inset-x-0 top-2/3 border-t border-white/40" />
                  <span className="absolute inset-y-0 left-1/3 border-l border-white/40" />
                  <span className="absolute inset-y-0 left-2/3 border-l border-white/40" />
                </div>

                <button
                  type="button"
                  aria-label="Move crop selection. Drag or use arrow keys to adjust position."
                  onPointerDown={(e) => startPointer("move", e)}
                  onPointerMove={movePointer}
                  onPointerUp={() => endPointer("move")}
                  onLostPointerCapture={() => endPointer("move")}
                  onKeyDown={handleMoveKeyDown}
                  className={cn(
                    "crop-handle absolute inset-0 bg-transparent focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-accent",
                    draggingHandle === "move" ? "cursor-grabbing" : "cursor-grab",
                  )}
                />

                {cornerMeta.map((corner) => (
                  <button
                    key={corner.id}
                    type="button"
                    aria-label={`${corner.label}. Drag or use arrow keys to resize.`}
                    onPointerDown={(e) => startPointer(corner.id, e)}
                    onPointerMove={movePointer}
                    onPointerUp={() => endPointer(corner.id)}
                    onLostPointerCapture={() => endPointer(corner.id)}
                    onKeyDown={(e) => handleCornerKeyDown(corner.id, e)}
                    className={cn(
                      "crop-handle absolute z-2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center bg-transparent pointer-coarse:size-11",
                      corner.posClass,
                      corner.cursorClass,
                    )}
                  >
                    <span
                      className={cn(
                        "size-3.5 rounded-full border-2 border-ink bg-white shadow-raised transition-transform",
                        draggingHandle === corner.id && "scale-115 bg-accent",
                      )}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sr-only" aria-live="polite" ref={liveRef} />

      {applyError ? <StatusMessage tone="danger">{applyError}</StatusMessage> : null}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
        <div className="grid gap-0.5">
          <span className="font-mono type-ui-sm font-semibold tabular text-ink">
            {outDims ? `Output: ${outDims.w} × ${outDims.h} px` : "Loading dimensions..."}
          </span>
          <span className="type-micro text-ink-muted">
            Drag corners to resize or drag inside to move. Hold Shift with arrow keys for bigger steps.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onClose} disabled={applying} className={quietButtonStyles}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleApplyClick()}
            disabled={applying || !natDims}
            className={primaryButtonStyles}
          >
            <Check className="size-4" aria-hidden="true" />
            {applying ? "Cropping..." : "Apply crop"}
          </button>
        </div>
      </footer>
    </div>
  );
}

export function PhotoCropDialog({
  open,
  sessionKey,
  src,
  label,
  suggestedName,
  sourceMime,
  onApply,
  onClose,
}: PhotoCropDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  const isLocal = Boolean(src && (src.startsWith("blob:") || src.startsWith("data:")));
  const [fetched, setFetched] = useState<{
    forSrc: string;
    blobUrl?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute("data-closing");
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeDialogSmoothly(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    return attachBackdropLightDismiss(dialog, onClose);
  }, [onClose]);

  useEffect(() => {
    if (!open || !src || isLocal) return;
    let active = true;
    let createdUrl: string | null = null;
    const controller = new AbortController();

    void (async () => {
      try {
        const res = await fetch(src, { mode: "cors", signal: controller.signal });
        if (!res.ok) {
          throw new Error(`Could not load photo (${res.status})`);
        }
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(createdUrl);
          return;
        }
        setFetched({ forSrc: src, blobUrl: createdUrl });
      } catch (err) {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setFetched({
          forSrc: src,
          error: err instanceof Error ? err.message : "Could not load photo for cropping.",
        });
      }
    })();

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isLocal, open, src]);

  const remoteState = src && !isLocal && fetched?.forSrc === src ? fetched : null;
  const resolvedBlobSrc = isLocal ? src : (remoteState?.blobUrl ?? null);
  const fetchError = !isLocal ? (remoteState?.error ?? null) : null;
  const loadingRemote = Boolean(open && src && !isLocal && !remoteState);

  return (
    <dialog
      ref={dialogRef}
      className="crop-dialog"
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, unknown>)}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = "";
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="grid gap-0">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-rule bg-surface px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Crop className="size-4 text-accent" aria-hidden="true" />
            <h2 id={titleId} className="m-0 font-serif type-heading-xs font-semibold text-ink">
              Crop {label.toLowerCase()}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close crop editor"
            className="ui-press inline-flex size-10 cursor-pointer items-center justify-center rounded-control border border-edge bg-surface text-ink hover:bg-surface-muted/75 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        {fetchError ? (
          <div className="grid gap-4 bg-page p-6">
            <StatusMessage tone="danger">{fetchError}</StatusMessage>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={quietButtonStyles}>
                Close
              </button>
            </div>
          </div>
        ) : loadingRemote || !resolvedBlobSrc ? (
          <div className="grid min-h-[16rem] place-items-center bg-page p-8 type-ui text-ink-secondary">
            Loading photo for cropping...
          </div>
        ) : (
          <CropWorkspace
            key={`${resolvedBlobSrc}-${sessionKey}`}
            blobSrc={resolvedBlobSrc}
            label={label}
            suggestedName={suggestedName}
            sourceMime={sourceMime}
            onApply={onApply}
            onClose={onClose}
          />
        )}
      </div>
    </dialog>
  );
}
