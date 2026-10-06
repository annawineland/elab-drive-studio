/**
 * Pure query logic for the Firestore data layer: parsing PostgREST-style
 * select strings and filters, evaluating them with Postgres semantics, and
 * planning the Firestore reads that can answer them.
 *
 * Firestore only gets equality and `in` filters, which never need a composite
 * index. Ranges, inequality, ordering and limits run in the browser on the
 * fetched rows — fine at classroom scale, and it keeps queries working without
 * index deployments.
 */
import type { ColumnType } from "./schema";

export type Row = Record<string, unknown>;

// ---------------------------------------------------------------- select ---

export interface SelectNode {
  star: boolean;
  columns: string[];
  embeds: EmbedNode[];
}

export interface EmbedNode {
  /** Key the embedded object appears under in the result. */
  as: string;
  /** Table name or foreign-key column named in the select string. */
  target: string;
  select: SelectNode;
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of input) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else current += char;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Parses "id, name, mods(name)", "*, missions:mission_id (title)" and nested embeds. */
export function parseSelect(input = "*"): SelectNode {
  const node: SelectNode = { star: false, columns: [], embeds: [] };
  for (const part of splitTopLevel(input)) {
    const open = part.indexOf("(");
    if (open === -1) {
      if (part === "*") node.star = true;
      else node.columns.push(part);
      continue;
    }
    if (!part.endsWith(")")) throw new Error(`Unsupported select: ${part}`);
    const head = part.slice(0, open).trim();
    const inner = part.slice(open + 1, -1);
    const [as, target] = head.includes(":") ? head.split(":").map((s) => s.trim()) : [head, head];
    if (!as || !target || target.includes("!"))
      throw new Error(`Unsupported embed in select: ${part}`);
    node.embeds.push({ as, target, select: parseSelect(inner) });
  }
  if (!node.star && node.columns.length === 0 && node.embeds.length === 0) node.star = true;
  return node;
}

// --------------------------------------------------------------- filters ---

export type FilterOp = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "is" | "in" | "like" | "ilike";

export interface Filter {
  column: string;
  op: FilterOp;
  value: unknown;
  negate?: boolean;
}

/** Top-level conditions are ANDed; an `or` group matches when any of its filters does. */
export type Condition = Filter | { or: Filter[] };

const OPS = new Set<FilterOp>(["eq", "neq", "gt", "gte", "lt", "lte", "is", "in", "like", "ilike"]);

function parseScalar(raw: string): unknown {
  const value = raw.trim();
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  return value.replace(/^"(.*)"$/, "$1");
}

/** Parses one PostgREST filter like "team_id.eq.abc", "user_id.in.(a,b)" or "x.not.is.null". */
export function parseFilter(expression: string): Filter {
  const first = expression.indexOf(".");
  if (first === -1) throw new Error(`Unsupported filter: ${expression}`);
  const column = expression.slice(0, first);
  let rest = expression.slice(first + 1);
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = (dot === -1 ? rest : rest.slice(0, dot)) as FilterOp;
  if (!OPS.has(op) || dot === -1) throw new Error(`Unsupported filter: ${expression}`);
  const raw = rest.slice(dot + 1);
  if (op === "in") {
    const list = raw.replace(/^\(/, "").replace(/\)$/, "");
    return { column, op, value: list === "" ? [] : splitTopLevel(list).map(parseScalar), negate };
  }
  return { column, op, value: parseScalar(raw), negate };
}

export function parseOr(expression: string): { or: Filter[] } {
  const parts = splitTopLevel(expression);
  if (parts.some((p) => /^(and|or)\(/.test(p)))
    throw new Error(`Nested and()/or() filters are not supported: ${expression}`);
  return { or: parts.map(parseFilter) };
}

/** Coerces a filter value to the stored type, as Postgres casts a literal to the column type. */
export function coerce(value: unknown, type: ColumnType | undefined): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((v) => coerce(v, type));
  if (type === "int") return typeof value === "number" ? value : Number(value);
  if (type === "bool") return value === true || value === "true";
  if (type === "json") return value;
  return String(value);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

function likeToRegExp(pattern: string, insensitive: boolean): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, insensitive ? "is" : "s");
}

/** Evaluates one filter the way Postgres would: comparisons against NULL never match. */
export function matchesFilter(row: Row, filter: Filter): boolean {
  const actual = row[filter.column] ?? null;
  let result: boolean;
  switch (filter.op) {
    case "is":
      result = filter.value === null ? actual === null : actual === filter.value;
      break;
    case "in":
      result = actual !== null && (filter.value as unknown[]).some((v) => v === actual);
      break;
    case "eq":
      result = actual !== null && actual === filter.value;
      break;
    case "neq":
      result = actual !== null && actual !== filter.value;
      break;
    case "gt":
      result = actual !== null && compare(actual, filter.value) > 0;
      break;
    case "gte":
      result = actual !== null && compare(actual, filter.value) >= 0;
      break;
    case "lt":
      result = actual !== null && compare(actual, filter.value) < 0;
      break;
    case "lte":
      result = actual !== null && compare(actual, filter.value) <= 0;
      break;
    case "like":
    case "ilike":
      result =
        actual !== null &&
        likeToRegExp(String(filter.value), filter.op === "ilike").test(String(actual));
      break;
  }
  // `not.is.null` is the one negation Postgres answers with a plain boolean.
  if (!filter.negate) return result;
  if (filter.op === "is") return !result;
  return actual !== null && !result;
}

