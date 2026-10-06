import { Fragment, useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useVocabulary, VOCAB_SLUG, type VocabTerm } from "@/lib/vocabulary";

function TermChip({ label, entry }: { label: string; entry: VocabTerm }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm underline decoration-primary/50 decoration-dotted underline-offset-4 transition-colors hover:bg-primary/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`What does ${entry.term} mean?`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 text-left">
        <div className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
          <p className="text-sm font-semibold text-foreground">{entry.term}</p>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{entry.definition}</p>
        <Link
          to="/resources/$slug"
          params={{ slug: VOCAB_SLUG }}
          search={{ edit: false }}

          className="inline-block text-xs font-medium text-primary hover:underline"
        >
          Open the Vocabulary Guide →
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Renders plain text with any Vocabulary Guide term turned into a clickable
 * chip that pops up its definition. Only the first appearance of each term in
 * a block is linked so paragraphs stay readable.
 */
export function VocabText({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const { lookup, pattern } = useVocabulary();

  const nodes = useMemo<ReactNode[]>(() => {
    const value = text ?? "";
    if (!value || !pattern) return [value];

    const out: ReactNode[] = [];
    const seen = new Set<string>();
    const re = new RegExp(pattern.source, pattern.flags);
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = re.exec(value)) !== null) {
      const raw = match[0];
      const key = raw.toLowerCase();
      const entry = lookup.get(key);
      if (!entry || seen.has(entry.term)) continue;
      seen.add(entry.term);
      if (match.index > last) out.push(value.slice(last, match.index));
      out.push(<TermChip key={`${entry.term}-${match.index}`} label={raw} entry={entry} />);
      last = match.index + raw.length;
    }
    if (last < value.length) out.push(value.slice(last));
    return out;
  }, [text, pattern, lookup]);

  return (
    <span className={cn("whitespace-pre-line", className)}>
      {nodes.map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </span>
  );
}
