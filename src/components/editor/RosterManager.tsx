import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, LoaderCircle, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { cn } from "cn";
import type { Pillar, TeamMember } from "@/data/capstone";
import {
  addRosterMember,
  deleteRosterMember,
  listRosterMembers,
  reorderRoster,
  setMemberHidden,
} from "@/lib/editorApi";
import { clearDraft } from "@/lib/editorDrafts";
import { LIMITS, PILLAR_FULL, memberCompleteness } from "@/lib/editorForm";
import { replaceMembers } from "@/lib/membersStore";
import { pushToast } from "@/lib/toastBus";
import { PillarBadge } from "@/components/ui/pillar-badge";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusMessage } from "./StatusMessage";
import { iconButtonStyles, primaryButtonStyles, quietButtonStyles } from "./buttons";
import { inputStyles } from "./fields";

interface RosterManagerProps {
  members: TeamMember[];
  password: string;
  hasDraftIds: ReadonlySet<string>;
  onEditMember: (memberId: string) => void;
  onMemberDeleted?: (deletedId: string) => void;
  onUnauthorized: () => void;
}

const PILLARS: Pillar[] = ["CSD", "EPD", "ESD"];

export function RosterManager({
  members,
  password,
  hasDraftIds,
  onEditMember,
  onMemberDeleted,
  onUnauthorized,
}: RosterManagerProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPillar, setNewPillar] = useState<Pillar>("CSD");
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  async function syncRosterStore(incoming: TeamMember[] | undefined): Promise<boolean> {
    if (incoming && incoming.length > 0) {
      replaceMembers(incoming);
      return true;
    }
    const listRes = await listRosterMembers(password);
    if (listRes.ok && listRes.data.members) {
      replaceMembers(listRes.data.members);
      return true;
    }
    return false;
  }

  async function handleReorder(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= members.length || busyId) return;
    const currentIds = members.map((m) => m.id);
    const nextOrder = [...currentIds];
    [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
    setBusyId("reorder");
    setError(null);
    const result = await reorderRoster(password, nextOrder, currentIds);
    setBusyId(null);
    if (result.ok) {
      const synced = await syncRosterStore(result.data.members);
      if (synced) {
        pushToast({ tone: "success", text: "Team order updated." });
      }
    } else if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(result.error);
    }
  }

  async function handleToggleHidden(member: TeamMember) {
    if (busyId) return;
    setBusyId(member.id);
    setError(null);
    const nextHidden = !member.hidden;
    const result = await setMemberHidden(password, member.id, nextHidden, member.version);
    setBusyId(null);
    if (result.ok) {
      const synced = await syncRosterStore(result.data.members);
      if (synced) {
        pushToast({
          tone: "info",
          text: nextHidden
            ? `${member.name} hidden from the public site.`
            : `${member.name} is visible on the public site.`,
        });
      }
    } else if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(result.error);
    }
  }

  async function handleAddMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName || busyId) return;
    setBusyId("add");
    setError(null);
    const currentIds = members.map((m) => m.id);
    const result = await addRosterMember(
      password,
      {
        name: trimmedName,
        pillar: newPillar,
      },
      currentIds,
    );
    setBusyId(null);
    if (result.ok) {
      await syncRosterStore(result.data.members);
      setNewName("");
      setAdding(false);
      pushToast({ tone: "success", text: `Added ${trimmedName} to the team.` });
      if (result.data.member) {
        onEditMember(result.data.member.id);
      }
    } else if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(result.error);
    }
  }

  async function confirmDeleteMember() {
    const target = deleteTarget;
    if (!target || busyId) return;
    setDeleteTarget(null);
    setBusyId(target.id);
    setError(null);
    const currentIds = members.map((m) => m.id);
    const result = await deleteRosterMember(password, target.id, currentIds, target.version);
    setBusyId(null);
    if (result.ok) {
      clearDraft(target.id);
      const synced = await syncRosterStore(result.data.members);
      if (synced) {
        onMemberDeleted?.(target.id);
        pushToast({ tone: "info", text: `Removed ${target.name} from the team.` });
      }
    } else if (result.status === 401) {
      onUnauthorized();
    } else {
      setError(result.error);
    }
  }

  const visibleCount = members.filter((m) => !m.hidden).length;

  return (
    <div className="grid min-w-0 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-4">
        <div className="grid gap-1">
          <h2 className="m-0 font-serif type-heading font-semibold text-ink">
            Team Members
          </h2>
          <p className="m-0 type-ui-sm text-ink-secondary">
            {visibleCount} visible of {members.length} total members. Reorder, hide, add, or remove teammates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          aria-expanded={adding}
          className={quietButtonStyles}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          <span>{adding ? "Cancel" : "Add member"}</span>
        </button>
      </header>

      {error ? <StatusMessage tone="danger">{error}</StatusMessage> : null}

      {adding ? (
        <form
          onSubmit={handleAddMember}
          className="grid gap-4 rounded-card border border-edge bg-surface p-5"
        >
          <h3 className="m-0 font-serif type-heading-xs font-semibold text-ink">
            Add team member
          </h3>
          <div className="grid gap-4 min-[36rem]:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="new-member-name" className="type-ui-sm font-semibold text-ink">
                Display name <span className="text-danger">*</span>
              </label>
              <input
                id="new-member-name"
                value={newName}
                maxLength={LIMITS.name}
                required
                placeholder="e.g. Alex"
                onChange={(e) => setNewName(e.target.value)}
                className={inputStyles}
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="new-member-pillar" className="type-ui-sm font-semibold text-ink">
                Pillar <span className="text-danger">*</span>
              </label>
              <select
                id="new-member-pillar"
                value={newPillar}
                onChange={(e) => setNewPillar(e.target.value as Pillar)}
                className={inputStyles}
              >
                {PILLARS.map((pillar) => (
                  <option key={pillar} value={pillar}>
                    {pillar} · {PILLAR_FULL[pillar]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="submit"
              disabled={!newName.trim() || busyId === "add"}
              className={primaryButtonStyles}
            >
              {busyId === "add" ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              <span>{busyId === "add" ? "Adding…" : "Create & edit profile"}</span>
            </button>
          </div>
        </form>
      ) : null}

      <ul className="m-0 grid list-none gap-2.5 p-0">
        {members.map((member, index) => {
          const status = memberCompleteness(member);
          const hasDraft = hasDraftIds.has(member.id);
          const missing: string[] = [];
          if (!status.photo) missing.push("photo");
          if (!status.projects) missing.push("projects");
          if (!status.links) missing.push("links");
          if (!status.bio) missing.push("bio");
          if (!status.skills) missing.push("skills");

          return (
            <li
              key={member.id}
              data-pillar={member.pillar}
              className={cn(
                "ui-card-interactive flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-card border border-edge bg-surface px-4 py-3.5",
                member.hidden && "opacity-70",
              )}
            >
              <div className="grid min-w-0 flex-1 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-body font-semibold text-ink">
                    {member.name}
                  </span>
                  <PillarBadge pillar={member.pillar}>{member.pillar}</PillarBadge>
                  {member.hidden ? (
                    <span className="rounded-chip border border-edge bg-surface-muted px-2 py-0.5 type-micro font-semibold text-ink-secondary">
                      Hidden
                    </span>
                  ) : null}
                  {hasDraft ? (
                    <span className="rounded-chip border border-warning/40 bg-warning-surface px-2 py-0.5 type-micro font-semibold text-warning">
                      Local draft
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 type-ui-sm text-ink-secondary">
                  <span className="tabular font-medium">
                    {status.score}/{status.total} complete
                  </span>
                  {missing.length > 0 ? (
                    <span className="text-ink-muted">Missing: {missing.join(", ")}</span>
                  ) : (
                    <span className="text-success">Profile ready</span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`Edit ${member.name}`}
                  onClick={() => onEditMember(member.id)}
                  className={cn(quietButtonStyles, "min-h-10 px-3 py-1.5")}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleToggleHidden(member)}
                  disabled={busyId !== null}
                  aria-label={
                    member.hidden
                      ? `Show ${member.name} on public site`
                      : `Hide ${member.name} from public site`
                  }
                  title={member.hidden ? "Show on public site" : "Hide from public site"}
                  className={iconButtonStyles}
                >
                  {busyId === member.id ? (
                    <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : member.hidden ? (
                    <Eye className="size-4" aria-hidden="true" />
                  ) : (
                    <EyeOff className="size-4" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => void handleReorder(index, -1)}
                  disabled={index === 0 || busyId !== null}
                  aria-label={`Move ${member.name} up`}
                  className={iconButtonStyles}
                >
                  <ChevronUp className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleReorder(index, 1)}
                  disabled={index === members.length - 1 || busyId !== null}
                  aria-label={`Move ${member.name} down`}
                  className={iconButtonStyles}
                >
                  <ChevronDown className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(member)}
                  disabled={members.length <= 1 || busyId !== null}
                  aria-label={`Delete ${member.name}`}
                  title={members.length <= 1 ? "Cannot delete the last remaining member" : `Delete ${member.name}`}
                  className={cn(iconButtonStyles, "hover:text-danger")}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete ${deleteTarget.name}?` : "Delete member?"}
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.name}'s profile and uploaded photos from Cloudflare KV. Use Hide instead if you only want to remove them from the public site temporarily.`
            : undefined
        }
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={() => void confirmDeleteMember()}
        cancelLabel="Cancel"
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
