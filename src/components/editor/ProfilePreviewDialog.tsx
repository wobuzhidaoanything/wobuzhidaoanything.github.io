import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "cn";
import type { TeamMember } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { MemberLinksRow } from "@/components/MemberLinksRow";
import { ProjectDetailContent } from "@/components/ProjectDetailContent";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { useFileObjectUrl } from "@/hooks/useFileObjectUrl";
import { attachBackdropLightDismiss, closeDialogSmoothly } from "@/lib/dialogMotion";
import { PILLAR_FULL, parseList, type EditorForm } from "@/lib/editorForm";

interface ProfilePreviewDialogProps {
  open: boolean;
  onClose: () => void;
  form: EditorForm;
  member: TeamMember;
  stagedHeroFile: File | null;
  stagedHeroRemove: boolean;
  stagedSecondaryFile: File | null;
  stagedSecondaryRemove: boolean;
}

export function ProfilePreviewDialog({
  open,
  onClose,
  form,
  member,
  stagedHeroFile,
  stagedHeroRemove,
  stagedSecondaryFile,
  stagedSecondaryRemove,
}: ProfilePreviewDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [mode, setMode] = useState<"chapter" | "profile">("chapter");
  const heroBlobUrl = useFileObjectUrl(open ? stagedHeroFile : null);
  const secondaryBlobUrl = useFileObjectUrl(open ? stagedSecondaryFile : null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.removeAttribute("data-closing");
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeDialogSmoothly(dialog);
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    return attachBackdropLightDismiss(dialog, onClose);
  }, [onClose]);

  const skillsets = parseList(form.skillsetsText);
  const tools = parseList(form.toolsText);
  const interests = parseList(form.interestsText);
  const projects = form.projects
    .filter((p) => p.title.trim())
    .map((p) => ({
      title: p.title.trim(),
      detail: p.detail.trim(),
      tag: p.tag.trim() || undefined,
      url: p.url.trim() || undefined,
      featured: p.featured,
    }));

  const resolvedHero = stagedHeroRemove
    ? undefined
    : (heroBlobUrl ?? member.artifacts?.heroImage);
  const resolvedSecondary = stagedSecondaryRemove
    ? undefined
    : (secondaryBlobUrl ?? member.artifacts?.secondaryImage);

  const previewMember: TeamMember = {
    ...member,
    name: form.name.trim() || "Your name",
    pillar: form.pillar,
    pillarFull: PILLAR_FULL[form.pillar],
    minor: form.minor.trim() || undefined,
    role: form.role.trim(),
    bio: form.bio.trim(),
    skillsets,
    interests,
    tools: tools.length ? tools : undefined,
    projects: projects.length ? projects : undefined,
    links: {
      github: form.links.github.trim() || undefined,
      linkedin: form.links.linkedin.trim() || undefined,
      portfolio: form.links.portfolio.trim() || undefined,
      email: form.links.email.trim() || undefined,
    },
    artifacts: {
      ...member.artifacts,
      heroImage: resolvedHero,
      secondaryImage: resolvedSecondary,
      heroFocus: form.heroFocus,
      caption: form.caption.trim() || undefined,
      alt: form.alt.trim() || undefined,
    },
  };

  return (
    <dialog
      ref={dialogRef}
      className="preview-dialog"
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, unknown>)}
      onClose={() => {
        if (dialogRef.current) dialogRef.current.returnValue = "";
        if (open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="grid gap-0">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface px-6 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id={titleId} className="m-0 font-serif type-heading-xs font-semibold text-ink">
              Live Preview
            </h2>
            <div
              className="inline-flex rounded-control border border-edge bg-surface-muted p-0.5"
              role="group"
              aria-label="Preview view mode"
            >
              <button
                type="button"
                aria-pressed={mode === "chapter"}
                onClick={() => setMode("chapter")}
                className={cn(
                  "ui-press min-h-10 cursor-pointer rounded-[0.45rem] border border-transparent px-3 py-1 type-ui-sm font-semibold pointer-coarse:min-h-11",
                  mode === "chapter"
                    ? "border-edge bg-surface text-ink shadow-chip"
                    : "text-ink-secondary hover:text-ink",
                )}
              >
                Home chapter
              </button>
              <button
                type="button"
                aria-pressed={mode === "profile"}
                onClick={() => setMode("profile")}
                className={cn(
                  "ui-press min-h-10 cursor-pointer rounded-[0.45rem] border border-transparent px-3 py-1 type-ui-sm font-semibold pointer-coarse:min-h-11",
                  mode === "profile"
                    ? "border-edge bg-surface text-ink shadow-chip"
                    : "text-ink-secondary hover:text-ink",
                )}
              >
                Full profile
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="ui-press inline-flex size-10 cursor-pointer items-center justify-center rounded-control border border-edge bg-surface text-ink hover:bg-surface-muted/75 pointer-coarse:size-11"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="grid gap-6 bg-page p-6">
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <PillarBadge pillar={previewMember.pillar}>
                {previewMember.pillar} · {previewMember.pillarFull}
              </PillarBadge>
              {form.hidden ? (
                <span className="rounded-chip border border-warning/40 bg-warning-surface px-2 py-0.5 type-micro font-semibold text-warning">
                  Profile hidden
                </span>
              ) : null}
            </div>

            <h3 className="m-0 font-serif type-title-3 font-semibold text-ink">
              {previewMember.name}
            </h3>

            {previewMember.minor ? (
              <p className="-mt-2 m-0 font-mono type-ui-sm font-medium tracking-[0.05em] uppercase text-ink-secondary">
                Minor in {previewMember.minor}
              </p>
            ) : null}

            {previewMember.role ? (
              <p className="m-0 font-serif type-role italic font-medium text-accent">
                {previewMember.role}
              </p>
            ) : null}
            {previewMember.bio ? (
              <p className="m-0 max-w-[54ch] type-body text-ink-secondary">
                {previewMember.bio}
              </p>
            ) : null}
            <MemberLinksRow links={previewMember.links} />
          </div>

          {resolvedHero ? (
            <ArtifactFrame
              member={previewMember}
              src={resolvedHero}
              photoMaxHeightClassName="max-h-[min(52dvb,26rem)]"
            />
          ) : null}

          {mode === "profile" && resolvedSecondary ? (
            <ArtifactFrame
              member={previewMember}
              src={resolvedSecondary}
              caption=""
              photoMaxHeightClassName="max-h-[min(52dvb,26rem)]"
            />
          ) : null}

          {skillsets.length > 0 ? (
            <div className="grid gap-2 border-t border-rule pt-4">
              <span className="type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Skillsets
              </span>
              <p className="m-0 type-body-sm text-ink">{skillsets.join(" · ")}</p>
            </div>
          ) : null}

          {tools.length > 0 ? (
            <div className="grid gap-2 border-t border-rule pt-4">
              <span className="type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Tools &amp; Software
              </span>
              <p className="m-0 font-mono type-ui-sm text-ink-secondary">{tools.join(" · ")}</p>
            </div>
          ) : null}

          {projects.length > 0 ? (
            <div className="grid gap-2 border-t border-rule pt-4">
              <span className="type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Projects ({projects.length})
              </span>
              <ul className="m-0 grid list-none gap-2 p-0">
                {projects.map((p) => (
                  <li key={p.title} className="type-body-sm text-ink">
                    <span className="font-semibold">{p.title}</span>
                    {p.tag ? (
                      <span className="ms-2 font-mono type-micro text-ink-muted">[{p.tag}]</span>
                    ) : null}
                    {p.detail ? (
                      <ProjectDetailContent detail={p.detail} className="mt-1.5" />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {interests.length > 0 ? (
            <div className="grid gap-1 border-t border-rule pt-4">
              <span className="type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Interests
              </span>
              <p className="m-0 type-body-sm text-ink-secondary">{interests.join(" · ")}</p>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
