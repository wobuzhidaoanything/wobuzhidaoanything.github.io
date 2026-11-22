import { useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Plus, Star, Trash2, X } from "lucide-react";
import { cn } from "cn";
import { LIMITS, isValidHttpUrl, type EditorProjectForm } from "@/lib/editorForm";
import { serializeDetailFromEditor, splitDetailForEditor } from "@/lib/projectFormatting";
import { StatusMessage } from "./StatusMessage";
import { iconButtonStyles, quietButtonStyles } from "./buttons";
import { inputStyles } from "./fields";

interface ProjectsEditorProps {
  projects: EditorProjectForm[];
  onChange: (next: EditorProjectForm[]) => void;
  error?: string;
  showErrors: boolean;
}

interface ProjectDetailFieldsProps {
  index: number;
  detail: string;
  onChangeDetail: (nextDetail: string) => void;
}

function ProjectDetailFields({ index, detail, onChangeDetail }: ProjectDetailFieldsProps) {
  const [summary, setSummary] = useState(() => splitDetailForEditor(detail).summary);
  const [points, setPoints] = useState(() => splitDetailForEditor(detail).points);
  const [syncedDetail, setSyncedDetail] = useState(detail);
  const [pendingPoint, setPendingPoint] = useState("");
  const [pointNotice, setPointNotice] = useState<string | null>(null);

  if (detail !== syncedDetail) {
    const parsed = splitDetailForEditor(detail);
    setSummary(parsed.summary);
    setPoints(parsed.points);
    setSyncedDetail(detail);
    setPendingPoint("");
    setPointNotice(null);
  }

  function commit(nextSummary: string, nextPoints: string[]) {
    const serialized = serializeDetailFromEditor(nextSummary, nextPoints);
    if (serialized.length > LIMITS.projectDetail) {
      setPointNotice(
        `Project details are capped at ${LIMITS.projectDetail} characters (${serialized.length}/${LIMITS.projectDetail}). Shorten slightly before adding more.`,
      );
      return false;
    }
    setPointNotice(null);
    setSummary(nextSummary);
    setPoints(nextPoints);
    setSyncedDetail(serialized);
    onChangeDetail(serialized);
    return true;
  }

  function addPoint(raw: string) {
    const clean = raw.trim().replace(/^[-•*]\s+/, "").trim();
    if (!clean) return;
    if (commit(summary, [...points, clean])) {
      setPendingPoint("");
    }
  }

  function handlePastePoints(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n")) return;
    e.preventDefault();
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[-•*]\s+/, "").trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    if (commit(summary, [...points, ...lines])) {
      setPendingPoint("");
    }
  }

  function handlePointKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const native = e.nativeEvent;
    if (native.isComposing || native.keyCode === 229) return;
    addPoint(pendingPoint);
  }

  function movePoint(pointIdx: number, delta: number) {
    const target = pointIdx + delta;
    if (target < 0 || target >= points.length) return;
    const next = [...points];
    [next[pointIdx], next[target]] = [next[target], next[pointIdx]];
    commit(summary, next);
  }

  const charCount = syncedDetail.length;
  const overLimit = charCount > LIMITS.projectDetail;

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label
            htmlFor={`proj-${index}-summary`}
            className="type-ui-sm font-semibold text-ink"
          >
            Summary (optional)
          </label>
          {charCount >= Math.floor(LIMITS.projectDetail * 0.7) || overLimit ? (
            <span
              className={cn(
                "type-micro tabular",
                overLimit ? "font-semibold text-danger" : "text-ink-muted",
              )}
            >
              {charCount}/{LIMITS.projectDetail}
            </span>
          ) : null}
        </div>
        <textarea
          id={`proj-${index}-summary`}
          rows={2}
          placeholder="Optional 1-sentence overview of the project..."
          value={summary}
          onChange={(e) => {
            const nextSummary = e.target.value;
            const serialized = serializeDetailFromEditor(nextSummary, points);
            setSummary(nextSummary);
            setSyncedDetail(serialized);
            onChangeDetail(serialized);
            setPointNotice(null);
          }}
          aria-invalid={overLimit ? true : undefined}
          className={cn(inputStyles, "field-auto-size resize-y")}
        />
      </div>

      <div className="grid gap-2.5">
        <span className="type-ui-sm font-semibold text-ink">
          Key points
          <span className="ms-1.5 type-micro font-normal text-ink-muted">
            Rendered as clean bullets on your full profile
          </span>
        </span>

        {points.length > 0 ? (
          <ul className="m-0 grid list-none gap-2 p-0">
            {points.map((pt, ptIdx) => (
              <li
                key={ptIdx}
                className="flex items-start gap-2 rounded-control border border-rule bg-surface-alt/50 p-2"
              >
                <span
                  className="mt-3.5 ms-1 size-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden="true"
                />
                <textarea
                  rows={1}
                  aria-label={`Project ${index + 1} point ${ptIdx + 1}`}
                  value={pt}
                  onChange={(e) => {
                    const nextPt = e.target.value;
                    const nextPoints = points.map((v, i) => (i === ptIdx ? nextPt : v));
                    const serialized = serializeDetailFromEditor(summary, nextPoints);
                    setPoints(nextPoints);
                    setSyncedDetail(serialized);
                    onChangeDetail(serialized);
                    setPointNotice(null);
                  }}
                  className={cn(inputStyles, "field-auto-size min-h-10 flex-1 resize-y bg-surface py-2 type-body-sm")}
                />
                <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => movePoint(ptIdx, -1)}
                    disabled={ptIdx === 0}
                    aria-label={`Move point ${ptIdx + 1} up`}
                    className="ui-press inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 pointer-coarse:size-11"
                  >
                    <ChevronUp className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => movePoint(ptIdx, 1)}
                    disabled={ptIdx === points.length - 1}
                    aria-label={`Move point ${ptIdx + 1} down`}
                    className="ui-press inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-35 pointer-coarse:size-11"
                  >
                    <ChevronDown className="size-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => commit(summary, points.filter((_, i) => i !== ptIdx))}
                    aria-label={`Remove point ${ptIdx + 1}`}
                    className="ui-press inline-flex size-9 cursor-pointer items-center justify-center rounded-control text-ink-muted hover:bg-danger-surface hover:text-danger pointer-coarse:size-11"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2">
          <input
            type="text"
            value={pendingPoint}
            placeholder="Add a point (or paste multiple lines)..."
            aria-label={`Add point for project ${index + 1}`}
            onChange={(e) => {
              setPendingPoint(e.target.value);
              setPointNotice(null);
            }}
            onPaste={handlePastePoints}
            onKeyDown={handlePointKeyDown}
            className={cn(inputStyles, "min-w-0 flex-1 type-body-sm")}
          />
          <button
            type="button"
            onClick={() => addPoint(pendingPoint)}
            disabled={!pendingPoint.trim()}
            className={cn(quietButtonStyles, "shrink-0")}
          >
            <Plus className="size-4" aria-hidden="true" />
            <span>Add point</span>
          </button>
        </div>

        {pointNotice ? (
          <span className="type-ui-sm text-danger" role="status">
            {pointNotice}
          </span>
        ) : pendingPoint.trim() ? (
          <span className="type-ui-sm text-ink-secondary" role="status">
            Press Enter or click Add point to include this bullet before saving.
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectsEditor({ projects, onChange, error, showErrors }: ProjectsEditorProps) {
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set(projects.length <= 2 ? [0] : []));

  function update(index: number, patch: Partial<EditorProjectForm>) {
    onChange(projects.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= projects.length) return;
    const next = [...projects];
    [next[index], next[target]] = [next[target], next[index]];
    setOpenRows((prev) => {
      const updated = new Set<number>();
      for (const idx of prev) {
        if (idx === index) updated.add(target);
        else if (idx === target) updated.add(index);
        else updated.add(idx);
      }
      return updated;
    });
    onChange(next);
  }

  function remove(index: number) {
    setOpenRows((prev) => {
      const updated = new Set<number>();
      for (const idx of prev) {
        if (idx < index) updated.add(idx);
        else if (idx > index) updated.add(idx - 1);
      }
      return updated;
    });
    onChange(projects.filter((_, i) => i !== index));
  }

  function addProject() {
    const nextIndex = projects.length;
    setOpenRows((prev) => new Set([...prev, nextIndex]));
    onChange([...projects, { title: "", detail: "", tag: "", url: "", featured: true }]);
  }

  return (
    <div id="projects-editor" tabIndex={-1} className="grid gap-3 focus:outline-none">
      {projects.length === 0 ? (
        <p className="m-0 rounded-card border border-dashed border-edge bg-surface-alt/50 p-5 type-ui-sm text-ink-muted">
          No projects yet. Add your capstone builds, internships, or coursework prototypes.
        </p>
      ) : null}

      {projects.map((project, index) => {
        const titleMissing = showErrors && !project.title.trim();
        const detailTooLong = showErrors && project.detail.trim().length > LIMITS.projectDetail;
        const urlInvalid = showErrors && Boolean(project.url.trim()) && !isValidHttpUrl(project.url);
        const isOpen = openRows.has(index) || titleMissing || detailTooLong || urlInvalid;

        return (
          <details
            key={index}
            open={isOpen}
            onToggle={(e) => {
              const open = e.currentTarget.open;
              setOpenRows((prev) => {
                const next = new Set(prev);
                if (open) next.add(index);
                else next.delete(index);
                return next;
              });
            }}
            className={cn(
              "editorial-details rounded-card border bg-surface px-4 py-3",
              titleMissing || detailTooLong || urlInvalid ? "border-danger" : "border-edge",
            )}
          >
            <summary className="min-h-10 justify-between gap-3 select-none">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <span className="truncate type-body font-semibold text-ink">
                  {project.title.trim() || `Project ${index + 1} (untitled)`}
                </span>
                {project.tag.trim() ? (
                  <span className="rounded-chip border border-rule bg-surface-muted px-2 py-0.5 type-micro font-semibold text-ink-secondary">
                    {project.tag.trim()}
                  </span>
                ) : null}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 type-micro font-semibold text-ink-muted">
                {project.featured !== false ? (
                  <>
                    <Star className="size-3 fill-accent text-accent" aria-hidden="true" />
                    <span>Starred</span>
                  </>
                ) : (
                  <span>Not starred</span>
                )}
              </span>
            </summary>

            <div className="mt-3 grid gap-4 border-t border-rule pt-4">
              <div className="grid gap-1.5">
                <label
                  htmlFor={`proj-${index}-title`}
                  className="type-ui-sm font-semibold text-ink"
                >
                  Title <span className="text-danger">*</span>
                </label>
                <input
                  id={`proj-${index}-title`}
                  placeholder="e.g. Guard-Damp-It!"
                  value={project.title}
                  maxLength={LIMITS.projectTitle}
                  onChange={(e) => update(index, { title: e.target.value })}
                  aria-invalid={titleMissing ? true : undefined}
                  className={inputStyles}
                />
              </div>

              <ProjectDetailFields
                index={index}
                detail={project.detail}
                onChangeDetail={(detail) => update(index, { detail })}
              />

              <div className="grid gap-3 min-[36rem]:grid-cols-2">
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`proj-${index}-tag`}
                    className="type-ui-sm font-semibold text-ink"
                  >
                    Tag (optional)
                  </label>
                  <input
                    id={`proj-${index}-tag`}
                    placeholder="e.g. Hardware · Internship"
                    value={project.tag}
                    maxLength={LIMITS.projectTag}
                    onChange={(e) => update(index, { tag: e.target.value })}
                    className={inputStyles}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor={`proj-${index}-url`}
                    className="type-ui-sm font-semibold text-ink"
                  >
                    Project URL (optional)
                  </label>
                  <input
                    id={`proj-${index}-url`}
                    type="url"
                    placeholder="https://..."
                    value={project.url}
                    maxLength={LIMITS.url}
                    onChange={(e) => update(index, { url: e.target.value })}
                    aria-invalid={urlInvalid ? true : undefined}
                    className={inputStyles}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 type-ui-sm font-medium text-ink pointer-coarse:min-h-11">
                  <input
                    type="checkbox"
                    checked={project.featured !== false}
                    onChange={(e) => update(index, { featured: e.target.checked })}
                    className="size-4"
                  />
                  <span>Star: show in Our Experience &amp; Expertise on the home page</span>
                </label>

                <div className="flex items-center gap-1.5">
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
                    onClick={() => remove(index)}
                    aria-label={`Remove project ${index + 1}`}
                    className={cn(iconButtonStyles, "hover:text-danger")}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </details>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={addProject}
          disabled={projects.length >= LIMITS.projectCount}
          className={quietButtonStyles}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add project
        </button>

        <span className="type-ui-sm tabular text-ink-muted">
          {projects.length}/{LIMITS.projectCount} projects
        </span>
      </div>

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}
    </div>
  );
}
