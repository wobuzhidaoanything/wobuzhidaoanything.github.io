import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "cn";
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

/** Native <dialog>: built-in focus trap, Esc handling and top-layer stacking. */
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

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="editor-dialog"
      aria-labelledby="editor-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
    >
      <div className="grid gap-4 p-6">
        <h2 id="editor-dialog-title" className="m-0 font-serif type-heading-xs font-semibold">
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