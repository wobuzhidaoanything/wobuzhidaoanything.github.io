import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "cn";

export const inputStyles =
  "w-full min-h-11 px-3.5 py-2 rounded-control border border-edge bg-surface type-body text-ink placeholder:text-ink-muted transition-[border-color] duration-150 focus-visible:outline-[3px] focus-visible:outline-accent focus-visible:outline-offset-2 aria-[invalid=true]:border-danger";

function describedBy(id: string, error?: string, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  counter?: { value: number; max: number };
  group?: boolean;
  children: ReactNode;
}

export function FieldShell({
  id,
  label,
  required,
  hint,
  error,
  counter,
  group,
  children,
}: FieldShellProps) {
  const showCounter =
    counter !== undefined &&
    (counter.value >= Math.floor(counter.max * 0.75) || counter.value > counter.max);

  const labelClass = "type-ui font-semibold text-ink";
  const labelContent = (
    <>
      {label}
      {required ? (
        <span aria-hidden="true" className="text-danger">
          {" "}
          *
        </span>
      ) : null}
    </>
  );

  return (
    <div className="field-shell grid min-w-0 gap-1.5 text-left">
      <div className="flex items-baseline justify-between gap-3">
        {group ? (
          <span id={`${id}-label`} className={labelClass}>
            {labelContent}
          </span>
        ) : (
          <label htmlFor={id} className={labelClass}>
            {labelContent}
          </label>
        )}
        {showCounter ? (
          <span
            className={cn(
              "type-micro tabular",
              counter.value > counter.max ? "font-semibold text-danger" : "text-ink-muted",
            )}
          >
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      <div
        className="grid min-w-0 content-start gap-1.5"
        role={group ? "group" : undefined}
        aria-labelledby={group ? `${id}-label` : undefined}
        aria-describedby={group ? describedBy(id, error, hint) : undefined}
      >
        {children}
        {error ? (
          <span id={`${id}-error`} className="inline-flex items-start gap-1.5 type-ui-sm text-danger">
            <CircleAlert className="mt-[0.18em] size-[1.1em] shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </span>
        ) : hint ? (
          <span id={`${id}-hint`} className="type-ui-sm text-ink-muted">
            {hint}
          </span>
        ) : null}
      </div>
    </div>
  );
}

interface TextFieldProps {
  id: string;
  label: string;
  type?: "text" | "url" | "email";
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  required?: boolean;
  hint?: string;
  error?: string;
  maxLength?: number;
  autoComplete?: string;
  enterKeyHint?: "next" | "done" | "go";
  placeholder?: string;
}

export function TextField({
  id,
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  required,
  hint,
  error,
  maxLength,
  autoComplete,
  enterKeyHint,
  placeholder,
}: TextFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
      counter={maxLength ? { value: value.length, max: maxLength } : undefined}
    >
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        maxLength={maxLength}
        autoComplete={autoComplete}
        enterKeyHint={enterKeyHint}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={inputStyles}
      />
    </FieldShell>
  );
}

interface TextAreaFieldProps
  extends Omit<TextFieldProps, "type" | "autoComplete" | "enterKeyHint"> {
  rows?: number;
}

export function TextAreaField({
  id,
  label,
  value,
  onChange,
  onBlur,
  required,
  hint,
  error,
  maxLength,
  rows = 3,
  placeholder,
}: TextAreaFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      required={required}
      hint={hint}
      error={error}
      counter={maxLength ? { value: value.length, max: maxLength } : undefined}
    >
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={cn(inputStyles, "field-auto-size resize-y")}
      />
    </FieldShell>
  );
}
