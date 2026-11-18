import { useEffect, useRef, useState, type FormEvent } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useBlocker } from "react-router";
import { Clock, Eye, LoaderCircle, Lock, RefreshCw, RotateCcw, Save } from "lucide-react";
import { cn } from "cn";
import { GROUP_META, type Pillar, type TeamMember } from "@/data/capstone";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLiveMembers } from "@/hooks/useLiveMembers";
import { saveMember } from "@/lib/editorApi";
import { clearDraft, readDraft, writeDraft } from "@/lib/editorDrafts";
import {
  FIELD_ELEMENT_IDS,
  LIMITS,
  PILLAR_FULL,
  buildPayload,
  formFromMember,
  formsEqual,
  parseList,
  serializeList,
  validateForm,
  type EditorForm,
  type FormField,
} from "@/lib/editorForm";
import { lockEditor, useEditorSession } from "@/lib/editorSession";
import {
  applyLocalMember,
  getMembersState,
  refreshMembers,
  subscribeMembers,
} from "@/lib/membersStore";
import { TransitionLink } from "@/components/TransitionLink";
import { ConfirmDialog } from "@/components/editor/ConfirmDialog";
import { EditorGate } from "@/components/editor/EditorGate";
import { ItemsEditor } from "@/components/editor/ItemsEditor";
import { PhotoSlot } from "@/components/editor/PhotoSlot";
import { ProfilePreview } from "@/components/editor/ProfilePreview";
import { ProjectsEditor } from "@/components/editor/ProjectsEditor";
import { StatusMessage, type StatusTone } from "@/components/editor/StatusMessage";
import { primaryButtonStyles, quietButtonStyles } from "@/components/editor/buttons";
import { FieldShell, TextAreaField, TextField, inputStyles } from "@/components/editor/fields";

const EASE = [0.22, 1, 0.36, 1] as const;

const PILLARS: { id: Pillar; label: string }[] = [
  { id: "CSD", label: "Computer Science & Design" },
  { id: "EPD", label: "Engineering Product Development" },
  { id: "ESD", label: "Engineering Systems & Design" },
];

const pillarToneClass: Record<Pillar, string> = {
  CSD: "[--pillar-tone:var(--pillar-csd)]",
  EPD: "[--pillar-tone:var(--pillar-epd)]",
  ESD: "[--pillar-tone:var(--pillar-esd)]",
};

const containerStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const sectionFade: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

interface PageStatus {
  tone: StatusTone;
  text: string;
  profileLink?: boolean;
  retry?: boolean;
}

interface FormSeed {
  form: EditorForm;
  baseline: EditorForm;
  baseVersion: number | null;
  seededFor: string;
  draftNotice: boolean;
}

function makeSeed(target: TeamMember): FormSeed {
  const base = formFromMember(target);
  const draft = readDraft(target.id);
  if (draft && !formsEqual(draft.form, base)) {
    return {
      form: draft.form,
      baseline: base,
      baseVersion: draft.baseVersion ?? target.version ?? null,
      seededFor: target.id,
      draftNotice: true,
    };
  }
  return {
    form: base,
    baseline: base,
    baseVersion: target.version ?? null,
    seededFor: target.id,
    draftNotice: false,
  };
}

function formatRelative(iso: string | undefined): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString();
}

function SectionHeading({ title, id, description }: { title: string; id: string; description?: string }) {
  return (
    <div className="grid gap-1 border-t border-rule pt-6">
      <h2 id={id} className="m-0 type-ui font-semibold tracking-[0.02em] text-ink">
        {title}
      </h2>
      {description ? <p className="m-0 max-w-[62ch] type-ui-sm text-ink-secondary">{description}</p> : null}
    </div>
  );
}

