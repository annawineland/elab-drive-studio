// Missions can carry an optional Resource Library attachment (guide or template).
// It is stored at the end of the mission description as a marker line so no
// schema change is needed: [[resource:slug|Title]]

export interface MissionAttachment {
  slug: string;
  title: string;
}

const MARKER = /\[\[resource:([a-z0-9-]+)\|([^\]]+)\]\]/i;

export function encodeMissionAttachment(slug: string, title: string) {
  return `[[resource:${slug}|${title}]]`;
}

export function parseMissionDescription(description: string | null | undefined): {
  text: string;
  attachment: MissionAttachment | null;
} {
  if (!description) return { text: "", attachment: null };
  const match = description.match(MARKER);
  if (!match) return { text: description, attachment: null };
  return {
    text: description.replace(MARKER, "").trimEnd(),
    attachment: { slug: match[1] ?? "", title: match[2] ?? "" },
  };
}
