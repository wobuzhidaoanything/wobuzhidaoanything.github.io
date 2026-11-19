import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useBlocker, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Clock,
  Eye,
  LoaderCircle,
  Lock,
  RefreshCw,
  RotateCcw,
  Save,
  Users,
} from "lucide-react";
import { cn } from "cn";
import { GROUP_META, type Pillar, type TeamMember } from "@/data/capstone";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useLiveMembers } from "@/hooks/useLiveMembers";
import { listRosterMembers, removePhoto, saveMember, uploadPhoto } from "@/lib/editorApi";
import { clearDraft, readDraft, writeDraft } from "@/lib/editorDrafts";
import {
  FIELD_ELEMENT_IDS,
  FIELD_TAB,
  LIMITS,
  buildPayload,
  formFromMember,
  formsEqual,
  parseList,
  serializeList,
  validateForm,
  type EditorForm,
  type EditorTabId,
  type FormField,
} from "@/lib/editorForm";
import { lockEditor, useEditorSession } from "@/lib/editorSession";
import {
  applyLocalMember,
  getMembersState,
  refreshMembers,
  replaceMembers,
  subscribeMembers,
} from "@/lib/membersStore";
import { compressPhoto } from "@/lib/photo";
import { pushToast } from "@/lib/toastBus";
import { ConfirmDialog } from "@/components/editor/ConfirmDialog";
import { EditorGate } from "@/components/editor/EditorGate";
import { ItemsEditor } from "@/components/editor/ItemsEditor";
import { PhotoSlot } from "@/components/editor/PhotoSlot";
import { ProfilePreviewDialog } from "@/components/editor/ProfilePreviewDialog";
import { ProjectsEditor } from "@/components/editor/ProjectsEditor";
import { RosterManager } from "@/components/editor/RosterManager";
import { StatusMessage, type StatusTone } from "@/components/editor/StatusMessage";
import { primaryButtonStyles, quietButtonStyles } from "@/components/editor/buttons";
import { FieldShell, TextAreaField, TextField } from "@/components/editor/fields";
import { TransitionLink } from "@/components/TransitionLink";

const PILLARS: { id: Pillar; label: string }[] = [
  { id: "CSD", label: "Computer Science & Design" },
  { id: "EPD", label: "Engineering Product Development" },
  { id: "ESD", label: "Engineering Systems & Design" },
];

const pillarDotClass: Record<Pillar, string> = {
  CSD: "bg-pillar-csd",
  EPD: "bg-pillar-epd",
  ESD: "bg-pillar-esd",
};

const pillarToneClass: Record<Pillar, string> = {
  CSD: "[--pillar-tone:var(--pillar-csd)]",
  EPD: "[--pillar-tone:var(--pillar-epd)]",
  ESD: "[--pillar-tone:var(--pillar-esd)]",
};

const EDITOR_TABS: { id: EditorTabId; label: string }[] = [
  { id: "basics", label: "Basics & Links" },
  { id: "skills", label: "Skills & Interests" },
  { id: "projects", label: "Projects" },
  { id: "photos", label: "Photos" },
];

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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

