import { CircleCheck, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "cn";

export type StatusTone = "success" | "danger" | "warning" | "info";

const toneStyles: Record<StatusTone, string> = {
  success: "border-success/35 bg-success-surface text-success",
  danger: "border-danger/35 bg-danger-surface text-danger",
  warning: "border-warning/35 bg-warning-surface text-warning",
  info: "border-info/35 bg-info-surface text-info",
};

const toneIcons: Record<StatusTone, typeof Info> = {
  success: CircleCheck,
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

interface StatusMessageProps {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}

export function StatusMessage({ tone, children, className }: StatusMessageProps) {
  const Icon = toneIcons[tone];
  return (
    <p
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "m-0 flex items-start gap-2 rounded-control border px-3.5 py-2.5 type-ui",
        toneStyles[tone],
        className,
      )}
    >
      <Icon className="mt-[0.18em] size-[1.1em] shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}