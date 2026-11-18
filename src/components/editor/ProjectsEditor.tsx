import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import type { MemberProject } from "@/data/capstone";
import { LIMITS } from "@/lib/editorForm";
import { StatusMessage } from "./StatusMessage";
import { iconButtonStyles, quietButtonStyles } from "./buttons";
import { inputStyles } from "./fields";

interface ProjectsEditorProps {
  projects: MemberProject[];
  onChange: (next: MemberProject[]) => void;
  error?: string;
  showErrors: boolean;
}

export function ProjectsEditor({ projects, onChange, error, showErrors }: ProjectsEditorProps) {
  function update(index: number, patch: Partial<MemberProject>) {
    onChange(projects.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    const next = [...projects];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div id="projects-editor" tabIndex={-1} className="grid gap-3 focus:outline-none">
      {projects.length === 0 ? (
        <p className="m-0 type-ui-sm text-ink-muted">
          No projects yet. Add your capstone, internships or side projects.
        </p>
      ) : null}

      {projects.map((project, index) => (
        <div
          key={index}
          className="grid items-start gap-2 min-[40rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]"
        >
          <input
            aria-label={`Project ${index + 1} title`}
            placeholder="Title"
            value={project.title}
            maxLength={LIMITS.projectTitle}
            onChange={(e) => update(index, { title: e.target.value })}
            aria-invalid={showErrors && !project.title.trim() ? true : undefined}
            className={inputStyles}
          />
          <input
            aria-label={`Project ${index + 1} description`}
            placeholder="Description"
            value={project.detail}
            maxLength={LIMITS.projectDetail}
            onChange={(e) => update(index, { detail: e.target.value })}
            className={inputStyles}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move project ${index + 1} up`}
              className={iconButtonStyles}
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === projects.length - 1}
              aria-label={`Move project ${index + 1} down`}
              className={iconButtonStyles}
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onChange(projects.filter((_, i) => i !== index))}
              aria-label={`Remove project ${index + 1}`}
              className={cn(iconButtonStyles, "hover:text-danger")}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...projects, { title: "", detail: "" }])}
        disabled={projects.length >= LIMITS.projectCount}
        className={quietButtonStyles}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add project
      </button>

      {error ? (
        <StatusMessage tone="danger">{error}</StatusMessage>
      ) : (
        <p className="m-0 type-ui-sm text-ink-muted">
          Shown on your profile as “Projects &amp; Internships” · {projects.length}/
          {LIMITS.projectCount}
        </p>
      )}
    </div>
  );
}