interface StagedPhotos {
  hero?: File | "remove";
  secondary?: File | "remove";
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

export function UpdateDetailsPage() {
  useDocumentTitle(`Team Settings | ${GROUP_META.title}`);

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

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMember = searchParams.get("member");

  const session = useEditorSession();
  const live = useLiveMembers();

  const initialMemberId = useMemo(() => {
    if (requestedMember && live.members.some((m) => m.id === requestedMember)) {
      return requestedMember;
    }
    return live.members[0]?.id ?? "";
  }, [requestedMember, live.members]);

  const [viewMode, setViewMode] = useState<"roster" | "member">(() =>
    requestedMember ? "member" : "roster",
  );
  const [memberId, setMemberId] = useState<string>(initialMemberId);
  const [activeTab, setActiveTab] = useState<EditorTabId>("basics");

  const member = live.members.find((m) => m.id === memberId) ?? live.members[0];

  const [initialSeed] = useState(() => (session.unlocked && member ? makeSeed(member) : null));
  const [form, setForm] = useState<EditorForm | null>(initialSeed?.form ?? null);
  const [baseline, setBaseline] = useState<EditorForm | null>(initialSeed?.baseline ?? null);
  const [baseVersion, setBaseVersion] = useState<number | null>(initialSeed?.baseVersion ?? null);
  const [seededFor, setSeededFor] = useState<string | null>(initialSeed?.seededFor ?? null);
  const [draftNotice, setDraftNotice] = useState(initialSeed?.draftNotice ?? false);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhotos>({});

  const [touched, setTouched] = useState<Partial<Record<FormField, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [status, setStatus] = useState<PageStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<{ mode: "roster" | "member"; id?: string } | null>(
    null,
  );
  const [lockConfirm, setLockConfirm] = useState(false);
  const [conflict, setConflict] = useState<TeamMember | null>(null);
  const [fallbackConfirm, setFallbackConfirm] = useState(false);
  const [gateNotice, setGateNotice] = useState<{ tone: StatusTone; text: string } | null>(null);

  const tabRefs = useRef<Partial<Record<EditorTabId, HTMLButtonElement | null>>>({});
  const panelRefs = useRef<Partial<Record<EditorTabId, HTMLDivElement | null>>>({});

  const textDirty = form !== null && baseline !== null && !formsEqual(form, baseline);
  const hasStagedPhotos = Boolean(stagedPhotos.hero || stagedPhotos.secondary);
  const dirty = textDirty || hasStagedPhotos;

  const blocker = useBlocker(session.unlocked && dirty);
  const latest = useRef({ form, baseline, baseVersion, dirty, memberId, requestedMember });

  const allErrors = form ? validateForm(form) : {};
  const shownError = (field: FormField): string | undefined =>
    submitAttempted || touched[field] ? allErrors[field] : undefined;

  useEffect(() => {
    latest.current = { form, baseline, baseVersion, dirty, memberId, requestedMember };
  });

  // Memoize draft presence so we do not read sessionStorage + JSON.parse per member on every keystroke.
  const hasDraftIds = useMemo(() => {
    const set = new Set<string>();
    for (const m of live.members) {
      if ((m.id === memberId && (dirty || draftNotice)) || Boolean(readDraft(m.id))) {
        set.add(m.id);
      }
    }
    return set;
  }, [live.members, memberId, dirty, draftNotice]);

  function seedFrom(target: TeamMember) {
    const seed = makeSeed(target);
    setForm(seed.form);
    setBaseline(seed.baseline);
    setBaseVersion(seed.baseVersion);
    setSeededFor(seed.seededFor);
    setDraftNotice(seed.draftNotice);
    setStagedPhotos({});
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
    setStagedPhotos({});
    setSubmitAttempted(false);
    setTouched({});
  }

  function handleUnlocked() {
    const snapshot = getMembersState();
    const targetId =
      requestedMember && snapshot.members.some((m) => m.id === requestedMember)
        ? requestedMember
        : memberId;
    const target = snapshot.members.find((m) => m.id === targetId) ?? snapshot.members[0];
    if (!target) return;
    if (form && baseline && seededFor === target.id && (!formsEqual(form, baseline) || hasStagedPhotos)) {
      return;
    }
    setMemberId(target.id);
    seedFrom(target);
    setStatus(null);
  }

  // Fetch full roster (including hidden members) when unlocked, and resolve cold-load ?member=<new-id>.
  useEffect(() => {
    if (!session.unlocked || !session.password) return;
    let cancelled = false;
    void (async () => {
      const res = await listRosterMembers(session.password);
      if (cancelled || !res.ok || !res.data.members) return;
      replaceMembers(res.data.members);
      const current = latest.current;
      const reqId = current.requestedMember;
      if (
        reqId &&
        current.memberId !== reqId &&
        !current.dirty &&
        res.data.members.some((m) => m.id === reqId)
      ) {
        const target = res.data.members.find((m) => m.id === reqId);
        if (target) {
          setMemberId(target.id);
          seedFrom(target);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.unlocked, session.password]);

  const syncRosterAfterWrite = useCallback(async () => {
    if (session.unlocked && session.password) {
      const res = await listRosterMembers(session.password);
      if (res.ok && res.data.members) {
        replaceMembers(res.data.members);
        return;
      }
    }
    await refreshMembers(true);
  }, [session.unlocked, session.password]);

  // Ensure form seeds if members update after initial load and editor is untouched.
  useEffect(() => {
    if (!session.unlocked) return;
    return subscribeMembers(() => {
      const snapshot = getMembersState();
      if (snapshot.loading || snapshot.usingFallback) return;
      const current = latest.current;
      if (!current.dirty && requestedMember && current.memberId !== requestedMember) {
        const requestedTarget = snapshot.members.find((m) => m.id === requestedMember);
        if (requestedTarget) {
          setMemberId(requestedTarget.id);
          seedFrom(requestedTarget);
          return;
        }
      }
      if (!current.form || !current.baseline || current.dirty) return;
      const target = snapshot.members.find((m) => m.id === current.memberId);
      if (!target || (target.version ?? null) === current.baseVersion) return;
      reseedFrom(target);
    });
  }, [session.unlocked, requestedMember]);

  useEffect(() => {
    if (!session.unlocked || !memberId || !form || !baseline) return;
    if (!formsEqual(form, baseline)) {
      const timer = setTimeout(
        () => writeDraft(memberId, { form, baseVersion, savedAt: Date.now() }),
        400,
      );
      return () => clearTimeout(timer);
    }
    clearDraft(memberId);
  }, [form, baseline, memberId, session.unlocked, baseVersion]);

  useEffect(() => {
    if (!dirty || !session.unlocked) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, session.unlocked]);

  // Sync hidden="until-found" and beforematch on the 4 member tabs.
  useLayoutEffect(() => {
    for (const tab of EDITOR_TABS) {
      const panel = panelRefs.current[tab.id];
      if (!panel) continue;
      if (activeTab === tab.id) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "until-found");
      }
    }
  }, [activeTab, viewMode, session.unlocked]);

  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const tab of EDITOR_TABS) {
      const panel = panelRefs.current[tab.id];
      if (!panel) continue;
      const onMatch = () => setActiveTab(tab.id);
      panel.addEventListener("beforematch", onMatch);
      cleanups.push(() => panel.removeEventListener("beforematch", onMatch));
    }
    return () => cleanups.forEach((fn) => fn());
  }, [viewMode, session.unlocked]);

