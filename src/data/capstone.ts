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
  title: "Lockheed Summer Internship — SUTD Capstone",
  pillarsLabel: "EPD · ESD · CSD",
  overview:
    "Seven final-year students from the Singapore University of Technology and Design across Engineering Product Development, Engineering Systems and Design, and Computer Science and Design.",
  note: "Placeholder bios, skillsets & contact — update details in src/data/capstone.ts.",
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
    "SUTD Capstone (Lockheed Summer Internship) — Industry Partnership Inquiry",
  showcaseUrl: "https://capstoneshowcase.sutd.edu.sg/",
  showcaseLabel: "Past SUTD Capstone Projects",
  closingNote:
    "Questions or a project in mind? Let's schedule a short call — we look forward to hearing from you.",
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

// Roster names and pillars updated (1 ESD, 3 CSD, 3 EPD); roles, bios, skillsets, and interests remain pillar-matched placeholders pending individual details.
const RAW_TEAM_MEMBERS: TeamMemberInput[] = [
  {
    id: "member-01",
    index: "01",
    name: "Soe Khant",
    pillar: "ESD",
    pillarFull: "Engineering Systems & Design",
    role: "Optimization & Modeling",
    bio: "Focuses on operations research, discrete-event simulation, and decision analytics.",
    skillsets: [
      "Optimization",
      "Simulation",
      "Python",
      "Queueing Models",
      "Data Analysis",
    ],
    interests: [
      "Urban Systems",
      "Operations Research",
      "Cartography",
      "Running",
    ],
  },
  {
    id: "member-02",
    index: "02",
    name: "Jin Hng",
    pillar: "CSD",
    pillarFull: "Computer Science & Design",
    role: "Frontend & Interaction",
    bio: "Focuses on web interfaces, interaction design, and accessible user experiences.",
    skillsets: [
      "React",
      "TypeScript",
      "Tailwind CSS",
      "UI Systems",
      "Accessibility",
    ],
    interests: [
      "Interaction Design",
      "Typography",
      "Photography",
      "Specialty Coffee",
    ],
  },
  {
    id: "member-03",
    index: "03",
    name: "Harsha",
    pillar: "CSD",
    pillarFull: "Computer Science & Design",
    role: "Backend & Infrastructure",
    bio: "Focuses on APIs, distributed services, databases, and reliable deployment workflows.",
    skillsets: ["Node.js", "Go", "PostgreSQL", "Docker", "Distributed Systems"],
    interests: [
      "Systems Architecture",
      "Embedded Linux",
      "Self-Hosting",
      "Hiking",
    ],
  },
  {
    id: "member-04",
    index: "04",
    name: "Vikas",
    pillar: "CSD",
    pillarFull: "Computer Science & Design",
    role: "Applied AI & Data",
    bio: "Focuses on machine learning models, computer vision, and practical evaluation pipelines.",
    skillsets: [
      "PyTorch",
      "Computer Vision",
      "ONNX",
      "Time-Series ML",
      "Model Evaluation",
    ],
    interests: [
      "Edge AI",
      "Multimodal Models",
      "Badminton",
      "Music Production",
    ],
  },
  {
    id: "member-05",
    index: "05",
    name: "Nicholas",
    pillar: "EPD",
    pillarFull: "Engineering Product Development",
    role: "Hardware & Mechatronics",
    bio: "Focuses on mechanical design, physical prototyping, and electro-mechanical integration.",
    skillsets: [
      "SolidWorks",
      "CAD & DFMA",
      "CNC & 3D Printing",
      "Actuation",
      "Mechanical Testing",
    ],
    interests: ["Robotics", "Industrial Design", "Cycling", "Woodworking"],
  },
  {
    id: "member-06",
    index: "06",
    name: "Jayden",
    pillar: "EPD",
    pillarFull: "Engineering Product Development",
    role: "Electronics & Embedded Systems",
    bio: "Focuses on PCB design, sensor acquisition, power electronics, and low-level firmware.",
    skillsets: [
      "KiCad PCB",
      "Embedded C",
      "FreeRTOS",
      "Sensor Fusion",
      "Signal Processing",
    ],
    interests: [
      "Open Hardware",
      "Analog Circuits",
      "Bouldering",
      "Film Photography",
    ],
  },
  {
    id: "member-07",
    index: "07",
    name: "Harish",
    pillar: "EPD",
    pillarFull: "Engineering Product Development",
    role: "Product Design & Prototyping",
    bio: "Focuses on industrial design, physical prototyping, control systems, and field validation.",
    skillsets: [
      "Product Design",
      "CAD Modeling",
      "Rapid Prototyping",
      "Control Systems",
      "Testing & QA",
    ],
    interests: [
      "Human-Centered Design",
      "Autonomous Systems",
      "Sustainability",
      "Cooking",
    ],
  },
];

const seenSlugs = new Set<string>();
export const TEAM_MEMBERS: TeamMember[] = RAW_TEAM_MEMBERS.map((member) => {
  const baseSlug = member.slug ?? toMemberSlug(member.name, member.id);
  const slug = seenSlugs.has(baseSlug)
    ? `${baseSlug}-${member.index}`
    : baseSlug;
  seenSlugs.add(slug);
  return { ...member, slug };
});
