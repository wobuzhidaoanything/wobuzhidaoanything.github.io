import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "cn";
import { attachBackdropLightDismiss, closeDialogSmoothly } from "@/lib/dialogMotion";
import { dangerButtonStyles, primaryButtonStyles, quietButtonStyles } from "./buttons";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  onCancel: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  tone?: "danger" | "accent";
}

/** Native <dialog>: top-layer modal with scroll containment, unique ARIA title ID, and exit fallback. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  cancelLabel = "Cancel",
  onCancel,
  secondaryLabel,
  onSecondary,
  tone = "accent",
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const lightDismiss = tone !== "danger";

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute("data-closing");
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeDialogSmoothly(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !lightDismiss) return;
    return attachBackdropLightDismiss(dialog, onCancel);
  }, [lightDismiss, onCancel]);

  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      aria-labelledby={titleId}
      {...({
        closedby: lightDismiss ? "any" : "closerequest",
      } as Record<string, unknown>)}
      onClose={() => {
        if (ref.current) ref.current.returnValue = "";
        if (open) onCancel();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className="grid gap-4 p-6">
        <h2 id={titleId} className="m-0 font-serif type-heading-xs font-semibold">
          {title}
        </h2>
        {description ? <div className="type-ui text-ink-secondary">{description}</div> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" autoFocus onClick={onCancel} className={quietButtonStyles}>
            {cancelLabel}
          </button>
          {secondaryLabel && onSecondary ? (
            <button type="button" onClick={onSecondary} className={quietButtonStyles}>
              {secondaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onConfirm}
            className={cn(tone === "danger" ? dangerButtonStyles : primaryButtonStyles)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
