export interface ParsedProjectBullet {
  text: string;
  sublines: string[];
}

export interface ParsedProjectDetail {
  intro: string[];
  bullets: ParsedProjectBullet[];
}

const BULLET_PREFIX_RE = /^[-•*]\s+(.+)$/;

export function parseProjectDetail(detail: string): ParsedProjectDetail {
  const lines = detail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const intro: string[] = [];
  const bullets: ParsedProjectBullet[] = [];

  for (const line of lines) {
    const bulletMatch = BULLET_PREFIX_RE.exec(line);
    if (bulletMatch) {
      bullets.push({ text: bulletMatch[1].trim(), sublines: [] });
    } else if (bullets.length > 0) {
      bullets[bullets.length - 1].sublines.push(line);
    } else {
      intro.push(line);
    }
  }

  return { intro, bullets };
}

export function splitDetailForEditor(detail: string): {
  summary: string;
  points: string[];
} {
  const { intro, bullets } = parseProjectDetail(detail);
  return {
    summary: intro.join("\n"),
    points: bullets.map((b) => [b.text, ...b.sublines].join("\n")),
  };
}

export function serializeDetailFromEditor(summary: string, points: string[]): string {
  const parts: string[] = [];

  const summaryLines = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (summaryLines.length > 0) {
    parts.push(summaryLines.join("\n"));
  }

  for (const point of points) {
    const lines = point
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0].replace(/^[-•*]\s+/, "").trim();
    if (!first) continue;
    const rest = lines.slice(1);
    parts.push(rest.length > 0 ? `- ${first}\n${rest.join("\n")}` : `- ${first}`);
  }

  return parts.join("\n");
}
