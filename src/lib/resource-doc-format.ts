/**
 * Resource Library document format.
 *
 * Teacher-editable guides/templates are stored as plain text in the
 * `resource_docs.body` column using a small set of line conventions.
 * This module parses that text into renderable blocks. Keep the cheat
 * sheet on the edit screen in sync with these rules:
 *
 *   # Heading            section heading
 *   - item               bullet list (consecutive lines group together)
 *   1. item              numbered steps (consecutive lines group together)
 *   [ ] item             checklist (consecutive lines group together)
 *   ! text               highlighted tip callout
 *   @ Label | hint       template field card
 *   anything else        paragraph — the first paragraph is the intro
 *   (blank line)         separates sections
 */

export type ResourceBlock =
  | { type: "intro"; text: string }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "steps"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "checklist"; items: string[] }
  | { type: "field"; label: string; hint: string };

export interface ResourceDocRow {
  id: string;
  slug: string;
  kind: "guide" | "template";
  title: string;
  summary: string;
  stage: string | null;
  sort_order: number;
  body: string;
  updated_at: string;
}

export function resourceSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const STEP_RE = /^\d+\.\s+/;

export function parseResourceBody(body: string): ResourceBlock[] {
  const lines = body.split("\n");
  const at = (n: number) => (lines[n] ?? "").trim();
  const blocks: ResourceBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = at(i);

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "heading", text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && at(i).startsWith("- ")) {
        items.push(at(i).slice(2).trim());
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    if (STEP_RE.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && STEP_RE.test(at(i))) {
        items.push(at(i).replace(STEP_RE, "").trim());
        i++;
      }
      blocks.push({ type: "steps", items });
      continue;
    }

    if (trimmed.startsWith("[ ] ") || trimmed.startsWith("[x] ")) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (at(i).startsWith("[ ] ") || at(i).startsWith("[x] "))
      ) {
        items.push(at(i).slice(4).trim());
        i++;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    if (trimmed.startsWith("! ")) {
      blocks.push({ type: "tip", text: trimmed.slice(2).trim() });
      i++;
      continue;
    }

    if (trimmed.startsWith("@ ")) {
      const rest = trimmed.slice(2);
      const sep = rest.indexOf("|");
      const label = (sep === -1 ? rest : rest.slice(0, sep)).trim();
      const hint = (sep === -1 ? "" : rest.slice(sep + 1)).trim();
      blocks.push({ type: "field", label, hint });
      i++;
      continue;
    }

    // Plain paragraph — the very first one acts as the intro.
    blocks.push({
      type: blocks.length === 0 ? "intro" : "paragraph",
      text: trimmed,
    });
    i++;
  }

  return blocks;
}
