import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "cn";
import { LIMITS } from "@/lib/editorForm";
import { quietButtonStyles } from "./buttons";
import { FieldShell, inputStyles } from "./fields";

interface ItemsEditorProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  items: string[];
  onChange: (items: string[]) => void;
  addPlaceholder?: string;
  emptyText?: string;
}

export function ItemsEditor({
  id,
  label,
  hint,
  error,
  items,
  onChange,
  addPlaceholder,
  emptyText,
}: ItemsEditorProps) {
  const [pending, setPending] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function addItem(raw: string) {
    const item = raw.trim();
    if (!item) return;
    if (items.includes(item)) {
      setNotice(`“${item}” is already listed.`);
      return;
    }
    if (items.length >= LIMITS.listCount) {
      setNotice(`Keep to ${LIMITS.listCount} items or fewer.`);
      return;
    }
    if (item.length > LIMITS.listItem) {
      setNotice(`Keep each item to ${LIMITS.listItem} characters or fewer.`);
      return;
    }
    onChange([...items, item]);
    setPending("");
    setNotice(null);
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes(",") && !text.includes("\n")) return;
    e.preventDefault();
    const parts = text
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...items];
    let skippedLong = false;
    let hitCap = false;
    for (const part of parts) {
      if (part.length > LIMITS.listItem) {
        skippedLong = true;
        continue;
      }
      if (merged.includes(part)) continue;
      if (merged.length >= LIMITS.listCount) {
        hitCap = true;
        break;
      }
      merged.push(part);
    }
    onChange(merged);
    if (hitCap) setNotice(`Reached the ${LIMITS.listCount}-item limit.`);
    else if (skippedLong) setNotice(`Skipped items longer than ${LIMITS.listItem} characters.`);
    else setNotice(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const native = e.nativeEvent;
    if (native.isComposing || native.keyCode === 229) return;
    addItem(pending);
  }

  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      group
      counter={{ value: items.length, max: LIMITS.listCount }}
    >
      <div id={id} tabIndex={-1} className="grid min-w-0 gap-2.5 focus:outline-none">
        {items.length ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {items.map((item) => (
              <li
                key={item}
                className="inline-flex items-center gap-1 rounded-chip border border-edge bg-surface-muted py-1 ps-2.5 pe-1 type-ui-sm text-ink"
              >
                <span className="min-w-0">{item}</span>
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => {
                    onChange(items.filter((value) => value !== item));
                    setNotice(null);
                  }}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-danger-surface hover:text-danger pointer-coarse:size-11"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 type-ui-sm text-ink-muted">
            {emptyText ?? "Nothing here yet. Add the first item below."}
          </p>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={pending}
            maxLength={LIMITS.listItem}
            placeholder={addPlaceholder ?? `Add ${label.toLowerCase()}…`}
            aria-label={`Add ${label} item`}
            onChange={(e) => {
              setPending(e.target.value);
              setNotice(null);
            }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            className={cn(inputStyles, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={() => addItem(pending)}
            disabled={!pending.trim() || items.length >= LIMITS.listCount}
            className={cn(quietButtonStyles, "shrink-0")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add
          </button>
        </div>

        {notice ? (
          <span className="type-ui-sm text-warning" role="status">
            {notice}
          </span>
        ) : pending.trim() ? (
          <span className="type-ui-sm text-ink-secondary" role="status">
            Press Enter or click Add to include “{pending.trim()}” before saving.
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}