  function patchForm(patch: Partial<EditorForm>) {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setStatus(null);
  }

  function markTouched(field: FormField) {
    setTouched((current) => ({ ...current, [field]: true }));
  }

  function doSwitch(target: { mode: "roster" | "member"; id?: string }) {
    setPendingSwitch(null);
    setStatus(null);
    if (target.mode === "roster") {
      setViewMode("roster");
      setSearchParams({}, { replace: true });
      return;
    }
    const nextId = target.id ?? memberId;
    const next =
      getMembersState().members.find((m) => m.id === nextId) ??
      live.members.find((m) => m.id === nextId);
    setViewMode("member");
    setMemberId(nextId);
    setSearchParams({ member: nextId }, { replace: true });
    if (next) seedFrom(next);
  }

  function requestNavigation(target: { mode: "roster" | "member"; id?: string }) {
    if (target.mode === "roster" && viewMode === "roster") return;
    if (target.mode === "member" && viewMode === "member" && target.id === memberId) return;
    if (dirty && viewMode === "member") {
      setPendingSwitch(target);
    } else {
      doSwitch(target);
    }
  }

  const handleUnauthorized = useCallback(() => {
    lockEditor();
    setGateNotice({
      tone: "danger",
      text: "The password was rejected or changed. Unlock again; your unsaved edits are kept.",
    });
  }, []);

