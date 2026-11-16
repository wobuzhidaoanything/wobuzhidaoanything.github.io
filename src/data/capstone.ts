export type Pillar = 'CSD' | 'EPD' | 'ESD'

export type FilterOption = 'All' | Pillar

export interface TeamMember {
  id: string
  index: string
  slug: string
  name: string
  pillar: Pillar
  pillarFull: string
  role: string
  bio: string
  skillsets: string[]
  interests: string[]
}

export const PILLAR_FILTERS: {
  id: FilterOption
  label: string
}[] = [
  { id: 'All', label: 'All' },
  { id: 'CSD', label: 'CSD' },
  { id: 'EPD', label: 'EPD' },
  { id: 'ESD', label: 'ESD' },
]

export const GROUP_META = {
  code: 'Group 07',
  institution: 'SUTD Capstone',
  title: 'Group 07 — SUTD Capstone',
  pillarsLabel: 'EPD · ESD · CSD',
  overview:
    'Seven final-year students from the Singapore University of Technology and Design across Engineering Product Development, Engineering Systems and Design, and Computer Science and Design.',
  note: 'Placeholder roster — update member details in src/data/capstone.ts.',
}

export const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'member-01',
    index: '01',
    slug: 'member-01',
    name: 'Member 01',
    pillar: 'CSD',
    pillarFull: 'Computer Science & Design',
    role: 'Frontend & Interaction',
    bio: 'Focuses on web interfaces, interaction design, and accessible user experiences.',
    skillsets: ['React', 'TypeScript', 'Tailwind CSS', 'UI Systems', 'Accessibility'],
    interests: ['Interaction Design', 'Typography', 'Photography', 'Specialty Coffee'],
  },
  {
    id: 'member-02',
    index: '02',
    slug: 'member-02',
    name: 'Member 02',
    pillar: 'EPD',
    pillarFull: 'Engineering Product Development',
    role: 'Hardware & Mechatronics',
    bio: 'Focuses on mechanical design, physical prototyping, and electro-mechanical integration.',
    skillsets: ['SolidWorks', 'CAD & DFMA', 'CNC & 3D Printing', 'Actuation', 'Mechanical Testing'],
    interests: ['Robotics', 'Industrial Design', 'Cycling', 'Woodworking'],
  },
  {
    id: 'member-03',
    index: '03',
    slug: 'member-03',
    name: 'Member 03',
    pillar: 'ESD',
    pillarFull: 'Engineering Systems & Design',
    role: 'Optimization & Modeling',
    bio: 'Focuses on operations research, discrete-event simulation, and decision analytics.',
    skillsets: ['Optimization', 'Simulation', 'Python', 'Queueing Models', 'Data Analysis'],
    interests: ['Urban Systems', 'Operations Research', 'Cartography', 'Running'],
  },
  {
    id: 'member-04',
    index: '04',
    slug: 'member-04',
    name: 'Member 04',
    pillar: 'CSD',
    pillarFull: 'Computer Science & Design',
    role: 'Backend & Infrastructure',
    bio: 'Focuses on APIs, distributed services, databases, and reliable deployment workflows.',
    skillsets: ['Node.js', 'Go', 'PostgreSQL', 'Docker', 'Distributed Systems'],
    interests: ['Systems Architecture', 'Embedded Linux', 'Self-Hosting', 'Hiking'],
  },
  {
    id: 'member-05',
    index: '05',
    slug: 'member-05',
    name: 'Member 05',
    pillar: 'EPD',
    pillarFull: 'Engineering Product Development',
    role: 'Electronics & Embedded Systems',
    bio: 'Focuses on PCB design, sensor acquisition, power electronics, and low-level firmware.',
    skillsets: ['KiCad PCB', 'Embedded C', 'FreeRTOS', 'Sensor Fusion', 'Signal Processing'],
    interests: ['Open Hardware', 'Analog Circuits', 'Bouldering', 'Film Photography'],
  },
  {
    id: 'member-06',
    index: '06',
    slug: 'member-06',
    name: 'Member 06',
    pillar: 'CSD',
    pillarFull: 'Computer Science & Design',
    role: 'Applied AI & Data',
    bio: 'Focuses on machine learning models, computer vision, and practical evaluation pipelines.',
    skillsets: ['PyTorch', 'Computer Vision', 'ONNX', 'Time-Series ML', 'Model Evaluation'],
    interests: ['Edge AI', 'Multimodal Models', 'Badminton', 'Music Production'],
  },
  {
    id: 'member-07',
    index: '07',
    slug: 'member-07',
    name: 'Member 07',
    pillar: 'ESD',
    pillarFull: 'Engineering Systems & Design',
    role: 'Systems & User Research',
    bio: 'Focuses on socio-technical systems, field validation, and human-factors design.',
    skillsets: ['Systems Design', 'UX Research', 'Lifecycle Analysis', 'R / Python', 'Testing QA'],
    interests: ['Human-Centered Systems', 'Sustainability', 'Kayaking', 'Cooking'],
  },
]
