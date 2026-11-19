export type ToastTone = "success" | "info" | "warning" | "danger";

export interface ToastItem {
  id: string;
  tone: ToastTone;
  text: string;
  link?: { to: string; label: string };
}

let toasts: ToastItem[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return toasts;
}

export function pushToast(toast: Omit<ToastItem, "id">): string {
  const id = `toast-${++counter}`;
  // Keep stack concise: latest 3 toasts.
  toasts = [...toasts.slice(-2), { ...toast, id }];
  emit();
  return id;
}

export function dismissToast(id: string) {
  const next = toasts.filter((t) => t.id !== id);
  if (next.length !== toasts.length) {
    toasts = next;
    emit();
  }
}