export function matchesAll(row: Row, conditions: Condition[]): boolean {
  return conditions.every((c) =>
    "or" in c ? c.or.some((f) => matchesFilter(row, f)) : matchesFilter(row, c),
  );
}

// -------------------------------------------------------------- ordering ---

export interface Order {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

/** Sorts like Postgres: ascending puts NULLs last, descending puts them first. */
export function sortRows(rows: Row[], orders: Order[]): Row[] {
  if (orders.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, ascending, nullsFirst = !ascending } of orders) {
      const x = a[column] ?? null;
      const y = b[column] ?? null;
      if (x === null && y === null) continue;
      if (x === null) return nullsFirst ? -1 : 1;
      if (y === null) return nullsFirst ? 1 : -1;
      const diff = compare(x, y);
      if (diff !== 0) return ascending ? diff : -diff;
    }
    return 0;
  });
}

// -------------------------------------------------------------- planning ---

/** Equality constraints one Firestore read can enforce, plus at most one `in` list. */
export interface Branch {
  eq: Record<string, unknown>;
  in?: { column: string; values: unknown[] };
}

/** Rows a caller may see: any of these equality sets (null = no restriction). */
export type Scope = Array<Record<string, unknown>> | null;

/** Firestore caps `in` lists at 30 values. */
export const IN_LIMIT = 30;

type Constraint = Map<string, Set<unknown>>;

function pushdown(filter: Filter): [string, unknown[]] | undefined {
  if (filter.negate) return undefined;
  if (filter.op === "eq") return [filter.column, [filter.value]];
  if (filter.op === "is" && filter.value === null) return [filter.column, [null]];
  if (filter.op === "in") return [filter.column, filter.value as unknown[]];
  return undefined;
}

function constrain(base: Constraint, column: string, values: unknown[]): Constraint | undefined {
  const next = new Map(base);
  const existing = next.get(column);
  const allowed = new Set(existing ? values.filter((v) => existing.has(v)) : values);
  if (allowed.size === 0) return undefined;
  next.set(column, allowed);
  return next;
}

/**
 * Turns conditions and the caller's scope into the reads to run. The result
 * is a union: each branch is one Firestore query (or document read), and every
 * row still gets checked against all conditions afterwards.
 *
 * With a scope, `in` lists become one equality read per value, because the
 * security rules have to prove each read is allowed and do that best on
 * single values (team_id == X lets them look up team_members/X_uid).
 */
export function planBranches(conditions: Condition[], scope: Scope): Branch[] {
  let constraints: Constraint[] = [new Map()];
  const groups: Array<Array<[string, unknown[]] | undefined>> = [];

  for (const condition of conditions) {
    if ("or" in condition) {
      groups.push(condition.or.map(pushdown));
      continue;
    }
    const pushed = pushdown(condition);
    if (!pushed) continue;
    constraints = constraints.flatMap((c) => constrain(c, ...pushed) ?? []);
  }

  for (const alternatives of groups) {
    // An alternative we can't push down leaves the branch unconstrained by this group.
    if (alternatives.some((a) => a === undefined)) continue;
    constraints = constraints.flatMap((c) =>
      alternatives.flatMap((a) => constrain(c, ...(a as [string, unknown[]])) ?? []),
    );
  }

  if (scope !== null) {
    constraints = constraints.flatMap((c) =>
      scope.flatMap((alternative) => {
        let next: Constraint | undefined = c;
        for (const [column, value] of Object.entries(alternative)) {
          next = next && constrain(next, column, [value]);
        }
        return next ?? [];
      }),
    );
  }

  const branches: Branch[] = [];
  const seen = new Set<string>();
  for (const constraint of constraints) {
    let partial: Branch[] = [{ eq: {} }];
    for (const [column, values] of constraint) {
      const list = [...values];
      const keepAsIn = scope === null && list.length > 1 && partial.every((b) => !b.in);
      partial = partial.flatMap((branch) => {
        if (list.length === 1) return [{ ...branch, eq: { ...branch.eq, [column]: list[0] } }];
        if (keepAsIn) {
          const chunks: Branch[] = [];
          for (let i = 0; i < list.length; i += IN_LIMIT)
            chunks.push({ ...branch, in: { column, values: list.slice(i, i + IN_LIMIT) } });
          return chunks;
        }
        return list.map((value) => ({ ...branch, eq: { ...branch.eq, [column]: value } }));
      });
    }
    for (const branch of partial) {
      const signature = JSON.stringify([
        Object.entries(branch.eq).sort(([a], [b]) => a.localeCompare(b)),
        branch.in ?? null,
      ]);
      if (seen.has(signature)) continue;
      seen.add(signature);
      branches.push(branch);
    }
  }
  return branches;
}

// ------------------------------------------------------------ projection ---

/** Keeps the selected columns of a row; embeds are attached by the caller. */
export function project(row: Row, select: SelectNode): Row {
  if (select.star) {
    const copy: Row = { ...row };
    for (const embed of select.embeds) delete copy[embed.as];
    return copy;
  }
  const out: Row = {};
  for (const column of select.columns) {
    const [as, source] = column.includes(":")
      ? column.split(":").map((s) => s.trim())
      : [column, column];
    out[as!] = row[source!] ?? null;
  }
  return out;
}
