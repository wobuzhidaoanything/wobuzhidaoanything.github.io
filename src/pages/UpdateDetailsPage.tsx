import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { GROUP_META, TEAM_MEMBERS } from "@/data/capstone";
import type { Pillar, TeamMember } from "@/data/capstone";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const DEFAULT_UPDATE_WORKER_URL = "https://capstone-update.jhyap.workers.dev";
const UPDATE_WORKER_URL: string = ((import.meta.env
  .VITE_UPDATE_WORKER_URL ?? "") as string) || DEFAULT_UPDATE_WORKER_URL;

const PILLARS: { id: Pillar; label: string }[] = [
  { id: "CSD", label: "CSD · Computer Science & Design" },
  { id: "EPD", label: "EPD · Engineering Product Development" },
  { id: "ESD", label: "ESD · Engineering Systems & Design" },
];

function listToText(list: string[] | undefined): string {
  return (list ?? []).join("\n");
}

function textToList(value: string): string[] {
  return value
    .split(/[\n,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function projectsToText(member: TeamMember): string {
  return (member.projects ?? [])
    .map((p) => `${p.title} | ${p.detail}`)
    .join("\n");
}

function textToProjects(value: string): { title: string; detail: string }[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: title.trim(), detail: rest.join("|").trim() };
    })
    .filter((p) => p.title);
}

