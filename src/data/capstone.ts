export type Pillar = "CSD" | "EPD" | "ESD";

export type FilterOption = "All" | Pillar;

export interface ArtifactHotspot {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
}

export interface MemberArtifacts {
  heroImage?: string;
  secondaryImage?: string;
  caption?: string;
  alt?: string;
  lenses?: {
    id: string;
    label: string;
    summary: string;
  }[];
  hotspots?: ArtifactHotspot[];
}

export interface MemberProject {
  title: string;
  detail: string;
}

export interface TeamMember {
  id: string;
  index: string;
  slug: string;
  name: string;
  pillar: Pillar;
  pillarFull: string;
  role: string;
  bio: string;
  skillsets: string[];
  interests: string[];
  artifacts?: MemberArtifacts;
  // Profile template fields: photo → artifacts.heroImage, NAME → fullName,
  // MAJOR → pillar + minor, skills → skillsets / tools / projects.
  fullName?: string;
  minor?: string;
  tools?: string[];
  projects?: MemberProject[];
}

export const PILLAR_FILTERS: {
  id: FilterOption;
  label: string;
}[] = [
  { id: "All", label: "All" },
  { id: "CSD", label: "CSD" },
  { id: "EPD", label: "EPD" },
  { id: "ESD", label: "ESD" },
];

export const GROUP_META = {
  code: "Lockheed Summer Internship",
  institution: "SUTD Capstone",
  title: "Lockheed Summer Internship: SUTD Capstone",
  pillarsLabel: "EPD · ESD · CSD",
  overview:
    "Seven final-year students from the Singapore University of Technology and Design across Engineering Product Development, Engineering Systems and Design, and Computer Science and Design.",
  note: "Placeholder bios, skillsets & contact: update details in src/data/members.json.",
};

export const PARTNER_OUTREACH = {
  kicker: "Capstone 2027–2028 · Industry Partnership",
  heading: "Thank you for reading.",
  lead: "If there's a challenge on your backlog or an idea your team hasn't had the bandwidth to explore, we'd welcome the chance to tackle it for our SUTD Capstone. Please reach out if you have any questions or want to work with us.",
  benefitsHeading: "What your team gets",
  benefits: [
    {
      index: "01",
      title: "Two-term delivery (Sep 2027 – Apr 2028)",
      detail:
        "Focused execution across two terms, covering everything from physical prototypes to data analysis and software.",
    },
    {
      index: "02",
      title: "Full ownership of all IP and deliverables",
      detail:
        "Your organisation retains complete intellectual property rights and ownership over everything produced during the project.",
    },
    {
      index: "03",
      title: "Early access to graduating talent",
      detail:
        "Work closely with final-year students across engineering, data, and software whom you could later consider hiring.",
    },
  ],
  termsHeading: "Commitment & timeline",
  terms: [
    {
      index: "01",
      title: "Mentor & S$6,000 participation fee",
      detail:
        "Includes a company mentor for occasional check-ins and a S$6,000 (incl. GST) participation fee across both terms.",
    },
    {
      index: "02",
      title: "Up to S$4,000 materials funding",
      detail:
        "SUTD additionally provides up to S$4,000 in project materials support for prototypes and tooling (Sep 2027 – Apr 2028).",
    },
    {
      index: "03",
      title: "Connect within the next few weeks",
      detail:
        "Partners need time to review agreement terms with SUTD's Capstone Office, so we're hoping to schedule a short call soon.",
    },
  ],
  contactEmail: "capstone-lockheed@example.com",
  emailSubject:
    "SUTD Capstone (Lockheed Summer Internship): Industry Partnership Inquiry",
  showcaseUrl: "https://capstoneshowcase.sutd.edu.sg/",
  showcaseLabel: "Past SUTD Capstone Projects",
  closingNote:
    "Questions or a project in mind? Let's schedule a short call. We look forward to hearing from you.",
};

type TeamMemberInput = Omit<TeamMember, "slug"> & { slug?: string };

function toMemberSlug(name: string, fallbackId: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || fallbackId;
}

// Single source of truth for member details lives in members.json so the
// update_details form can write it via the Worker. Keep the JSON shape in
// sync with TeamMemberInput below.
import rawMembersJson from "./members.json" with { type: "json" };

const RAW_TEAM_MEMBERS: TeamMemberInput[] =
  rawMembersJson as unknown as TeamMemberInput[];


const seenSlugs = new Set<string>();
export const TEAM_MEMBERS: TeamMember[] = RAW_TEAM_MEMBERS.map((member) => {
  const baseSlug = member.slug ?? toMemberSlug(member.name, member.id);
  const slug = seenSlugs.has(baseSlug)
    ? `${baseSlug}-${member.index}`
    : baseSlug;
  seenSlugs.add(slug);
  return { ...member, slug };
});
