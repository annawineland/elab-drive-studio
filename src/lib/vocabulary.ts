/**
 * Vocabulary lookup.
 *
 * The teacher-editable "Vocabulary Guide" document in the Resource Library is
 * the single source of truth. Its bullet lines use the form:
 *
 *   - Term — plain-English definition
 *
 * We parse those into a term -> definition map so mission text and notebook
 * instructions can link terms inline. Because the map is derived from the same
 * resource_docs row the library renders, teacher edits flow through
 * automatically (the library subscribes to realtime updates).
 */

import { useQuery } from "@tanstack/react-query";
import { resourceDocsQueryOptions } from "@/lib/resource-queries";
import { parseResourceBody } from "@/lib/resource-doc-format";

export const VOCAB_SLUG = "vocabulary-guide";

export interface VocabTerm {
  term: string;
  definition: string;
  /** Section heading the term was listed under, when there is one. */
  group: string | null;
}

/** Accepts em dash, en dash, or " - " as the term/definition separator. */
const SEPARATOR = /\s+(?:—|–|-{1,2})\s+/;

export function parseVocabulary(body: string): VocabTerm[] {
  const blocks = parseResourceBody(body);
  const terms: VocabTerm[] = [];
  let group: string | null = null;

  for (const block of blocks) {
    if (block.type === "heading") {
      group = block.text;
      continue;
    }
    if (block.type !== "list") continue;
    for (const item of block.items) {
      const match = item.match(SEPARATOR);
      if (!match || match.index === undefined) continue;
      const term = item.slice(0, match.index).trim();
      const definition = item.slice(match.index + match[0].length).trim();
      if (!term || !definition) continue;
      terms.push({ term, definition, group });
    }
  }
  return terms;
}

export interface VocabIndex {
  terms: VocabTerm[];
  /** Lowercased term -> entry, including simple plural forms. */
  lookup: Map<string, VocabTerm>;
  /** Matches any known term, longest first. Null when there is no vocabulary. */
  pattern: RegExp | null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildVocabIndex(terms: VocabTerm[]): VocabIndex {
  const lookup = new Map<string, VocabTerm>();
  for (const entry of terms) {
    const key = entry.term.toLowerCase();
    if (!lookup.has(key)) lookup.set(key, entry);
    // Naive plural so "prototypes" / "constraints" still match.
    const plural = key.endsWith("s") ? `${key}es` : `${key}s`;
    if (!lookup.has(plural)) lookup.set(plural, entry);
  }

  const keys = [...lookup.keys()].sort((a, b) => b.length - a.length);
  const pattern = keys.length
    ? new RegExp(`\\b(${keys.map(escapeRegExp).join("|")})\\b`, "gi")
    : null;

  return { terms, lookup, pattern };
}

const EMPTY_INDEX: VocabIndex = { terms: [], lookup: new Map(), pattern: null };

/** Vocabulary index derived from the Resource Library document. */
export function useVocabulary(): VocabIndex {
  const { data } = useQuery({
    ...resourceDocsQueryOptions(),
    select: (docs) => {
      const doc = docs.find((d) => d.slug === VOCAB_SLUG);
      return doc ? buildVocabIndex(parseVocabulary(doc.body)) : EMPTY_INDEX;
    },
  });
  return data ?? EMPTY_INDEX;
}
