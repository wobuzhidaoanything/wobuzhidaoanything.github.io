import type { MemberArtifacts, MemberProject, Pillar, TeamMember } from "@/data/capstone";

export interface EditorForm {
  name: string;
  pillar: Pillar;
  pillarFull: string;
  minor: string;
  role: string;
  bio: string;
  skillsetsText: string;
  interestsText: string;
  toolsText: string;
  projects: MemberProject[];
  caption: string;
  alt: string;
}

export const LIMITS = {
  name: 60,
  pillarFull: 80,
  minor: 80,
  role: 80,
  bio: 600,
  listItem: 40,
  listCount: 12,
  projectTitle: 80,
  projectDetail: 300,
  projectCount: 12,
  caption: 160,
  alt: 160,
} as const;

export const PILLAR_FULL: Record<Pillar, string> = {
  CSD: "Computer Science & Design",
  EPD: "Engineering Product Development",
  ESD: "Engineering Systems & Design",
};

export function parseList(text: string): string[] {
  return [...new Set(text.split("\n").map((v) => v.trim()).filter(Boolean))];
}

export function serializeList(list: string[] | undefined): string {
  return (list ?? []).join("\n");
}

export function formFromMember(member: TeamMember): EditorForm {
  return {
    name: member.name,
    pillar: member.pillar,
    pillarFull: member.pillarFull,
    minor: member.minor ?? "",
    role: member.role,
    bio: member.bio,
    skillsetsText: serializeList(member.skillsets),
    interestsText: serializeList(member.interests),
    toolsText: serializeList(member.tools),
    projects: (member.projects ?? []).map((p) => ({ title: p.title, detail: p.detail })),
    caption: member.artifacts?.caption ?? "",
    alt: member.artifacts?.alt ?? "",
  };
}

export function formsEqual(a: EditorForm, b: EditorForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type FormField =
  | "name"
  | "pillarFull"
  | "minor"
  | "role"
  | "bio"
  | "skillsets"
  | "interests"
  | "tools"
  | "projects"
  | "caption"
  | "alt";

export type FormErrors = Partial<Record<FormField, string>>;

export const FIELD_ELEMENT_IDS: Record<FormField, string> = {
  name: "member-name",
  pillarFull: "member-pillarfull",
  minor: "member-minor",
  role: "member-role",
  bio: "member-bio",
  skillsets: "member-skills",
  interests: "member-interests",
  tools: "member-tools",
  projects: "projects-editor",
  caption: "member-caption",
  alt: "member-alt",
};

function listError(text: string, label: string): string | undefined {
  const items = parseList(text);
  if (items.length > LIMITS.listCount) return `${label}: keep to ${LIMITS.listCount} items or fewer.`;
  if (items.some((item) => item.length > LIMITS.listItem))
    return `${label}: each item must be ${LIMITS.listItem} characters or fewer.`;
  return undefined;
}

function capError(value: string, max: number, label: string): string | undefined {
  return value.trim().length > max ? `${label}: keep to ${max} characters or fewer.` : undefined;
}

export function validateForm(form: EditorForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  else {
    const nameError = capError(form.name, LIMITS.name, "Name");
    if (nameError) errors.name = nameError;
  }
  const pillarFullError = capError(form.pillarFull, LIMITS.pillarFull, "Pillar full name");
  if (pillarFullError) errors.pillarFull = pillarFullError;
  const minorError = capError(form.minor, LIMITS.minor, "Minor");
  if (minorError) errors.minor = minorError;
  const roleError = capError(form.role, LIMITS.role, "Role");
  if (roleError) errors.role = roleError;
  const bioError = capError(form.bio, LIMITS.bio, "Bio");
  if (bioError) errors.bio = bioError;
  const skillsetsError = listError(form.skillsetsText, "Skillsets");
  if (skillsetsError) errors.skillsets = skillsetsError;
  const interestsError = listError(form.interestsText, "Interests");
  if (interestsError) errors.interests = interestsError;
  const toolsError = listError(form.toolsText, "Tools");
  if (toolsError) errors.tools = toolsError;
  if (form.projects.length > LIMITS.projectCount) {
    errors.projects = `Keep to ${LIMITS.projectCount} projects or fewer.`;
  } else if (form.projects.some((p) => !p.title.trim())) {
    errors.projects = "Every project needs a title. Remove empty rows or fill them in.";
  } else if (form.projects.some((p) => p.title.trim().length > LIMITS.projectTitle)) {
    errors.projects = `Project titles must be ${LIMITS.projectTitle} characters or fewer.`;
  } else if (form.projects.some((p) => p.detail.trim().length > LIMITS.projectDetail)) {
    errors.projects = `Project descriptions must be ${LIMITS.projectDetail} characters or fewer.`;
  }
  const captionError = capError(form.caption, LIMITS.caption, "Caption");
  if (captionError) errors.caption = captionError;
  const altError = capError(form.alt, LIMITS.alt, "Alt text");
  if (altError) errors.alt = altError;
  return errors;
}

export function buildPayload(form: EditorForm, member: TeamMember): Omit<TeamMember, "slug"> {
  const tools = parseList(form.toolsText);
  const projects = form.projects
    .map((p) => ({ title: p.title.trim(), detail: p.detail.trim() }))
    .filter((p) => p.title);
  // Empty strings are sent deliberately: they clear caption/alt server-side.
  const artifacts: MemberArtifacts = {
    ...member.artifacts,
    caption: form.caption.trim(),
    alt: form.alt.trim(),
  };
  const payload: Omit<TeamMember, "slug"> = {
    id: member.id,
    index: member.index,
    name: form.name.trim(),
    pillar: form.pillar,
    pillarFull: form.pillarFull.trim(),
    role: form.role.trim(),
    bio: form.bio.trim(),
    skillsets: parseList(form.skillsetsText),
    interests: parseList(form.interestsText),
    artifacts,
  };
  const minor = form.minor.trim();
  if (minor) payload.minor = minor;
  if (tools.length) payload.tools = tools;
  if (projects.length) payload.projects = projects;
  return payload;
}