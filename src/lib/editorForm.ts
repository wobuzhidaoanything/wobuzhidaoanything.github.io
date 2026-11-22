import type {
  HeroFocus,
  MemberArtifacts,
  MemberLinks,
  MemberProject,
  Pillar,
  TeamMember,
} from "@/data/capstone";

export interface EditorLinksForm {
  github: string;
  linkedin: string;
  portfolio: string;
  email: string;
}

export interface EditorProjectForm {
  title: string;
  detail: string;
  tag: string;
  url: string;
  featured: boolean;
}

export interface EditorForm {
  name: string;
  pillar: Pillar;
  minor: string;
  bio: string;
  skillsetsText: string;
  interestsText: string;
  toolsText: string;
  projects: EditorProjectForm[];
  links: EditorLinksForm;
  heroFocus: HeroFocus;
  hidden: boolean;
  caption: string;
  alt: string;
}

// Keep in sync with the Worker limits in worker/index.js. The Worker remains the
// source of truth; these only mirror it so the form can validate before submit.
export const LIMITS = {
  name: 120,
  pillarFull: 160,
  minor: 160,
  bio: 2000,
  listItem: 200,
  listCount: 24,
  projectTitle: 160,
  projectDetail: 4000,
  projectTag: 160,
  projectCount: 24,
  url: 500,
  email: 254,
  caption: 300,
  alt: 300,
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
    minor: member.minor ?? "",
    bio: member.bio,
    skillsetsText: serializeList(member.skillsets),
    interestsText: serializeList(member.interests),
    toolsText: serializeList(member.tools),
    projects: (member.projects ?? []).map((p) => ({
      title: p.title,
      detail: p.detail,
      tag: p.tag ?? "",
      url: p.url ?? "",
      featured: p.featured !== false,
    })),
    links: {
      github: member.links?.github ?? "",
      linkedin: member.links?.linkedin ?? "",
      portfolio: member.links?.portfolio ?? "",
      email: member.links?.email ?? "",
    },
    heroFocus: member.artifacts?.heroFocus ?? "center",
    hidden: Boolean(member.hidden),
    caption: member.artifacts?.caption ?? "",
    alt: member.artifacts?.alt ?? "",
  };
}

export function formsEqual(a: EditorForm, b: EditorForm): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export type EditorTabId = "basics" | "skills" | "projects" | "photos";

export type FormField =
  | "name"
  | "minor"
  | "bio"
  | "linksGithub"
  | "linksLinkedin"
  | "linksPortfolio"
  | "linksEmail"
  | "skillsets"
  | "interests"
  | "tools"
  | "projects"
  | "caption"
  | "alt";

export type FormErrors = Partial<Record<FormField, string>>;

export const FIELD_ELEMENT_IDS: Record<FormField, string> = {
  name: "member-name",
  minor: "member-minor",
  bio: "member-bio",
  linksGithub: "member-link-github",
  linksLinkedin: "member-link-linkedin",
  linksPortfolio: "member-link-portfolio",
  linksEmail: "member-link-email",
  skillsets: "member-skills",
  interests: "member-interests",
  tools: "member-tools",
  projects: "projects-editor",
  caption: "member-caption",
  alt: "member-alt",
};

export const FIELD_TAB: Record<FormField, EditorTabId> = {
  name: "basics",
  minor: "basics",
  bio: "basics",
  linksGithub: "basics",
  linksLinkedin: "basics",
  linksPortfolio: "basics",
  linksEmail: "basics",
  skillsets: "skills",
  interests: "skills",
  tools: "skills",
  projects: "projects",
  caption: "photos",
  alt: "photos",
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

export function isValidHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > LIMITS.url) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidEmail(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.length > LIMITS.email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function urlError(value: string, label: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > LIMITS.url) return `${label}: keep to ${LIMITS.url} characters or fewer.`;
  if (!isValidHttpUrl(trimmed)) return `${label}: enter a full https:// or http:// URL.`;
  return undefined;
}