export function UpdateDetailsPage() {
  useDocumentTitle(`Update Details | ${GROUP_META.title}`);

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>(
      'meta[name="robots"]',
    );
    const created = !existing;
    let meta = existing;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (created && meta) meta.remove();
    };
  }, []);

  const firstMember = TEAM_MEMBERS[0];
  const [memberId, setMemberId] = useState<string>(firstMember?.id ?? "");
  const member = TEAM_MEMBERS.find((m) => m.id === memberId);

  const [password, setPassword] = useState("");
  const [name, setName] = useState(firstMember?.name ?? "");
  const [fullName, setFullName] = useState(firstMember?.fullName ?? "");
  const [pillar, setPillar] = useState<Pillar>(firstMember?.pillar ?? "CSD");
  const [pillarFull, setPillarFull] = useState(firstMember?.pillarFull ?? "");
  const [minor, setMinor] = useState(firstMember?.minor ?? "");
  const [role, setRole] = useState(firstMember?.role ?? "");
  const [bio, setBio] = useState(firstMember?.bio ?? "");
  const [skillsets, setSkillsets] = useState(listToText(firstMember?.skillsets));
  const [interests, setInterests] = useState(listToText(firstMember?.interests));
  const [tools, setTools] = useState(listToText(firstMember?.tools));
  const [projectsText, setProjectsText] = useState(firstMember ? projectsToText(firstMember) : "");
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  function handleMemberChange(nextId: string) {
    const next = TEAM_MEMBERS.find((m) => m.id === nextId);
    if (!next) return;
    setMemberId(nextId);
    setName(next.name);
    setFullName(next.fullName ?? "");
    setPillar(next.pillar);
    setPillarFull(next.pillarFull);
    setMinor(next.minor ?? "");
    setRole(next.role);
    setBio(next.bio);
    setSkillsets(listToText(next.skillsets));
    setInterests(listToText(next.interests));
    setTools(listToText(next.tools));
    setProjectsText(projectsToText(next));
    setStatus(null);
    setNameTouched(false);
  }

  const passwordInvalid = passwordTouched && password.length === 0;
  const nameInvalid = nameTouched && name.trim().length === 0;
  const workerConfigured = Boolean(UPDATE_WORKER_URL);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordTouched(true);
    setNameTouched(true);
    setStatus(null);
    if (!member) {
      setStatus({ kind: "error", text: "Select a member first." });
      return;
    }
    if (password.length === 0) {
      setStatus({ kind: "error", text: "Enter the group password." });
      return;
    }
    if (name.trim().length === 0) {
      setStatus({ kind: "error", text: "Name is required." });
      return;
    }
    if (!workerConfigured) {
      setStatus({
        kind: "error",
        text: "Worker URL is not configured yet — set VITE_UPDATE_WORKER_URL and rebuild.",
      });
      return;
    }

    const updatedMember = {
      id: member.id,
      index: member.index,
      name: name.trim(),
      fullName: fullName.trim() || undefined,
      pillar,
      pillarFull: pillarFull.trim(),
      minor: minor.trim() || undefined,
      role: role.trim(),
      bio: bio.trim(),
      skillsets: textToList(skillsets),
      interests: textToList(interests),
      tools: textToList(tools).length > 0 ? textToList(tools) : undefined,
      projects: textToProjects(projectsText).length > 0 ? textToProjects(projectsText) : undefined,
    };

    setSubmitting(true);
    try {
      const response = await fetch(UPDATE_WORKER_URL as string, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, memberId: member.id, member: updatedMember }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setStatus({
          kind: "error",
          text: payload.error ?? `Save failed (${response.status}).`,
        });
      } else {
        setStatus({
          kind: "success",
          text: "Saved. The site will redeploy in about a minute.",
        });
      }
    } catch {
      setStatus({ kind: "error", text: "Network error. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const fieldStyles =
    "flex min-w-0 flex-col gap-[0.35rem] text-left";
  const inputStyles =
    "w-full min-h-11 px-3 py-2 rounded-control border border-edge bg-surface type-body text-ink placeholder:text-ink-muted focus-visible:outline-[3px] focus-visible:outline-accent focus-visible:outline-offset-2";
  const labelStyles = "type-ui font-semibold text-ink";

  return (
    <div className="detail-page-shell shell shell-block">
      <article className="detail-profile-card @container/detail-card grid min-w-0 gap-[1.125rem] rounded-card border border-edge bg-surface p-[clamp(1.375rem,5cqi,3.25rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <span className="w-fit font-serif type-item font-[560] tabular text-ink-secondary">
            Team submissions
          </span>
          <span className="inline-flex items-center type-ui-sm font-semibold tracking-[0.04em] text-ink-secondary">
            Private · Not indexed
          </span>
        </header>

        <h1
          id="main-content"
          tabIndex={-1}
          className="m-0 w-fit font-serif type-title-3 font-semibold focus:outline-none"
        >
          Update Details
        </h1>
        <p className="mt-1.5 max-w-[56ch] type-body text-ink-secondary">
          Choose your profile, edit your details, and submit. A valid group password
          publishes the change to the site. This page is hidden from search engines.
        </p>

        {!workerConfigured ? (
          <p role="alert" className="m-0 rounded-control border border-edge bg-surface-muted p-4 type-ui text-ink-secondary">
            The save service is not configured on this build yet.
          </p>
        ) : null}

        <form
          aria-labelledby="update-form-heading"
          onSubmit={handleSubmit}
          method="POST"
          action={UPDATE_WORKER_URL ?? "#"}
          className="grid gap-[clamp(1rem,3cqi,1.5rem)]"
        >
          <h2 id="update-form-heading" className="sr-only">
            Member details form
          </h2>

          <div className={fieldStyles}>
            <label htmlFor="member-select" className={labelStyles}>
              Member <span aria-hidden="true">*</span>
            </label>
            <select
              id="member-select"
              name="member"
              value={memberId}
              onChange={(e) => handleMemberChange(e.target.value)}
              required
              className={inputStyles}
            >
              {TEAM_MEMBERS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.index} · {m.name} ({m.pillar})
                </option>
              ))}
            </select>
          </div>

          <div className={fieldStyles}>
            <label htmlFor="group-password" className={labelStyles}>
              Group password <span aria-hidden="true">*</span>
            </label>
            <input
              id="group-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordTouched(true)}
              required
              aria-invalid={passwordInvalid}
              aria-describedby={passwordInvalid ? "password-error" : undefined}
              className={inputStyles}
            />
            {passwordInvalid ? (
              <span id="password-error" className="type-ui-sm text-accent">
                Enter the group password.
              </span>
            ) : null}
          </div>

          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className={labelStyles}>Pillar</legend>
            <div className="grid gap-2">
              {PILLARS.map((option) => (
                <label key={option.id} className="inline-flex min-h-11 items-center gap-2 type-ui">
                  <input
                    type="radio"
                    name="pillar"
                    value={option.id}
                    checked={pillar === option.id}
                    onChange={() => setPillar(option.id)}
                    required
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={fieldStyles}>
            <label htmlFor="member-name" className={labelStyles}>
              Display name <span aria-hidden="true">*</span>
            </label>
            <input
              id="member-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              required
              aria-invalid={nameInvalid}
              aria-describedby={nameInvalid ? "name-error" : undefined}
              className={inputStyles}
            />
            {nameInvalid ? (
              <span id="name-error" className="type-ui-sm text-accent">
                Name is required.
              </span>
            ) : null}
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-fullname" className={labelStyles}>
              Full legal name
            </label>
            <input
              id="member-fullname"
              name="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className="grid gap-[1rem] min-[48rem]:grid-cols-2" style={{ gap: "1rem" }}>
            <div className={fieldStyles}>
              <label htmlFor="member-pillarfull" className={labelStyles}>
                Pillar full name
              </label>
              <input
                id="member-pillarfull"
                name="pillarFull"
                type="text"
                value={pillarFull}
                onChange={(e) => setPillarFull(e.target.value)}
                className={inputStyles}
              />
            </div>
            <div className={fieldStyles}>
              <label htmlFor="member-minor" className={labelStyles}>
                Minor / second major
              </label>
              <input
                id="member-minor"
                name="minor"
                type="text"
                value={minor}
                onChange={(e) => setMinor(e.target.value)}
                className={inputStyles}
              />
            </div>
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-role" className={labelStyles}>
              Role
            </label>
            <input
              id="member-role"
              name="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              enterKeyHint="next"
              className={inputStyles}
            />
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-bio" className={labelStyles}>
              Bio
            </label>
            <textarea
              id="member-bio"
              name="bio"
              rows={4}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-skills" className={labelStyles}>
              Skillsets — one per line
            </label>
            <textarea
              id="member-skills"
              name="skillsets"
              rows={4}
              value={skillsets}
              onChange={(e) => setSkillsets(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-tools" className={labelStyles}>
              Tools — one per line
            </label>
            <textarea
              id="member-tools"
              name="tools"
              rows={3}
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-interests" className={labelStyles}>
              Interests — one per line
            </label>
            <textarea
              id="member-interests"
              name="interests"
              rows={3}
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div className={fieldStyles}>
            <label htmlFor="member-projects" className={labelStyles}>
              Projects — one per line as “Title | Description”
            </label>
            <textarea
              id="member-projects"
              name="projects"
              rows={4}
              value={projectsText}
              onChange={(e) => setProjectsText(e.target.value)}
              className={inputStyles}
            />
          </div>

          <div aria-live="polite">
            {status ? (
              <p role={status.kind === "error" ? "alert" : "status"} className="m-0 type-ui text-ink-secondary">
                {status.text}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={submitting || !workerConfigured}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-ink bg-ink px-5 py-2.5 type-ui font-semibold text-surface transition-[background-color,scale] hover:opacity-90 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
          >
            {submitting ? "Saving…" : "Save changes"}
          </button>
        </form>
      </article>
    </div>
  );
}
