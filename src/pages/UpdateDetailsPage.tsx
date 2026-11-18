import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { GROUP_META } from "@/data/capstone";
import { useLiveMembers } from "@/hooks/useLiveMembers";
import { resolveImageSrc, UPDATE_WORKER_URL } from "@/lib/media";
import type { Pillar, TeamMember } from "@/data/capstone";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

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

  const { members: TEAM_MEMBERS } = useLiveMembers();
  const firstMember = TEAM_MEMBERS[0];
  const [memberId, setMemberId] = useState<string>(firstMember?.id ?? "");
  const member = TEAM_MEMBERS.find((m) => m.id === memberId);

  const [password, setPassword] = useState("");
  const [name, setName] = useState(firstMember?.name ?? "");
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
  const [heroFile, setHeroFile] = useState<File | null>(null);
  const [secondaryFile, setSecondaryFile] = useState<File | null>(null);
  const [uploadingSlot, setUploadingSlot] = useState<"hero" | "secondary" | null>(null);
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);
  const [gateChecking, setGateChecking] = useState(false);
  const gatePasswordRef = useRef<HTMLInputElement | null>(null);
  const memberSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    if (unlocked) {
      memberSelectRef.current?.focus();
    } else {
      gatePasswordRef.current?.focus();
    }
  }, [unlocked]);

  async function handleUnlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordTouched(true);
    if (password.length === 0) {
      setGateError("Enter the group password.");
      return;
    }
    if (!workerConfigured) {
      setGateError("Save service is not configured yet.");
      return;
    }
    setGateChecking(true);
    setGateError(null);
    try {
      const response = await fetch(UPDATE_WORKER_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, verifyOnly: true }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (response.ok && payload.ok) {
        setUnlocked(true);
      } else {
        setGateError(payload.error ?? "Incorrect password. Enter it again.");
      }
    } catch {
      setGateError("Network error. Check your connection and try again.");
    } finally {
      setGateChecking(false);
    }
  }

  function handleLock() {
    setPassword("");
    setPasswordTouched(false);
    setGateError(null);
    setStatus({ kind: "success", text: "Editor locked." });
    setUnlocked(false);
  }

  function handleMemberChange(nextId: string) {
    const next = TEAM_MEMBERS.find((m) => m.id === nextId);
    if (!next) return;
    setMemberId(nextId);
    setName(next.name);
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
    setPhotoStatus(null);
    setHeroFile(null);
    setSecondaryFile(null);
    setNameTouched(false);
  }

  const passwordInvalid = passwordTouched && password.length === 0;
  const nameInvalid = nameTouched && name.trim().length === 0;
  const workerConfigured = Boolean(UPDATE_WORKER_URL);

  async function compressPhoto(file: File): Promise<File> {
    try {
      const bitmap = await createImageBitmap(file);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((done) =>
        canvas.toBlob(done, "image/jpeg", 0.85),
      );
      if (!blob) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
    } catch {
      return file;
    }
  }

  async function handlePhotoUpload(slot: "hero" | "secondary") {
    const file = slot === "hero" ? heroFile : secondaryFile;
    setPhotoStatus(null);
    if (!member) {
      setPhotoStatus("Select a member first.");
      return;
    }
    if (!file) {
      setPhotoStatus("Choose a photo first.");
      return;
    }
    if (password.length === 0) {
      setPhotoStatus("Enter the group password.");
      return;
    }
    setUploadingSlot(slot);
    try {
      const compressed = await compressPhoto(file);
      if (compressed.size > 5 * 1024 * 1024) {
        setPhotoStatus("Image is too large after compression (max 5 MB).");
        return;
      }
      const formData = new FormData();
      formData.set("password", password);
      formData.set("memberId", member.id);
      formData.set("slot", slot);
      formData.set("file", compressed);
      const response = await fetch(`${UPDATE_WORKER_URL.replace(/\/$/, "")}/photos`, {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        if (response.status === 401) {
          setPassword("");
          setPasswordTouched(false);
          setGateError("Incorrect password. Enter it again.");
          setUnlocked(false);
          setPhotoStatus("Incorrect password. Upload cancelled.");
        } else {
          setPhotoStatus(payload.error ?? `Upload failed (${response.status}).`);
        }
      } else {
        setPhotoStatus(slot === "hero" ? "Hero photo saved. It is live now." : "Secondary photo saved. It is live now.");
        if (slot === "hero") setHeroFile(null);
        else setSecondaryFile(null);
      }
    } catch {
      setPhotoStatus("Network error. Check your connection and try again.");
    } finally {
      setUploadingSlot(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameTouched(true);
    setStatus(null);
    if (!member) {
      setStatus({ kind: "error", text: "Select a member first." });
      return;
    }
    if (password.length === 0) {
      setUnlocked(false);
      setGateError("Enter the group password.");
      return;
    }
    if (name.trim().length === 0) {
      setStatus({ kind: "error", text: "Name is required." });
      return;
    }
    if (!workerConfigured) {
      setStatus({
        kind: "error",
        text: "Worker URL is not configured yet: set VITE_UPDATE_WORKER_URL and rebuild.",
      });
      return;
    }

    const updatedMember = {
      id: member.id,
      index: member.index,
      name: name.trim(),
      pillar,
      pillarFull: pillarFull.trim(),
      minor: minor.trim() || undefined,
      role: role.trim(),
      bio: bio.trim(),
      skillsets: textToList(skillsets),
      interests: textToList(interests),
      tools: textToList(tools).length > 0 ? textToList(tools) : undefined,
      projects: textToProjects(projectsText).length > 0 ? textToProjects(projectsText) : undefined,
      artifacts: member.artifacts,
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
        if (response.status === 401) {
          setPassword("");
          setPasswordTouched(false);
          setGateError("Incorrect password. Enter it again.");
          setUnlocked(false);
        } else {
          setStatus({
            kind: "error",
            text: payload.error ?? `Save failed (${response.status}).`,
          });
        }
      } else {
        setStatus({
          kind: "success",
          text: "Saved. The site shows the update within a minute.",
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

        {!unlocked ? (
          <form
            aria-labelledby="unlock-form-heading"
            onSubmit={handleUnlock}
            method="POST"
            action={UPDATE_WORKER_URL ?? "#"}
            className="grid gap-[clamp(1rem,3cqi,1.5rem)]"
          >
            <h2 id="unlock-form-heading" className="sr-only">
              Unlock editor
            </h2>
            <div className={fieldStyles}>
              <label htmlFor="group-password" className={labelStyles}>
                Group password <span aria-hidden="true">*</span>
              </label>
              <input
                id="group-password"
                ref={gatePasswordRef}
                name="password"
                type="password"
                autoComplete="current-password"
                enterKeyHint="go"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => setPasswordTouched(true)}
                required
                disabled={gateChecking}
                aria-invalid={passwordInvalid}
                aria-describedby={passwordInvalid || gateError ? "password-error" : undefined}
                className={inputStyles}
              />
              {(passwordInvalid || gateError) && (
                <span id="password-error" className="type-ui-sm text-accent">
                  {gateError ?? "Enter the group password."}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={gateChecking}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-ink bg-ink px-5 py-2.5 type-ui font-semibold text-surface transition-[background-color,scale] hover:opacity-90 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {gateChecking ? "Checking…" : "Unlock editor"}
            </button>
          </form>
        ) : (
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
              ref={memberSelectRef}
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

          <div className="inline-flex min-h-11 w-fit items-center gap-3 type-ui text-ink-secondary">
            <span>Unlocked for this session.</span>
            <button
              type="button"
              onClick={handleLock}
              className="inline-flex min-h-10 items-center gap-1.5 px-2 type-ui font-semibold text-accent no-underline hover:underline hover:underline-offset-4 pointer-coarse:min-h-11"
            >
              Lock editor
            </button>
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
              Skillsets: one per line
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
              Tools: one per line
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
              Interests: one per line
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
              Projects: one per line as “Title | Description”
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

          <fieldset className="m-0 grid gap-3 border-0 p-0">
            <legend className={labelStyles}>Photos</legend>
            <p className="m-0 type-ui-sm text-ink-secondary">
              Stored in a private KV store and served only through the Worker. Photos go live right away.
            </p>
            <div className="grid gap-3 min-[48rem]:grid-cols-2">
              <div className={fieldStyles}>
                <label htmlFor="hero-photo" className={labelStyles}>
                  Hero photo
                </label>
                <input
                  id="hero-photo"
                  name="heroPhoto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setHeroFile(e.target.files?.[0] ?? null)}
                  className={inputStyles}
                />
                {member?.artifacts?.heroImage ? (
                  <img
                    src={resolveImageSrc(member.artifacts.heroImage)}
                    alt={`Current hero photo for ${member.name}`}
                    className="block w-full rounded-control border border-edge object-cover"
                    loading="lazy"
                  />
                ) : null}
                {heroFile ? (
                  <span className="type-ui-sm text-ink-secondary">{heroFile.name}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handlePhotoUpload("hero")}
                  disabled={uploadingSlot !== null}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-ink bg-surface px-5 py-2.5 type-ui font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
                >
                  {uploadingSlot === "hero" ? "Uploading…" : "Upload hero photo"}
                </button>
              </div>
              <div className={fieldStyles}>
                <label htmlFor="secondary-photo" className={labelStyles}>
                  Secondary photo
                </label>
                <input
                  id="secondary-photo"
                  name="secondaryPhoto"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setSecondaryFile(e.target.files?.[0] ?? null)}
                  className={inputStyles}
                />
                {member?.artifacts?.secondaryImage ? (
                  <img
                    src={resolveImageSrc(member.artifacts.secondaryImage)}
                    alt={`Current secondary photo for ${member.name}`}
                    className="block w-full rounded-control border border-edge object-cover"
                    loading="lazy"
                  />
                ) : null}
                {secondaryFile ? (
                  <span className="type-ui-sm text-ink-secondary">{secondaryFile.name}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handlePhotoUpload("secondary")}
                  disabled={uploadingSlot !== null}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-control border border-ink bg-surface px-5 py-2.5 type-ui font-semibold text-ink transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11"
                >
                  {uploadingSlot === "secondary" ? "Uploading…" : "Upload secondary photo"}
                </button>
              </div>
            </div>
            {photoStatus ? (
              <p aria-live="polite" className="m-0 type-ui-sm text-ink-secondary">
                {photoStatus}
              </p>
            ) : null}
          </fieldset>

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
        )}
      </article>
    </div>
  );
}