export function UpdateDetailsPage() {
  useDocumentTitle(`Update Details | ${GROUP_META.title}`);

  useEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !existing;
    const previous = existing?.content ?? null;
    const meta = existing ?? document.createElement("meta");
    if (created) {
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    meta.content = "noindex, nofollow";
    return () => {
      if (created) meta.remove();
      else if (previous !== null) meta.content = previous;
    };
  }, []);

  const session = useEditorSession();
  const live = useLiveMembers();
  const shouldReduceMotion = useReducedMotion();

  const [memberId, setMemberId] = useState<string>(live.members[0]?.id ?? "");
  const member = live.members.find((m) => m.id === memberId);

  const [initialSeed] = useState(() => (session.unlocked && member ? makeSeed(member) : null));
  const [form, setForm] = useState<EditorForm | null>(initialSeed?.form ?? null);
  const [baseline, setBaseline] = useState<EditorForm | null>(initialSeed?.baseline ?? null);
  const [baseVersion, setBaseVersion] = useState<number | null>(initialSeed?.baseVersion ?? null);
  const [seededFor, setSeededFor] = useState<string | null>(initialSeed?.seededFor ?? null);
  const [draftNotice, setDraftNotice] = useState(initialSeed?.draftNotice ?? false);

  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<"hero" | "secondary" | null>(null);
  const [pendingHeroUrl, setPendingHeroUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [lockConfirm, setLockConfirm] = useState(false);
  const [conflict, setConflict] = useState<TeamMember | null>(null);
  const [fallbackConfirm, setFallbackConfirm] = useState(false);
  const [gateNotice, setGateNotice] = useState<{ tone: StatusTone; text: string } | null>(null);

  const memberSelectRef = useRef<HTMLSelectElement | null>(null);

  const dirty = form !== null && baseline !== null && !formsEqual(form, baseline);
  const blocker = useBlocker(session.unlocked && dirty);
  const latest = useRef({ form, baseline, baseVersion, dirty, memberId });

  const allErrors = form ? validateForm(form) : {};
  const shownError = (field: FormField): string | undefined =>
    submitAttempted || touched[field] ? allErrors[field] : undefined;

  useEffect(() => {
    latest.current = { form, baseline, baseVersion, dirty, memberId };
  });

  useEffect(() => {
    if (session.unlocked) memberSelectRef.current?.focus();
  }, [session.unlocked]);

  function seedFrom(target: TeamMember) {
    const seed = makeSeed(target);
    setForm(seed.form);
    setBaseline(seed.baseline);
    setBaseVersion(seed.baseVersion);
    setSeededFor(seed.seededFor);
    setDraftNotice(seed.draftNotice);
    setSubmitAttempted(false);
    setTouched({});
  }

  function reseedFrom(saved: TeamMember) {
    const next = formFromMember(saved);
    setForm(next);
    setBaseline(next);
    setBaseVersion(saved.version ?? null);
    setSeededFor(saved.id);
    clearDraft(saved.id);
    setDraftNotice(false);
    setSubmitAttempted(false);
    setTouched({});
  }

  function handleUnlocked() {
    const target = live.members.find((m) => m.id === memberId);
    if (!target) return;
    // Re-unlocking after a lock or a 401: keep unsaved edits in memory.
    if (form && baseline && seededFor === memberId && !formsEqual(form, baseline)) return;
    seedFrom(target);
    setStatus(null);
  }

  // Live data arriving after a fallback seed: refresh untouched forms so a
  // save can never publish stale bundled values over newer live ones.
  useEffect(() => {
    if (!session.unlocked) return;
    return subscribeMembers(() => {
      const snapshot = getMembersState();
      if (snapshot.loading || snapshot.usingFallback) return;
      const current = latest.current;
      if (!current.form || !current.baseline || current.dirty) return;
      const target = snapshot.members.find((m) => m.id === current.memberId);
      if (!target || (target.version ?? null) === current.baseVersion) return;
      reseedFrom(target);
    });
  }, [session.unlocked]);

  useEffect(() => {
    if (!session.unlocked || !memberId || !form || !baseline) return;
    if (dirty) {
      const timer = setTimeout(
        () => writeDraft(memberId, { form, baseVersion, savedAt: Date.now() }),
        400,
      );
      return () => clearTimeout(timer);
    }
    clearDraft(memberId);
  }, [form, baseline, dirty, memberId, session.unlocked, baseVersion]);

  useEffect(() => {
    if (!dirty || !session.unlocked) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, session.unlocked]);

  function patchForm(patch: Partial<EditorForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setStatus(null);
  }

  function markTouched(field: FormField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function handlePillarChange(pillar: Pillar) {
    patchForm({ pillar, pillarFull: PILLAR_FULL[pillar] });
  }

  function doSwitch(nextId: string) {
    const next = live.members.find((m) => m.id === nextId);
    setMemberId(nextId);
    if (next) {
      seedFrom(next);
    } else {
      setForm(null);
      setBaseline(null);
      setSeededFor(null);
      setDraftNotice(false);
    }
    setStatus(null);
    setPendingSwitch(null);
    setPendingHeroUrl(null);
  }

  function requestMemberChange(nextId: string) {
    if (nextId === memberId) return;
    if (dirty) setPendingSwitch(nextId);
    else doSwitch(nextId);
  }

  function handleUnauthorized() {
    lockEditor();
    setGateNotice({
      tone: "danger",
      text: "The password was rejected — it may have changed. Unlock again; your edits are kept.",
    });
  }

  function doLock() {
    setLockConfirm(false);
    lockEditor();
    setGateNotice({
      tone: "info",
      text: dirty
        ? "Editor locked. Your unsaved draft stays on this device."
        : "Editor locked.",
    });
  }

  function requestLock() {
    if (dirty) setLockConfirm(true);
    else doLock();
  }

  async function handleSave(opts?: {
    afterSave?: () => void;
    overwriteVersion?: number;
    skipFallbackConfirm?: boolean;
  }) {
    if (!form || !member || saving) return;
    setSubmitAttempted(true);
    const errors = validateForm(form);
    const firstError = (Object.keys(errors) as FormField[])[0];
    if (firstError) {
      setStatus({ tone: "danger", text: "Fix the highlighted fields, then save again." });
      const element = document.getElementById(FIELD_ELEMENT_IDS[firstError]);
      element?.focus();
      element?.scrollIntoView({ block: "center" });
      return;
    }
    if (live.usingFallback && !opts?.skipFallbackConfirm) {
      setFallbackConfirm(true);
      return;
    }
    setSaving(true);
    setStatus(null);
    const payload = buildPayload(form, member);
    const result = await saveMember(
      session.password,
      member.id,
      payload,
      opts?.overwriteVersion ?? baseVersion ?? undefined,
    );
    setSaving(false);
    if (result.ok) {
      const saved = result.data.member;
      if (saved) {
        applyLocalMember(saved);
        reseedFrom(saved);
      } else {
        await refreshMembers(true);
        const fresh = getMembersState().members.find((m) => m.id === member.id);
        if (fresh) reseedFrom(fresh);
      }
      setStatus({ tone: "success", text: "Saved. Your profile is live.", profileLink: true });
      void refreshMembers(true);
      opts?.afterSave?.();
    } else if (result.status === 401) {
      handleUnauthorized();
    } else if (result.status === 409 && result.current) {
      setConflict(result.current);
    } else {
      setStatus({
        tone: "danger",
        text: result.error,
        retry: result.status === null || result.status >= 500,
      });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refreshMembers(true);
    setRefreshing(false);
  }

  function handlePhotoSaved(saved: TeamMember | undefined) {
    if (saved) {
      applyLocalMember(saved);
      setBaseVersion(saved.version ?? null);
    } else {
      void refreshMembers(true);
    }
  }

  function discardDraft() {
    if (member) reseedFrom(member);
    setStatus({ tone: "info", text: "Draft discarded. Showing the last saved version." });
  }

  function revertToSaved() {
    if (member) reseedFrom(member);
    setStatus({ tone: "info", text: "Reverted to the last saved version." });
  }

  const labelStyles = "type-ui font-semibold text-ink";

  return (
    <div className="detail-page-shell shell shell-block">
      <article className="detail-profile-card @container/detail-card grid min-w-0 gap-[1.125rem] rounded-card border border-edge bg-surface p-[clamp(1.375rem,5cqi,3.25rem)]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <span className="w-fit font-serif type-item font-[560] tabular text-ink-secondary">
            Team settings
          </span>
          <span className="inline-flex items-center gap-1.5 type-ui-sm font-semibold tracking-[0.04em] text-ink-secondary">
            <Lock className="size-3.5" aria-hidden="true" />
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
          Choose a member, then manage what appears on their profile. Changes publish to the live
          site when you save. This page is hidden from search engines.
        </p>

        {!session.unlocked ? (
          <EditorGate notice={gateNotice} onUnlocked={handleUnlocked} />
        ) : !member || !form ? (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading profile">
            <div className="h-11 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
            <div className="h-24 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
            <div className="h-11 w-1/2 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
          </div>
        ) : (
          <motion.div
            variants={containerStagger}
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
            className="grid min-w-0 gap-[clamp(1.5rem,4cqi,2.5rem)] min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(19rem,23rem)] min-[64rem]:items-start"
          >
            <form
              id="update-form"
              noValidate
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void handleSave();
              }}
              aria-labelledby="update-form-heading"
              className="grid min-w-0 gap-[clamp(1.5rem,4cqi,2.25rem)]"
            >
              <h2 id="update-form-heading" className="sr-only">
                Member details form
              </h2>

              {live.usingFallback && !live.loading ? (
                <StatusMessage tone="warning">
                  Live data is unreachable — you're editing the bundled copy.{" "}
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    className="font-semibold underline underline-offset-2"
                  >
                    Retry
                  </button>
                </StatusMessage>
              ) : null}

              {draftNotice ? (
                <StatusMessage tone="info">
                  Restored an unsaved draft from this device.{" "}
                  <button
                    type="button"
                    onClick={discardDraft}
                    className="font-semibold underline underline-offset-2"
                  >
                    Discard draft
                  </button>
                </StatusMessage>
              ) : null}

              <motion.div variants={sectionFade} className="grid gap-3">
                <FieldShell
                  id="member-select"
                  label="Member"
                  required
                  hint="Each member keeps its own unsaved draft on this device."
                >
                  <select
                    ref={memberSelectRef}
                    id="member-select"
                    name="member"
                    value={memberId}
                    onChange={(e) => requestMemberChange(e.target.value)}
                    required
                    className={inputStyles}
                  >
                    {live.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.index} · {m.name} ({m.pillar})
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex min-h-10 items-center gap-1.5 type-ui-sm text-ink-muted">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {member.updatedAt ? `Last saved ${formatRelative(member.updatedAt)}` : "Not saved yet"}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleRefresh()}
                      className="inline-flex min-h-10 items-center gap-1.5 px-2 type-ui-sm font-semibold text-accent transition-colors duration-150 hover:underline hover:underline-offset-4 pointer-coarse:min-h-11"
                    >
                      <RefreshCw
                        className={cn("size-3.5", refreshing && "animate-spin motion-reduce:animate-none")}
                        aria-hidden="true"
                      />
                      Refresh from site
                    </button>
                    <button
                      type="button"
                      onClick={requestLock}
                      className="inline-flex min-h-10 items-center gap-1.5 px-2 type-ui-sm font-semibold text-accent transition-colors duration-150 hover:underline hover:underline-offset-4 pointer-coarse:min-h-11"
                    >
                      <Lock className="size-3.5" aria-hidden="true" />
                      Lock editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewOpen((open) => !open)}
                      aria-expanded={previewOpen}
                      className="inline-flex min-h-10 items-center gap-1.5 px-2 type-ui-sm font-semibold text-accent transition-colors duration-150 hover:underline hover:underline-offset-4 min-[64rem]:hidden pointer-coarse:min-h-11"
                    >
                      <Eye className="size-3.5" aria-hidden="true" />
                      {previewOpen ? "Hide preview" : "Preview profile"}
                    </button>
                  </div>
                </FieldShell>
              </motion.div>

              {previewOpen ? (
                <div className="min-[64rem]:hidden">
                  <ProfilePreview form={form} member={member} pendingHeroUrl={pendingHeroUrl} />
                </div>
              ) : null}

              <motion.section variants={sectionFade} className="grid gap-5" aria-labelledby="section-identity">
                <SectionHeading
                  title="Identity"
                  id="section-identity"
                  description="How your name and pillar appear across the roster and your profile."
                />
                <fieldset className="m-0 grid gap-2 border-0 p-0">
                  <legend className={cn(labelStyles, "mb-1")}>Pillar</legend>
                  <div className="grid gap-2 min-[30rem]:grid-cols-3">
                    {PILLARS.map((option) => (
                      <label
                        key={option.id}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-2.5 type-ui transition-[background-color,border-color] duration-150",
                          pillarToneClass[option.id],
                          form.pillar === option.id
                            ? "border-(--pillar-tone) bg-surface-muted font-semibold"
                            : "border-edge bg-surface hover:bg-surface-muted",
                        )}
                      >
                        <input
                          type="radio"
                          name="pillar"
                          value={option.id}
                          checked={form.pillar === option.id}
                          onChange={() => handlePillarChange(option.id)}
                          className="size-4 shrink-0"
                        />
                        <span className="min-w-0">
                          {option.id}
                          <span className="block type-ui-sm font-normal text-ink-secondary">
                            {option.label}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <TextField
                  id="member-name"
                  label="Display name"
                  required
                  value={form.name}
                  onChange={(name) => patchForm({ name })}
                  onBlur={() => markTouched("name")}
                  error={shownError("name")}
                  maxLength={LIMITS.name}
                  autoComplete="name"
                  enterKeyHint="next"
                />
                <TextField
                  id="member-minor"
                  label="Minor / second major"
                  value={form.minor}
                  onChange={(minor) => patchForm({ minor })}
                  onBlur={() => markTouched("minor")}
                  error={shownError("minor")}
                  maxLength={LIMITS.minor}
                  hint="Optional. Leave empty to hide it."
                />
                <TextField
                  id="member-pillarfull"
                  label="Pillar full name"
                  value={form.pillarFull}
                  onChange={(pillarFull) => patchForm({ pillarFull })}
                  onBlur={() => markTouched("pillarFull")}
                  error={shownError("pillarFull")}
                  maxLength={LIMITS.pillarFull}
                  hint="Auto-filled when you change the pillar."
                />
                <TextField
                  id="member-role"
                  label="Role"
                  value={form.role}
                  onChange={(role) => patchForm({ role })}
                  onBlur={() => markTouched("role")}
                  error={shownError("role")}
                  maxLength={LIMITS.role}
                  enterKeyHint="next"
                  placeholder="e.g. Frontend & Interaction"
                />
              </motion.section>

              <motion.section variants={sectionFade} className="grid gap-5" aria-labelledby="section-profile">
                <SectionHeading
                  title="Profile"
                  id="section-profile"
                  description="The short bio shown under your name on the profile card."
                />
                <TextAreaField
                  id="member-bio"
                  label="Bio"
                  value={form.bio}
                  onChange={(bio) => patchForm({ bio })}
                  onBlur={() => markTouched("bio")}
                  error={shownError("bio")}
                  maxLength={LIMITS.bio}
                  rows={4}
                  hint="Two or three sentences."
                />
              </motion.section>

              <motion.section variants={sectionFade} className="grid gap-5" aria-labelledby="section-skills">
                <SectionHeading
                  title="Skills & interests"
                  id="section-skills"
                  description="Existing items are listed below. Removing one drops it from your profile section when you save."
                />
                <ItemsEditor
                  id="member-skills"
                  label="Skillsets"
                  items={parseList(form.skillsetsText)}
                  onChange={(items) => patchForm({ skillsetsText: serializeList(items) })}
                  error={shownError("skillsets")}
                  hint="Shown as a numbered list on your profile."
                  addPlaceholder="e.g. Simulation"
                  emptyText="No skillsets listed yet."
                />
                <ItemsEditor
                  id="member-tools"
                  label="Tools & software"
                  items={parseList(form.toolsText)}
                  onChange={(items) => patchForm({ toolsText: serializeList(items) })}
                  error={shownError("tools")}
                  hint="Shown as chips on your profile."
                  addPlaceholder="e.g. Figma"
                  emptyText="No tools listed yet."
                />
                <ItemsEditor
                  id="member-interests"
                  label="Interests"
                  items={parseList(form.interestsText)}
                  onChange={(items) => patchForm({ interestsText: serializeList(items) })}
                  error={shownError("interests")}
                  hint="Shown as chips on your profile."
                  addPlaceholder="e.g. Cartography"
                  emptyText="No interests listed yet."
                />
              </motion.section>

              <motion.section variants={sectionFade} className="grid gap-4" aria-labelledby="section-projects">
                <SectionHeading
                  title="Projects & internships"
                  id="section-projects"
                  description="Shown on your profile in the order below. Remove a row to drop it from your profile."
                />
                <ProjectsEditor
                  projects={form.projects}
                  onChange={(projects) => patchForm({ projects })}
                  error={shownError("projects")}
                  showErrors={submitAttempted}
                />
              </motion.section>

              <motion.section variants={sectionFade} className="grid gap-5" aria-labelledby="section-photos">
                <SectionHeading
                  title="Photos"
                  id="section-photos"
                  description="The photos currently in use are shown below. Stored in a private KV store and served only through the site's Worker — uploads go live immediately, no save needed."
                />
                <div className="grid gap-4 min-[48rem]:grid-cols-2">
                  <PhotoSlot
                    key={`${member.id}-hero`}
                    slot="hero"
                    label="Hero photo"
                    member={member}
                    password={session.password}
                    busy={photoBusy !== null}
                    onBusyChange={(busy) => setPhotoBusy(busy ? "hero" : null)}
                    onSaved={handlePhotoSaved}
                    onUnauthorized={handleUnauthorized}
                    onPendingPreview={setPendingHeroUrl}
                  />
                  <PhotoSlot
                    key={`${member.id}-secondary`}
                    slot="secondary"
                    label="Secondary photo"
                    member={member}
                    password={session.password}
                    busy={photoBusy !== null}
                    onBusyChange={(busy) => setPhotoBusy(busy ? "secondary" : null)}
                    onSaved={handlePhotoSaved}
                    onUnauthorized={handleUnauthorized}
                    onPendingPreview={() => {}}
                  />
                </div>
                <TextField
                  id="member-caption"
                  label="Photo caption"
                  value={form.caption}
                  onChange={(caption) => patchForm({ caption })}
                  onBlur={() => markTouched("caption")}
                  error={shownError("caption")}
                  maxLength={LIMITS.caption}
                  hint="Shown under the hero photo. Saves with the form."
                />
                <TextField
                  id="member-alt"
                  label="Photo alt text"
                  value={form.alt}
                  onChange={(alt) => patchForm({ alt })}
                  onBlur={() => markTouched("alt")}
                  error={shownError("alt")}
                  maxLength={LIMITS.alt}
                  enterKeyHint="done"
                  hint="Describes the hero photo for screen readers."
                />
              </motion.section>

              <div aria-live="polite" className="grid gap-2">
                {status ? (
                  <StatusMessage tone={status.tone}>
                    {status.text}
                    {status.profileLink ? (
                      <>
                        {" "}
                        <TransitionLink
                          to={`/member/${member.slug}`}
                          direction="forward"
                          className="font-semibold underline underline-offset-2"
                        >
                          View live profile
                        </TransitionLink>
                      </>
                    ) : null}
                    {status.retry ? (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => void handleSave()}
                          className="font-semibold underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </>
                    ) : null}
                  </StatusMessage>
                ) : null}
              </div>
            </form>

            <aside
              className="hidden min-w-0 min-[64rem]:sticky min-[64rem]:top-[calc(var(--header-h)+1.5rem)] min-[64rem]:block"
              aria-label="Profile preview"
            >
              <ProfilePreview form={form} member={member} pendingHeroUrl={pendingHeroUrl} />
            </aside>
          </motion.div>
        )}
      </article>

      {session.unlocked && form ? (
        <div className="editor-action-bar sticky bottom-0 z-20 mt-6 border-t border-edge">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="inline-flex items-center gap-2 type-ui-sm text-ink-secondary" role="status">
              <span
                className={cn("size-2 shrink-0 rounded-full", dirty ? "bg-warning" : "bg-success")}
                aria-hidden="true"
              />
              {dirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={revertToSaved}
                disabled={!dirty || saving}
                className={quietButtonStyles}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Revert
              </button>
              <button type="submit" form="update-form" disabled={saving} className={primaryButtonStyles}>
                {saving ? (
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <Save className="size-4" aria-hidden="true" />
                )}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={pendingSwitch !== null}
        title="Unsaved changes"
        description={`You have unsaved edits for ${member?.name ?? "this member"}. Save them first, or discard them and switch.`}
        confirmLabel="Discard & switch"
        tone="danger"
        onConfirm={() => {
          if (pendingSwitch) {
            clearDraft(memberId);
            doSwitch(pendingSwitch);
          }
        }}
        secondaryLabel="Save first"
        onSecondary={() => {
          const next = pendingSwitch;
          setPendingSwitch(null);
          void handleSave({ afterSave: () => (next ? doSwitch(next) : undefined) });
        }}
        cancelLabel="Keep editing"
        onCancel={() => setPendingSwitch(null)}
      />

      <ConfirmDialog
        open={lockConfirm}
        title="Lock the editor?"
        description="Your unsaved draft stays on this device and is restored when you unlock again."
        confirmLabel="Lock editor"
        onConfirm={doLock}
        onCancel={() => setLockConfirm(false)}
      />

      <ConfirmDialog
        open={conflict !== null}
        title="Newer changes exist"
        description={
          conflict
            ? `${conflict.name} was saved ${formatRelative(conflict.updatedAt)} while you were editing. Load their version, or overwrite it with yours.`
            : undefined
        }
        confirmLabel="Overwrite with mine"
        tone="danger"
        onConfirm={() => {
          const current = conflict;
          setConflict(null);
          if (current) void handleSave({ overwriteVersion: current.version });
        }}
        secondaryLabel="Load their version"
        onSecondary={() => {
          if (conflict) {
            applyLocalMember(conflict);
            reseedFrom(conflict);
            setStatus({ tone: "info", text: "Loaded the latest saved version." });
          }
          setConflict(null);
        }}
        onCancel={() => setConflict(null)}
      />

      <ConfirmDialog
        open={fallbackConfirm}
        title="Live data unreachable"
        description="The editor is showing the bundled copy of the team data, which may be older than the live site. Saving now publishes exactly what you see here."
        confirmLabel="Save anyway"
        onConfirm={() => {
          setFallbackConfirm(false);
          void handleSave({ skipFallbackConfirm: true });
        }}
        onCancel={() => setFallbackConfirm(false)}
      />

      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave with unsaved changes?"
        description="Your edits are kept as a draft on this device, but they are not live on the site yet."
        confirmLabel="Leave anyway"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        cancelLabel="Stay"
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}