import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";
import { fetchHealth } from "@/lib/editorApi";
import { unlockEditor } from "@/lib/editorSession";
import { StatusMessage, type StatusTone } from "./StatusMessage";
import { FieldShell, inputStyles } from "./fields";
import { primaryButtonStyles } from "./buttons";

interface EditorGateProps {
  notice: { tone: StatusTone; text: string } | null;
  onUnlocked: () => void;
}

type Health = "checking" | "online" | "unconfigured" | "unreachable";

export function EditorGate({ notice, onUnlocked }: EditorGateProps) {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [checking, setChecking] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<Health>("checking");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth().then((status) => {
      if (cancelled) return;
      setHealth(status ? (status.configured ? "online" : "unconfigured") : "unreachable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const blankError = touched && password.length === 0 ? "Enter the group password." : undefined;
  const shownError = error ?? blankError;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (password.length === 0) return;
    setChecking(true);
    setError(null);
    const result = await unlockEditor(password);
    setChecking(false);
    if (result.ok) {
      onUnlocked();
      return;
    }
    setError(
      result.status === 429 && result.retryAfter
        ? `Too many attempts. Try again in ${result.retryAfter} seconds.`
        : result.status === 401
          ? "Incorrect password. Enter it again."
          : result.error,
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[26rem] gap-[clamp(1rem,3cqi,1.5rem)]">
      <div className="flex items-center gap-3.5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-edge bg-surface-muted">
          <Lock className="size-5 text-accent" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="gate-heading" className="m-0 font-serif type-heading-xs font-semibold">
            Unlock the editor
          </h2>
          <p className="m-0 type-ui-sm text-ink-secondary">
            Shared team password · stays unlocked while you browse
          </p>
        </div>
      </div>

      {notice ? <StatusMessage tone={notice.tone}>{notice.text}</StatusMessage> : null}

      <form onSubmit={handleSubmit} noValidate aria-labelledby="gate-heading" className="grid gap-4">
        <FieldShell id="group-password" label="Group password" required error={shownError}>
          <div className="relative">
            <input
              ref={inputRef}
              id="group-password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              onBlur={() => setTouched(true)}
              required
              disabled={checking}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? "group-password-error" : undefined}
              className={cn(inputStyles, "pr-12")}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-muted transition-colors duration-150 hover:text-ink"
            >
              {show ? (
                <EyeOff className="size-4.5" aria-hidden="true" />
              ) : (
                <Eye className="size-4.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </FieldShell>
        <button
          type="submit"
          disabled={checking || health === "unconfigured"}
          className={primaryButtonStyles}
        >
          {checking ? (
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : null}
          {checking ? "Checking…" : "Unlock editor"}
        </button>
      </form>
    </div>
  );
}