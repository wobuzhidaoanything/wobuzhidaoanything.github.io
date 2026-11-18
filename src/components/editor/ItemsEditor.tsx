import { useState } from "react";
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

  function add() {
    const item = pending.trim();
    if (!item) return;
    if (items.includes(item)) {
      setNotice(`“${item}” is already listed.`);
      return;
    }
    if (items.length >= LIMITS.listCount) {
      setNotice(`Keep to ${LIMITS.listCount} items or fewer.`);
      return;
    }
    onChange([...items, item]);
    setPending("");
    setNotice(null);
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
      <div id={id} tabIndex={-1} className="grid min-w-0 gap-2 focus:outline-none">
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
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={cn(inputStyles, "min-w-0 flex-1")}
          />
          <button
            type="button"
            onClick={add}
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
        ) : null}
      </div>
    </FieldShell>
  );
}