export function validateForm(form: EditorForm): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  else {
    const nameError = capError(form.name, LIMITS.name, "Name");
    if (nameError) errors.name = nameError;
  }
  const minorError = capError(form.minor, LIMITS.minor, "Minor");
  if (minorError) errors.minor = minorError;
  const bioError = capError(form.bio, LIMITS.bio, "Bio");
  if (bioError) errors.bio = bioError;

  const githubErr = urlError(form.links.github, "GitHub URL");
  if (githubErr) errors.linksGithub = githubErr;
  const linkedinErr = urlError(form.links.linkedin, "LinkedIn URL");
  if (linkedinErr) errors.linksLinkedin = linkedinErr;
  const portfolioErr = urlError(form.links.portfolio, "Portfolio URL");
  if (portfolioErr) errors.linksPortfolio = portfolioErr;
  if (form.links.email.trim() && !isValidEmail(form.links.email)) {
    errors.linksEmail =
      form.links.email.trim().length > LIMITS.email
        ? `Email: keep to ${LIMITS.email} characters or fewer.`
        : "Enter a valid email address.";
  }

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
  } else if (form.projects.some((p) => p.tag.trim().length > LIMITS.projectTag)) {
    errors.projects = `Project tags must be ${LIMITS.projectTag} characters or fewer.`;
  } else if (form.projects.some((p) => p.url.trim() && !isValidHttpUrl(p.url))) {
    errors.projects = `Project links must be valid https:// or http:// URLs (${LIMITS.url} chars max).`;
  }

  const captionError = capError(form.caption, LIMITS.caption, "Caption");
  if (captionError) errors.caption = captionError;
  const altError = capError(form.alt, LIMITS.alt, "Alt text");
  if (altError) errors.alt = altError;
  return errors;
}

export function buildPayload(form: EditorForm, member: TeamMember): Omit<TeamMember, "slug"> {
  const tools = parseList(form.toolsText);
  const projects: MemberProject[] = form.projects
    .map((p) => {
      const entry: MemberProject = {
        title: p.title.trim(),
        detail: p.detail.trim(),
      };
      const tag = p.tag.trim();
      const url = p.url.trim();
      if (tag) entry.tag = tag;
      if (url) entry.url = url;
      if (p.featured === false) entry.featured = false;
      return entry;
    })
    .filter((p) => p.title);

  const links: MemberLinks = {};
  if (form.links.github.trim()) links.github = form.links.github.trim();
  if (form.links.linkedin.trim()) links.linkedin = form.links.linkedin.trim();
  if (form.links.portfolio.trim()) links.portfolio = form.links.portfolio.trim();
  if (form.links.email.trim()) links.email = form.links.email.trim();

  // Empty strings are sent deliberately: they clear caption/alt server-side.
  const artifacts: MemberArtifacts = {
    ...member.artifacts,
    heroFocus: form.heroFocus,
    caption: form.caption.trim(),
    alt: form.alt.trim(),
  };

  const payload: Omit<TeamMember, "slug"> = {
    id: member.id,
    index: member.index,
    name: form.name.trim(),
    pillar: form.pillar,
    pillarFull: PILLAR_FULL[form.pillar],
    bio: form.bio.trim(),
    skillsets: parseList(form.skillsetsText),
    interests: parseList(form.interestsText),
    artifacts,
  };
  const minor = form.minor.trim();
  if (minor) payload.minor = minor;
  if (tools.length) payload.tools = tools;
  if (projects.length) payload.projects = projects;
  if (Object.keys(links).length) payload.links = links;
  if (form.hidden) payload.hidden = true;
  return payload;
}

export interface MemberCompleteness {
  bio: boolean;
  photo: boolean;
  skills: boolean;
  projects: boolean;
  links: boolean;
  score: number;
  total: number;
}

export function memberCompleteness(member: TeamMember): MemberCompleteness {
  const bio = Boolean(member.bio?.trim());
  const photo = Boolean(member.artifacts?.heroImage);
  const skills = (member.skillsets?.length ?? 0) > 0;
  const projects = (member.projects?.length ?? 0) > 0;
  const links = Boolean(
    member.links &&
      (member.links.github || member.links.linkedin || member.links.portfolio || member.links.email),
  );
  const checks = [bio, photo, skills, projects, links];
  return {
    bio,
    photo,
    skills,
    projects,
    links,
    score: checks.filter(Boolean).length,
    total: checks.length,
  };
}