  function doLock() {
    setLockConfirm(false);
    lockEditor();
    setGateNotice({
      tone: "info",
      text: dirty
        ? "Settings locked. Your unsaved draft stays on this device."
        : "Settings locked.",
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
      setActiveTab(FIELD_TAB[firstError]);
      setStatus({ tone: "danger", text: "Fix the highlighted fields, then save again." });
      requestAnimationFrame(() => {
        const element = document.getElementById(FIELD_ELEMENT_IDS[firstError]);
        element?.focus();
        element?.scrollIntoView({ block: "center" });
      });
      return;
    }
    if (live.usingFallback && !opts?.skipFallbackConfirm) {
      setFallbackConfirm(true);
      return;
    }

    setSaving(true);
    setStatus(null);

    let workingMember = member;
    let workingVersion = opts?.overwriteVersion ?? baseVersion ?? undefined;
    const hadStaged = hasStagedPhotos;
    const wasTextDirty = textDirty;

    // 1. Commit staged photo removals / uploads first so workingVersion stays fresh.
    for (const slot of ["hero", "secondary"] as const) {
      const staged = stagedPhotos[slot];
      if (!staged) continue;
      if (staged === "remove") {
        const res = await removePhoto(session.password, workingMember.id, slot, workingVersion);
        if (!res.ok) {
          setSaving(false);
          if (res.status === 401) handleUnauthorized();
          else if (res.status === 409 && res.current) setConflict(res.current);
          else setStatus({ tone: "danger", text: res.error, retry: res.status === null || res.status >= 500 });
          return;
        }
        if (res.data.member) {
          workingMember = res.data.member;
          workingVersion = workingMember.version;
          setBaseVersion(workingMember.version ?? null);
          setSeededFor(workingMember.id);
          applyLocalMember(workingMember);
        }
        setStagedPhotos((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
      } else {
        let compressed;
        try {
          compressed = await compressPhoto(staged);
        } catch {
          setSaving(false);
          setActiveTab("photos");
          setStatus({
            tone: "danger",
            text: `Could not read the ${slot} photo. Export as JPEG or PNG and try again.`,
          });
          return;
        }
        if (compressed.file.size > MAX_UPLOAD_BYTES) {
          setSaving(false);
          setActiveTab("photos");
          setStatus({
            tone: "danger",
            text: `The ${slot} photo is still over 5 MB after compression. Choose a smaller image.`,
          });
          return;
        }
        const res = await uploadPhoto(
          session.password,
          workingMember.id,
          slot,
          compressed.file,
          workingVersion,
        );
        if (!res.ok) {
          setSaving(false);
          if (res.status === 401) handleUnauthorized();
          else if (res.status === 409 && res.current) setConflict(res.current);
          else setStatus({ tone: "danger", text: res.error, retry: res.status === null || res.status >= 500 });
          return;
        }
        if (res.data.member) {
          workingMember = res.data.member;
          workingVersion = workingMember.version;
          setBaseVersion(workingMember.version ?? null);
          setSeededFor(workingMember.id);
          applyLocalMember(workingMember);
        }
        setStagedPhotos((prev) => {
          const next = { ...prev };
          delete next[slot];
          return next;
        });
      }
    }

    // 2. Commit profile text & links (always if text dirty or no photos were staged).
    if (wasTextDirty || !hadStaged) {
      const payload = buildPayload(form, workingMember);
      const result = await saveMember(session.password, workingMember.id, payload, workingVersion);
      setSaving(false);
      if (result.ok) {
        const saved = result.data.member;
        if (saved) {
          applyLocalMember(saved);
          reseedFrom(saved);
          pushToast({
            tone: "success",
            text: `${saved.name}'s profile saved.`,
            link: { to: `/member/${saved.slug}`, label: "View live profile" },
          });
        } else {
          await syncRosterAfterWrite();
          const fresh = getMembersState().members.find((m) => m.id === workingMember.id);
          if (fresh) reseedFrom(fresh);
          pushToast({ tone: "success", text: "Profile saved." });
        }
        void syncRosterAfterWrite();
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
      return;
    }

    // Photos-only save finished cleanly.
    setSaving(false);
    reseedFrom(workingMember);
    void syncRosterAfterWrite();
    pushToast({
      tone: "success",
      text: `${workingMember.name}'s photos updated.`,
      link: { to: `/member/${workingMember.slug}`, label: "View live profile" },
    });
    opts?.afterSave?.();
  }

  // Cmd/Ctrl + S shortcut when editing a member.
  useEffect(() => {
    if (!session.unlocked || viewMode !== "member") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!dirty || saving) return;
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function handleRefresh() {
    setRefreshing(true);
    if (session.unlocked && session.password) {
      const res = await listRosterMembers(session.password);
      if (res.ok && res.data.members) {
        replaceMembers(res.data.members);
      } else {
        await refreshMembers(true);
      }
    } else {
      await refreshMembers(true);
    }
    setRefreshing(false);
    pushToast({ tone: "info", text: "Synced latest team data." });
  }

  function discardDraft() {
    if (member) reseedFrom(member);
    setStatus({ tone: "info", text: "Draft discarded. Showing last saved profile." });
  }

  function revertChanges() {
    if (member) reseedFrom(member);
    setStatus({ tone: "info", text: "Reverted unsaved changes." });
  }

  function switchTab(next: EditorTabId, moveFocus = false) {
    setActiveTab(next);
    const el = tabRefs.current[next];
    if (el) {
      if (moveFocus) el.focus();
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function handleTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const idx = EDITOR_TABS.findIndex((t) => t.id === activeTab);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      switchTab(EDITOR_TABS[(idx + 1) % EDITOR_TABS.length].id, true);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      switchTab(EDITOR_TABS[(idx - 1 + EDITOR_TABS.length) % EDITOR_TABS.length].id, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      switchTab(EDITOR_TABS[0].id, true);
    } else if (e.key === "End") {
      e.preventDefault();
      switchTab(EDITOR_TABS[EDITOR_TABS.length - 1].id, true);
    }
  }

  if (!session.unlocked) {
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

          <EditorGate notice={gateNotice} onUnlocked={handleUnlocked} />
        </article>
      </div>
    );
  }

  return (
    <div className="shell shell-block @container/studio">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
        <div className="grid gap-1">
          <span className="inline-flex items-center gap-1.5 type-ui-sm font-semibold tracking-[0.04em] uppercase text-ink-muted">
            <Lock className="size-3.5" aria-hidden="true" />
            Private · Not indexed
          </span>
          <h1
            id="main-content"
            tabIndex={-1}
            className="m-0 font-serif type-title-3 font-semibold text-ink focus:outline-none"
          >
            Team Settings
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className={cn(quietButtonStyles, "min-h-10 px-3 py-1.5")}
          >
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={requestLock}
            className={cn(quietButtonStyles, "min-h-10 px-3 py-1.5")}
          >
            <Lock className="size-3.5" aria-hidden="true" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {!member || !form ? (
        <div className="grid gap-4 py-8" aria-busy="true" aria-label="Loading settings">
          <div className="h-11 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
          <div className="h-24 animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none" />
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-1 items-start gap-[clamp(1.75rem,4cqi,3.5rem)] @min-[56rem]/studio:grid-cols-[15.5rem_minmax(0,1fr)]">
          <aside className="grid gap-4 @min-[56rem]/studio:sticky @min-[56rem]/studio:top-[calc(var(--header-h)+1.5rem)]">
            <nav aria-label="Settings navigation" className="grid gap-1">
              <button
                type="button"
                onClick={() => requestNavigation({ mode: "roster" })}
                aria-current={viewMode === "roster" ? "page" : undefined}
                className={cn(
                  "ui-row-interactive flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2 text-start type-ui font-semibold",
                  viewMode === "roster"
                    ? "border-edge bg-surface text-ink shadow-chip"
                    : "border-transparent bg-transparent text-ink-secondary hover:text-ink",
                )}
              >
                <Users className="size-4 shrink-0" aria-hidden="true" />
                <span>Team Roster &amp; Order</span>
              </button>

              <div className="mt-3 mb-1 border-t border-rule pt-3 px-3 type-micro font-semibold tracking-[0.06em] uppercase text-ink-muted">
                Members
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-1 @min-[56rem]/studio:grid @min-[56rem]/studio:overflow-visible @min-[56rem]/studio:pb-0">
                {live.members.map((m) => {
                  const active = viewMode === "member" && m.id === member.id;
                  const hasDraft = hasDraftIds.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      data-pillar={m.pillar}
                      onClick={() => requestNavigation({ mode: "member", id: m.id })}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "ui-row-interactive flex min-h-10 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-control border px-3 py-2 text-start type-ui-sm font-medium pointer-coarse:min-h-11",
                        active
                          ? "border-(--tone) bg-[color-mix(in_oklab,var(--tone)_10%,var(--surface))] font-semibold text-ink shadow-chip"
                          : "border-transparent bg-transparent text-ink-secondary hover:text-ink",
                        m.hidden && "opacity-65",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn("size-2 shrink-0 rounded-full", pillarDotClass[m.pillar])}
                          aria-hidden="true"
                        />
                        <span className="truncate">{m.name}</span>
                      </span>
                      {hasDraft ? (
                        <span
                          role="img"
                          className="size-2 shrink-0 rounded-full bg-warning"
                          title="Unsaved draft"
                          aria-label="Has unsaved draft"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </nav>
          </aside>

          <div className="studio-pane-scroll-parent @container/studio-pane min-w-0 max-w-[46rem]">
            {live.usingFallback && !live.loading ? (
              <div className="mb-4">
                <StatusMessage tone="warning">
                  Live data is unreachable. You are viewing the bundled copy.{" "}
                  <button
                    type="button"
                    onClick={() => void handleRefresh()}
                    className="font-semibold underline underline-offset-2"
                  >
                    Retry
                  </button>
                </StatusMessage>
              </div>
            ) : null}

            {viewMode === "roster" ? (
              <RosterManager
                members={live.members}
                password={session.password}
                hasDraftIds={hasDraftIds}
                onEditMember={(id) => requestNavigation({ mode: "member", id })}
                onMemberDeleted={(deletedId) => {
                  if (deletedId === memberId) {
                    const fallback = getMembersState().members[0];
                    if (fallback) {
                      setMemberId(fallback.id);
                      reseedFrom(fallback);
                    }
                  }
                }}
                onUnauthorized={handleUnauthorized}
              />
            ) : (
              <div className="grid min-w-0 gap-6">
                <div className="studio-sticky-bar">
                  <div className="studio-sticky-bar-inner flex flex-wrap items-center justify-between gap-3 rounded-card border border-transparent px-3 py-2.5 -mx-3">
                    <div className="grid gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => requestNavigation({ mode: "roster" })}
                          className="ui-press inline-flex min-h-10 cursor-pointer items-center gap-1 rounded-control border border-transparent px-2.5 type-ui-sm font-semibold text-ink-secondary hover:bg-surface-muted/75 hover:text-ink pointer-coarse:min-h-11"
                        >
                          <ArrowLeft className="size-3.5" aria-hidden="true" />
                          <span>Roster</span>
                        </button>
                        <span aria-hidden="true" className="text-ink-muted">
                          /
                        </span>
                        <span className="font-serif type-label-lg font-semibold text-ink">
                          {form.name.trim() || member.name}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1.5 ps-1.5 type-micro text-ink-muted">
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            dirty ? "bg-warning" : "bg-success",
                          )}
                          aria-hidden="true"
                        />
                        <span>{dirty ? "Unsaved changes" : "Saved"}</span>
                        <span aria-hidden="true">·</span>
                        <Clock className="size-3" aria-hidden="true" />
                        <span>
                          {member.updatedAt
                            ? `Updated ${formatRelative(member.updatedAt)}`
                            : "Not saved yet"}
                        </span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className={cn(quietButtonStyles, "min-h-10 px-3.5 py-1.5")}
                      >
                        <Eye className="size-4" aria-hidden="true" />
                        <span>Preview</span>
                      </button>
                      {dirty ? (
                        <button
                          type="button"
                          onClick={revertChanges}
                          disabled={saving}
                          className={cn(quietButtonStyles, "hidden min-h-10 px-3.5 py-1.5 sm:inline-flex")}
                        >
                          <RotateCcw className="size-4" aria-hidden="true" />
                          <span>Revert</span>
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        form="member-settings-form"
                        disabled={saving || !dirty}
                        className={cn(primaryButtonStyles, "min-h-10 px-4 py-1.5")}
                      >
                        {saving ? (
                          <LoaderCircle
                            className="size-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : (
                          <Save className="size-4" aria-hidden="true" />
                        )}
                        <span>{saving ? "Saving…" : "Save changes"}</span>
                      </button>
                    </div>
                  </div>
                </div>

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

                <div
                  className="studio-tablist"
                  role="tablist"
                  aria-label="Member settings sections"
                  {...({ focusgroup: "tablist nomemory" } as Record<string, unknown>)}
                >
                  {EDITOR_TABS.map((tab) => {
                    const selected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        ref={(el) => {
                          tabRefs.current[tab.id] = el;
                        }}
                        id={`studio-tab-${tab.id}`}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        tabIndex={selected ? 0 : -1}
                        {...(selected ? ({ focusgroupstart: "" } as Record<string, unknown>) : {})}
                        onClick={() => switchTab(tab.id)}
                        onKeyDown={handleTabKeyDown}
                        className="studio-tab pointer-coarse:min-h-11"
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                <form
                  id="member-settings-form"
                  noValidate
                  onSubmit={(event: FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void handleSave();
                  }}
                  className="grid min-w-0 grid-cols-[minmax(0,1fr)]"
                >
                  <fieldset
                    disabled={saving}
                    className="m-0 grid min-w-0 grid-cols-[minmax(0,1fr)] border-0 p-0 disabled:opacity-70"
                  >
                  {/* Tab 1: Basics & Links */}
                  <div
                    ref={(el) => {
                      panelRefs.current.basics = el;
                    }}
                    id="studio-panel-basics"
                    role="tabpanel"
                    aria-labelledby="studio-tab-basics"
                    className="col-start-1 row-start-1 min-w-0"
                    hidden={activeTab !== "basics"}
                  >
                    <div className="grid gap-5 pt-1">
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

                      <FieldShell id="member-pillar" label="Pillar" required group>
                        <div className="grid gap-2 @min-[32rem]/studio-pane:grid-cols-3">
                          {PILLARS.map((option) => (
                            <label
                              key={option.id}
                              className={cn(
                                "ui-press flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control border px-3.5 py-2.5 type-ui",
                                pillarToneClass[option.id],
                                form.pillar === option.id
                                  ? "border-(--pillar-tone) bg-[color-mix(in_oklab,var(--pillar-tone)_10%,var(--surface))] font-semibold"
                                  : "border-edge bg-surface hover:bg-surface-muted/60",
                              )}
                            >
                              <input
                                type="radio"
                                name="pillar"
                                value={option.id}
                                checked={form.pillar === option.id}
                                onChange={() => patchForm({ pillar: option.id })}
                                className="size-4 shrink-0"
                              />
                              <span className="min-w-0">
                                {option.id}
                                <span className="block type-micro font-normal text-ink-secondary">
                                  {option.label}
                                </span>
                              </span>
                            </label>
                          ))}
                        </div>
                      </FieldShell>

                      <div className="grid gap-4 @min-[30rem]/studio-pane:grid-cols-2">
                        <TextField
                          id="member-role"
                          label="Role / focus"
                          value={form.role}
                          onChange={(role) => patchForm({ role })}
                          onBlur={() => markTouched("role")}
                          error={shownError("role")}
                          maxLength={LIMITS.role}
                          placeholder="e.g. Frontend & Interaction"
                        />
                        <TextField
                          id="member-minor"
                          label="Minor / second major"
                          value={form.minor}
                          onChange={(minor) => patchForm({ minor })}
                          onBlur={() => markTouched("minor")}
                          error={shownError("minor")}
                          maxLength={LIMITS.minor}
                          placeholder="Optional"
                        />
                      </div>

                      <TextAreaField
                        id="member-bio"
                        label="Bio"
                        value={form.bio}
                        onChange={(bio) => patchForm({ bio })}
                        onBlur={() => markTouched("bio")}
                        error={shownError("bio")}
                        maxLength={LIMITS.bio}
                        rows={3}
                        hint="Two or three sentences shown on the home page and profile."
                      />

                      <div className="grid gap-4 border-t border-rule pt-5">
                        <h2 className="m-0 type-ui font-semibold text-ink">
                          External Links (optional)
                        </h2>
                        <div className="grid gap-4 @min-[30rem]/studio-pane:grid-cols-2">
                          <TextField
                            id="member-link-github"
                            label="GitHub"
                            type="url"
                            value={form.links.github}
                            onChange={(github) =>
                              patchForm({ links: { ...form.links, github } })
                            }
                            onBlur={() => markTouched("linksGithub")}
                            error={shownError("linksGithub")}
                            maxLength={LIMITS.url}
                            placeholder="https://github.com/..."
                          />
                          <TextField
                            id="member-link-linkedin"
                            label="LinkedIn"
                            type="url"
                            value={form.links.linkedin}
                            onChange={(linkedin) =>
                              patchForm({ links: { ...form.links, linkedin } })
                            }
                            onBlur={() => markTouched("linksLinkedin")}
                            error={shownError("linksLinkedin")}
                            maxLength={LIMITS.url}
                            placeholder="https://linkedin.com/in/..."
                          />
                          <TextField
                            id="member-link-portfolio"
                            label="Portfolio / Website"
                            type="url"
                            value={form.links.portfolio}
                            onChange={(portfolio) =>
                              patchForm({ links: { ...form.links, portfolio } })
                            }
                            onBlur={() => markTouched("linksPortfolio")}
                            error={shownError("linksPortfolio")}
                            maxLength={LIMITS.url}
                            placeholder="https://..."
                          />
                          <TextField
                            id="member-link-email"
                            label="Public Contact Email"
                            type="email"
                            value={form.links.email}
                            onChange={(email) => patchForm({ links: { ...form.links, email } })}
                            onBlur={() => markTouched("linksEmail")}
                            error={shownError("linksEmail")}
                            maxLength={LIMITS.email}
                            placeholder="name@example.com"
                          />
                        </div>
                      </div>

                      <div className="border-t border-rule pt-4">
                        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 type-ui text-ink">
                          <input
                            type="checkbox"
                            checked={form.hidden}
                            onChange={(e) => patchForm({ hidden: e.target.checked })}
                            className="size-4"
                          />
                          <span>
                            Hide profile from public site
                            <span className="block type-ui-sm text-ink-muted">
                              Drafts and data stay saved, but won't appear on the roster.
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Tab 2: Skills & Interests */}
                  <div
                    ref={(el) => {
                      panelRefs.current.skills = el;
                    }}
                    id="studio-panel-skills"
                    role="tabpanel"
                    aria-labelledby="studio-tab-skills"
                    className="col-start-1 row-start-1 min-w-0"
                    hidden={activeTab !== "skills"}
                  >
                    <div className="grid gap-6 pt-1">
                      <ItemsEditor
                        key={`${member.id}-skills`}
                        id="member-skills"
                        label="Skillsets"
                        items={parseList(form.skillsetsText)}
                        onChange={(items) =>
                          patchForm({ skillsetsText: serializeList(items) })
                        }
                        error={shownError("skillsets")}
                        hint="Press Enter or paste comma-separated tags. Shown as a numbered list."
                        addPlaceholder="e.g. Simulation"
                        emptyText="No skillsets listed yet."
                      />
                      <ItemsEditor
                        key={`${member.id}-tools`}
                        id="member-tools"
                        label="Tools & software"
                        items={parseList(form.toolsText)}
                        onChange={(items) => patchForm({ toolsText: serializeList(items) })}
                        error={shownError("tools")}
                        hint="Languages, CAD packages, frameworks, and lab tools."
                        addPlaceholder="e.g. Fusion 360"
                        emptyText="No tools listed yet."
                      />
                      <ItemsEditor
                        key={`${member.id}-interests`}
                        id="member-interests"
                        label="Interests"
                        items={parseList(form.interestsText)}
                        onChange={(items) =>
                          patchForm({ interestsText: serializeList(items) })
                        }
                        error={shownError("interests")}
                        hint="Research directions, studio curiosities, or personal hobbies."
                        addPlaceholder="e.g. Cartography"
                        emptyText="No interests listed yet."
                      />
                    </div>
                  </div>

                  {/* Tab 3: Projects */}
                  <div
                    ref={(el) => {
                      panelRefs.current.projects = el;
                    }}
                    id="studio-panel-projects"
                    role="tabpanel"
                    aria-labelledby="studio-tab-projects"
                    className="col-start-1 row-start-1 min-w-0"
                    hidden={activeTab !== "projects"}
                  >
                    <div className="grid gap-4 pt-1">
                      <p className="m-0 type-ui-sm text-ink-secondary">
                        Featured projects automatically appear in Our Experience &amp; Expertise on the home page.
                      </p>
                      <ProjectsEditor
                        key={`${member.id}-projects`}
                        projects={form.projects}
                        onChange={(projects) => patchForm({ projects })}
                        error={shownError("projects")}
                        showErrors={submitAttempted}
                      />
                    </div>
                  </div>

                  {/* Tab 4: Photos */}
                  <div
                    ref={(el) => {
                      panelRefs.current.photos = el;
                    }}
                    id="studio-panel-photos"
                    role="tabpanel"
                    aria-labelledby="studio-tab-photos"
                    className="col-start-1 row-start-1 min-w-0"
                    hidden={activeTab !== "photos"}
                  >
                    <div className="grid gap-5 pt-1">
                      <p className="m-0 type-ui-sm text-ink-secondary">
                        Stage photo changes here. When you click Save changes, photos publish first followed by your profile text.
                      </p>

                      <div className="grid gap-4 @min-[36rem]/studio-pane:grid-cols-2">
                        <PhotoSlot
                          key={`${member.id}-hero`}
                          slot="hero"
                          label="Hero photo"
                          hint="Shown on your home chapter and profile."
                          member={member}
                          stagedFile={stagedPhotos.hero instanceof File ? stagedPhotos.hero : null}
                          stagedRemove={stagedPhotos.hero === "remove"}
                          onStageFile={(file) => {
                            setStagedPhotos((prev) => ({ ...prev, hero: file }));
                            setStatus(null);
                          }}
                          onStageRemove={() => {
                            setStagedPhotos((prev) => ({ ...prev, hero: "remove" }));
                            setStatus(null);
                          }}
                          onUndoStage={() => {
                            setStagedPhotos((prev) => {
                              const next = { ...prev };
                              delete next.hero;
                              return next;
                            });
                          }}
                        />

                        <PhotoSlot
                          key={`${member.id}-secondary`}
                          slot="secondary"
                          label="Secondary photo"
                          hint="Shown alongside your hero on your profile."
                          member={member}
                          stagedFile={
                            stagedPhotos.secondary instanceof File ? stagedPhotos.secondary : null
                          }
                          stagedRemove={stagedPhotos.secondary === "remove"}
                          onStageFile={(file) => {
                            setStagedPhotos((prev) => ({ ...prev, secondary: file }));
                            setStatus(null);
                          }}
                          onStageRemove={() => {
                            setStagedPhotos((prev) => ({ ...prev, secondary: "remove" }));
                            setStatus(null);
                          }}
                          onUndoStage={() => {
                            setStagedPhotos((prev) => {
                              const next = { ...prev };
                              delete next.secondary;
                              return next;
                            });
                          }}
                        />
                      </div>

                      <div className="grid gap-4 border-t border-rule pt-4">
                        <TextField
                          id="member-caption"
                          label="Hero photo caption"
                          value={form.caption}
                          onChange={(caption) => patchForm({ caption })}
                          onBlur={() => markTouched("caption")}
                          error={shownError("caption")}
                          maxLength={LIMITS.caption}
                          hint="Optional caption printed under your hero photo."
                        />
                        <TextField
                          id="member-alt"
                          label="Hero photo alt text"
                          value={form.alt}
                          onChange={(alt) => patchForm({ alt })}
                          onBlur={() => markTouched("alt")}
                          error={shownError("alt")}
                          maxLength={LIMITS.alt}
                          hint="Describes the photo for screen readers."
                        />
                      </div>
                    </div>
                  </div>
                  </fieldset>

                  <div aria-live="polite" className="mt-5 grid gap-2">
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
              </div>
            )}
          </div>
        </div>
      )}

      {session.unlocked && viewMode === "member" && form && dirty ? (
        <div className="studio-mobile-bar sticky bottom-0 z-20 mt-6 border-t border-edge py-3 sm:hidden">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={revertChanges}
              disabled={saving}
              className={cn(quietButtonStyles, "min-h-11 px-3.5 py-2")}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Revert
            </button>
            <button
              type="submit"
              form="member-settings-form"
              disabled={saving}
              className={cn(primaryButtonStyles, "min-h-11 flex-1")}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      ) : null}

      {session.unlocked && member && form ? (
        <ProfilePreviewDialog
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          form={form}
          member={member}
          stagedHeroFile={stagedPhotos.hero instanceof File ? stagedPhotos.hero : null}
          stagedHeroRemove={stagedPhotos.hero === "remove"}
          stagedSecondaryFile={
            stagedPhotos.secondary instanceof File ? stagedPhotos.secondary : null
          }
          stagedSecondaryRemove={stagedPhotos.secondary === "remove"}
        />
      ) : null}

      <ConfirmDialog
        open={pendingSwitch !== null}
        title="Unsaved changes"
        description={`You have unsaved edits for ${member?.name ?? "this member"}. Save them first, or discard them and leave.`}
        confirmLabel="Discard & switch"
        tone="danger"
        onConfirm={() => {
          const target = pendingSwitch;
          if (member) reseedFrom(member);
          if (target) doSwitch(target);
        }}
        secondaryLabel="Save first"
        onSecondary={() => {
          const target = pendingSwitch;
          setPendingSwitch(null);
          void handleSave({ afterSave: () => (target ? doSwitch(target) : undefined) });
        }}
        cancelLabel="Keep editing"
        onCancel={() => setPendingSwitch(null)}
      />

      <ConfirmDialog
        open={lockConfirm}
        title="Lock settings?"
        description="Your unsaved text draft stays on this device, though staged photo files must be re-selected after unlocking."
        confirmLabel="Lock settings"
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
        description="Settings is showing the bundled copy of the team data, which may be older than the live site. Saving now publishes what you see here."
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
        description="Your text edits are kept as a local draft, but they are not live on the site until you save."
        confirmLabel="Leave anyway"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        cancelLabel="Stay"
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
