import type { TeamMember } from "@/data/capstone";
import { ArtifactFrame } from "@/components/ArtifactFrame";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { PILLAR_FULL, parseList, type EditorForm } from "@/lib/editorForm";

interface ProfilePreviewProps {
  form: EditorForm;
  member: TeamMember;
  pendingHeroUrl: string | null;
}

/** Mirrors the public profile card with the in-progress edits. */
export function ProfilePreview({ form, member, pendingHeroUrl }: ProfilePreviewProps) {
  const skillsets = parseList(form.skillsetsText);
  const tools = parseList(form.toolsText);
  const projects = form.projects.filter((p) => p.title.trim());
  const pillarFull = form.pillarFull.trim() || PILLAR_FULL[form.pillar];
  const previewMember: TeamMember = {
    ...member,
    name: form.name.trim() || "Your name",
    pillar: form.pillar,
    pillarFull,
    minor: form.minor.trim() || undefined,
    role: form.role.trim(),
    bio: form.bio.trim(),
    skillsets,
    interests: parseList(form.interestsText),
    tools: tools.length ? tools : undefined,
    projects: projects.length ? projects : undefined,
    artifacts: {
      ...member.artifacts,
      heroImage: pendingHeroUrl ?? member.artifacts?.heroImage,
      caption: form.caption.trim() || undefined,
      alt: form.alt.trim() || undefined,
    },
  };

  return (
    <div className="grid content-start gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="m-0 type-ui font-semibold tracking-[0.04em] uppercase text-ink-secondary">
          Live preview
        </h2>
        <span className="type-micro text-ink-muted">Updates as you type</span>
      </div>

      <article className="detail-profile-card @container/detail-card grid min-w-0 gap-3 rounded-card border border-edge bg-surface p-[clamp(1.125rem,4cqi,1.75rem)]">
        <PillarBadge pillar={previewMember.pillar}>
          {previewMember.pillar} · {pillarFull}
        </PillarBadge>
        <h3 className="m-0 font-serif type-title-4 font-semibold text-wrap-balance">
          {previewMember.name}
        </h3>
        {previewMember.minor ? (
          <p className="m-0 font-mono type-ui-sm font-medium tracking-[0.06em] uppercase text-ink-secondary">
            Minor in {previewMember.minor}
          </p>
        ) : null}
        <p className="m-0 font-serif type-role italic font-medium text-accent">
          {previewMember.role || "Add a role…"}
        </p>
        <p className="m-0 type-body-sm text-ink-secondary">
          {previewMember.bio || "Add a short bio so partners know what you focus on."}
        </p>
        <ArtifactFrame
          member={previewMember}
          src={previewMember.artifacts?.heroImage}
          aspectRatio="16/9"
          plateLabel={`${previewMember.pillar} · ${pillarFull}`}
        />
        {skillsets.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {skillsets.slice(0, 8).map((skill) => (
              <li
                key={skill}
                className="rounded-chip border border-edge bg-surface-muted px-2.5 py-1 type-ui-sm text-ink"
              >
                {skill}
              </li>
            ))}
          </ul>
        ) : null}
        {projects.length > 0 ? (
          <p className="m-0 type-ui-sm text-ink-secondary">
            <span className="font-semibold text-ink">Projects: </span>
            {projects.map((p) => p.title.trim()).join(" · ")}
          </p>
        ) : null}
      </article>

      <p className="m-0 type-ui-sm text-ink-muted">
        This mirrors your public profile card. Text goes live when you save; photos go live the
        moment they upload.
      </p>
    </div>
  );
}