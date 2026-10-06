/**
 * Firestore data layer with the query API the studio was written against
 * (supabase.from("entries").select("*").eq(...)), so the app's queries carry
 * over unchanged.
 *
 * It implements the part of the PostgREST builder the app uses — select
 * strings with many-to-one embeds, eq/neq/gt/gte/lt/lte/is/in/like/ilike/not/
 * or/match filters, order, limit, range, single/maybeSingle, exact counts,
 * insert/update/upsert/delete, `join_team_by_code`, and postgres_changes
 * channels — and borrows PostgREST's TypeScript types so every call keeps its
 * row types. Anything else throws "not supported".
 *
 * What Postgres did on its own happens here too:
 * - row-level security as a filter: every read is limited to the caller's scope (access.ts)
 * - column defaults, NOT NULL checks, unique keys and updated_at triggers (schema.ts)
 * - ON DELETE CASCADE / SET NULL, replayed after a delete
 * - the triggers that linked roster emails, notified teachers of mission
 *   responses, and created the join-code lookup for new teams
 */
import type { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "./types";
import { scopeFor, type Access, type AccessSource } from "./access";
import {
  coerce,
  matchesAll,
  parseFilter,
  parseOr,
  parseSelect,
  planBranches,
  project,
  sortRows,
  type Branch,
  type Condition,
  type Filter,
  type FilterOp,
  type Order,
  type Row,
  type SelectNode,
} from "./query";
import { collectionFor, docId, referencesTo, tableDef, USERS, type Reference } from "./schema";
import { isPermissionDenied, type Change, type Store, type WriteOp } from "./store";

// ---------------------------------------------------------------- errors ---

/** Shaped like PostgrestError so existing `if (error) throw error` handling keeps working. */
export class DataError extends Error {
  code: string;
  details: string | null;
  hint: string | null;
  constructor(message: string, code = "", details: string | null = null) {
    super(message);
    this.name = "DataError";
    this.code = code;
    this.details = details;
    this.hint = null;
  }
}

function toDataError(error: unknown): DataError {
  if (error instanceof DataError) return error;
  if (isPermissionDenied(error))
    return new DataError(
      "You don't have permission to do that.",
      "42501",
      (error as Error).message ?? null,
    );
  const message = error instanceof Error ? error.message : String(error);
  return new DataError(message, (error as { code?: string } | null)?.code ?? "");
}

const notSupported = (what: string) =>
  new DataError(`${what} is not supported by the Firestore data layer`, "PGRST100");

// ----------------------------------------------------------------- types ---

type Postgrest = PostgrestClient<Database>;

export interface RealtimePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  new: Row;
  old: Row;
}

export interface RealtimeChannel {
  on(
    type: "postgres_changes",
    filter: {
      event: "*" | "INSERT" | "UPDATE" | "DELETE";
      schema: string;
      table: string;
      filter?: string;
    },
    callback: (payload: RealtimePayload) => void,
  ): RealtimeChannel;
  subscribe(callback?: (status: string) => void): RealtimeChannel;
  unsubscribe(): Promise<"ok">;
}

export interface DataClient {
  from: Postgrest["from"];
  rpc: Postgrest["rpc"];
  channel(name: string): RealtimeChannel;
  removeChannel(channel: RealtimeChannel): Promise<"ok">;
  /**
   * Removes an account's profile, role and everything it owns, the way
   * deleting from auth.users cascaded in Postgres. The Firebase Auth login
   * itself can only be deleted with admin rights (Firebase console).
   */
  deleteUser(userId: string): Promise<void>;
}

interface Result {
  data: unknown;
  error: DataError | null;
  count: number | null;
  status: number;
  statusText: string;
}

type Action = "select" | "insert" | "update" | "upsert" | "delete";

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- client ---

export function createDataClient(store: Store, accessSource: AccessSource): DataClient {
  async function requireAccess(): Promise<Access> {
    const access = await accessSource.current();
    if (!access) throw new DataError("You need to sign in again.", "PGRST301");
    return access;
  }

  // ---- reads

  type Gets = Map<string, Promise<Row | null>>;

  const cachedGet = (gets: Gets, collection: string, id: string) => {
    const key = `${collection}/${id}`;
    let found = gets.get(key);
    if (!found) {
      found = store.get(collection, id);
      gets.set(key, found);
    }
    return found;
  };

  async function readBranch(table: string, branch: Branch, gets: Gets): Promise<Row[]> {
    const { key } = tableDef(table);
    const eq = branch.eq;
    let ids: string[] | undefined;
    if (!branch.in && "id" in eq) ids = [String(eq.id)];
    else if (!branch.in && key && key.every((column) => column in eq)) ids = [docId(table, eq)];
    else if (
      branch.in &&
      (branch.in.column === "id" || (key?.length === 1 && key[0] === branch.in.column))
    )
      ids = branch.in.values.map(String);
    if (!ids) return store.query(table, branch);
    const rows = await Promise.all(ids.map((id) => cachedGet(gets, table, id)));
    // Document reads skip Firestore's filtering, so apply the branch here.
    return rows.filter(
      (row): row is Row =>
        Boolean(row) &&
        Object.entries(eq).every(([column, value]) => (row![column] ?? null) === value) &&
        (!branch.in || branch.in.values.includes(row![branch.in.column] ?? null)),
    );
  }

  /**
   * Rows of `table` matching `conditions` that the caller may read.
   * `unscoped` reads for cascades, which the rules allow once the parent is gone.
   */
  async function fetchRows(
    table: string,
    conditions: Condition[],
    access: Access,
    options: { unscoped?: boolean; gets?: Gets } = {},
  ): Promise<Row[]> {
    const gets = options.gets ?? new Map();
    // Students' cascade reads still go one parent at a time so the rules can check each.
    const scope = options.unscoped ? (access.isTeacher ? null : [{}]) : scopeFor(table, access);
    const branches = planBranches(conditions, scope);
    const results = await Promise.all(branches.map((b) => readBranch(table, b, gets)));
    const byId = new Map<string, Row>();
    for (const rows of results) for (const row of rows) byId.set(String(row.id), row);
    return [...byId.values()].filter((row) => matchesAll(row, conditions));
  }

  function embedReference(table: string, target: string): Reference {
    const references = tableDef(table).references ?? [];
    const byTable = references.filter((r) => r.table === target);
    if (byTable.length === 1) return byTable[0]!;
    const byColumn = references.find((r) => r.column === target);
    if (byColumn) return byColumn;
    throw new DataError(`Could not find a relationship between ${table} and ${target}`, "PGRST200");
  }

  async function shape(table: string, rows: Row[], select: SelectNode, gets: Gets): Promise<Row[]> {
    return Promise.all(
      rows.map(async (row) => {
        const out = project(row, select);
        for (const embed of select.embeds) {
          const reference = embedReference(table, embed.target);
          const parentId = row[reference.column];
          const parent =
            parentId == null
              ? null
              : await cachedGet(gets, collectionFor(reference.table), String(parentId));
          out[embed.as] = parent
            ? (await shape(reference.table, [parent], embed.select, gets))[0]
            : null;
        }
        return out;
      }),
    );
  }

  // ---- writes

  function withDefaults(table: string, input: Row): Row {
    const { columns, key } = tableDef(table);
    const row: Row = { ...input };
    for (const [column, def] of Object.entries(columns)) {
      if (row[column] !== undefined) continue;
      if (column === "id" && key) continue;
      if (def.default) row[column] = def.default();
      else if (def.nullable) row[column] = null;
      else
        throw new DataError(
          `null value in column "${column}" of relation "${table}" violates not-null constraint`,
          "23502",
        );
    }
    if (key) row.id = docId(table, row);
    return row;
  }

  async function createRows(
    table: string,
    values: Row[],
    access: Access,
    upsert?: { ignoreDuplicates: boolean },
  ): Promise<Row[]> {
    const { key, touch } = tableDef(table);
    const prepared: Row[] = [];
    for (const value of values) {
      const row = { ...value };
      await beforeInsert(table, row, access);
      prepared.push(row);
    }

    const ops: WriteOp[] = [];
    const created: Row[] = [];
    const updated: Array<[Row, Row]> = [];
    for (const value of prepared) {
      const row = withDefaults(table, value);
      const id = String(row.id);
      // Keyed rows, and upserts by primary key, may already exist.
      const existing = key || upsert ? await store.get(table, id) : null;
      if (existing && !upsert)
        throw new DataError(
          `duplicate key value violates unique constraint "${table}_${(key ?? ["id"]).join("_")}_key"`,
          "23505",
        );
      if (existing) {
        if (upsert!.ignoreDuplicates) continue;
        const patch: Row = { ...value };
        if (touch && patch.updated_at === undefined) patch.updated_at = nowIso();
        ops.push({ kind: "update", collection: table, id, data: patch });
        updated.push([existing, { ...existing, ...patch }]);
      } else {
        ops.push({ kind: "set", collection: table, id, data: row });
        created.push(row);
      }
    }
    if (ops.length) await store.commit(ops);
    for (const row of created) await afterWrite(table, null, row, access);
    for (const [before, after] of updated) await afterWrite(table, before, after, access);
    return [...created, ...updated.map(([, after]) => after)];
  }

  async function updateRows(
    table: string,
    values: Row,
    conditions: Condition[],
    access: Access,
  ): Promise<Row[]> {
    const { key, touch } = tableDef(table);
    const rows = await fetchRows(table, conditions, access);
    if (rows.length === 0) return [];
    // Document IDs are derived from the key, so a key can't change in place.
    const keyColumns = ["id", ...(key ?? [])].filter((column) => column in values);
    if (rows.some((row) => keyColumns.some((column) => values[column] !== row[column])))
      throw notSupported(`Changing the key of a ${table} row`);
    const patch: Row = { ...values };
    if (touch && patch.updated_at === undefined) patch.updated_at = nowIso();
    await store.commit(
      rows.map((row) => ({ kind: "update", collection: table, id: String(row.id), data: patch })),
    );
    const after = rows.map((row) => ({ ...row, ...patch }));
    for (let i = 0; i < rows.length; i++) await afterWrite(table, rows[i]!, after[i]!, access);
    return after;
  }

  async function removeRows(table: string, rows: Row[], access: Access): Promise<void> {
    if (rows.length === 0) return;
    const ids = rows.map((row) => String(row.id));
    await store.commit(ids.map((id) => ({ kind: "delete", collection: collectionFor(table), id })));
    await cascade(table, ids, access);
  }

  /** Replays ON DELETE CASCADE / SET NULL for rows that were just deleted. */
  async function cascade(table: string, ids: string[], access: Access): Promise<void> {
    for (const reference of referencesTo(table)) {
      if (reference.onDelete === "no action") continue;
      if (table === USERS && reference.from === "profiles") continue;
      try {
        for (const id of ids) {
          const children = await fetchRows(
            reference.from,
            [{ column: reference.column, op: "eq", value: id }],
            access,
            { unscoped: true },
          );
          if (reference.onDelete === "cascade") await removeRows(reference.from, children, access);
          else if (children.length)
            await store.commit(
              children.map((child) => ({
                kind: "update",
                collection: reference.from,
                id: String(child.id),
                data: { [reference.column]: null },
              })),
            );
        }
      } catch (error) {
        // The delete itself went through; a leftover child row is harmless and
        // the rules let anyone tidy it up later.
        console.warn(
          `[db] could not clean up ${reference.from}.${reference.column} after deleting from ${table}:`,
          error,
        );
      }
    }
  }

  // ---- what the Postgres triggers did

  async function beforeInsert(table: string, row: Row, access: Access) {
    if (table === "mod_enrollments") {
      // link_roster_on_enrollment: normalize the email and link an existing, confirmed account.
      row.email = String(row.email ?? "")
        .trim()
        .toLowerCase();
      if (row.student_id == null) {
        const [account] = await fetchRows(
          "user_accounts",
          [
            { column: "email", op: "eq", value: row.email },
            { column: "email_verified", op: "eq", value: true },
          ],
          access,
        );
        if (account) row.student_id = account.id;
      }
    }
  }

  async function afterWrite(table: string, before: Row | null, after: Row, access: Access) {
    if (table === "teams" && !before) {
      // Students look teams up by join code before they can read them.
      const code = String(after.join_code);
      await store.commit([
        {
          kind: "set",
          collection: "team_codes",
          id: code,
          data: { id: code, code, team_id: after.id },
        },
      ]);
    }
    if (table === "mod_enrollments" && !before && after.student_id != null) {
      // The old trigger also gave a linked account the student role if it had none.
      const studentId = String(after.student_id);
      const role = await store.get("user_roles", studentId);
      if (!role)
        await store.commit([
          {
            kind: "set",
            collection: "user_roles",
            id: studentId,
            data: { id: studentId, user_id: studentId, role: "student" },
          },
        ]);
    }
    if (table === "entries") {
      try {
        await notifyTeachersOfMissionEntry(before, after, access);
      } catch (error) {
        console.warn("[db] could not notify teachers about this mission response:", error);
      }
    }
  }

  /** notify_teachers_of_mission_entry: tell every teacher a student posted or edited mission work. */
  async function notifyTeachersOfMissionEntry(before: Row | null, entry: Row, access: Access) {
    if (entry.mission_id == null || access.isTeacher) return;
    if (before && before.title === entry.title && before.content === entry.content) return;

    const gets: Gets = new Map();
    const [actor, team, mission, teachers] = await Promise.all([
      cachedGet(gets, "profiles", String(entry.user_id)),
      entry.team_id == null ? null : cachedGet(gets, "teams", String(entry.team_id)),
      cachedGet(gets, "stage_missions", String(entry.mission_id)),
      fetchRows("user_roles", [{ column: "role", op: "eq", value: "teacher" }], access),
    ]);
    const graded =
      entry.team_id != null &&
      Boolean(await store.get("mission_grades", `${entry.mission_id}_${entry.team_id}`));
    const [kind, title] = graded
      ? ["graded_mission_changed", "Graded mission work changed"]
      : before
        ? ["mission_updated", "Mission response edited"]
        : ["mission_submitted", "New mission response"];
    const body =
      String(actor?.full_name ?? "A student") +
      (team?.name != null ? ` (${team.name})` : "") +
      " · " +
      String(mission?.title ?? entry.title);

    await store.commit(
      teachers.map((teacher) => {
        const id = crypto.randomUUID();
        return {
          kind: "set" as const,
          collection: "notifications",
          id,
          data: {
            id,
            recipient_id: teacher.user_id,
            kind,
            actor_id: entry.user_id,
            team_id: entry.team_id ?? null,
            entry_id: entry.id,
            mission_id: entry.mission_id,
            stage: entry.stage ?? "",
            title,
            body,
            read_at: null,
            created_at: nowIso(),
          },
        };
      }),
    );
  }

  // ---- query builder

  class QueryBuilder implements PromiseLike<Result> {
    private action: Action = "select";
    private selection: SelectNode = parseSelect("*");
    private returning = false;
    private countExact = false;
    private head = false;
    private conditions: Condition[] = [];
    private orders: Order[] = [];
    private limitCount?: number;
    private offsetCount = 0;
    private singleMode?: "single" | "maybe";
    private values?: Row | Row[];
    private ignoreDuplicates = false;

    constructor(private readonly table: string) {
      tableDef(table);
    }

    private column(column: string) {
      return tableDef(this.table).columns[column]?.type;
    }

    private add(column: string, op: FilterOp, value: unknown, negate = false) {
      this.conditions.push({ column, op, value: coerce(value, this.column(column)), negate });
      return this;
    }

    private coerceFilter(filter: Filter): Filter {
      return { ...filter, value: coerce(filter.value, this.column(filter.column)) };
    }

    select(columns = "*", options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
      this.selection = parseSelect(columns);
      if (this.action === "select") {
        this.countExact = Boolean(options?.count);
        this.head = Boolean(options?.head);
      } else this.returning = true;
      return this;
    }
    insert(values: Row | Row[]) {
      this.action = "insert";
      this.values = values;
      return this;
    }
    upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      const key = tableDef(this.table).key ?? ["id"];
      const target = (options?.onConflict ?? key.join(",")).split(",").map((c) => c.trim());
      if (target.length !== key.length || !target.every((c) => key.includes(c)))
        throw notSupported(`upsert on ${this.table} with onConflict "${options?.onConflict}"`);
      this.action = "upsert";
      this.values = values;
      this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
      return this;
    }
    update(values: Row) {
      this.action = "update";
      this.values = values;
      return this;
    }
    delete() {
      this.action = "delete";
      return this;
    }

    eq(column: string, value: unknown) {
      return this.add(column, "eq", value);
    }
    neq(column: string, value: unknown) {
      return this.add(column, "neq", value);
    }
    gt(column: string, value: unknown) {
      return this.add(column, "gt", value);
    }
    gte(column: string, value: unknown) {
      return this.add(column, "gte", value);
    }
    lt(column: string, value: unknown) {
      return this.add(column, "lt", value);
    }
    lte(column: string, value: unknown) {
      return this.add(column, "lte", value);
    }
    like(column: string, pattern: string) {
      return this.add(column, "like", pattern);
    }
    ilike(column: string, pattern: string) {
      return this.add(column, "ilike", pattern);
    }
    is(column: string, value: null | boolean) {
      return this.add(column, "is", value);
    }
    in(column: string, values: readonly unknown[]) {
      return this.add(column, "in", [...values]);
    }
    not(column: string, operator: string, value: unknown) {
      if (operator === "in" && typeof value === "string")
        return this.add(column, "in", parseFilter(`${column}.in.${value}`).value, true);
      return this.add(column, operator as FilterOp, value, true);
    }
    filter(column: string, operator: string, value: unknown) {
      this.conditions.push(
        this.coerceFilter(parseFilter(`${column}.${operator}.${String(value)}`)),
      );
      return this;
    }
    match(query: Row) {
      for (const [column, value] of Object.entries(query)) this.add(column, "eq", value);
      return this;
    }
    or(filters: string, options?: { referencedTable?: string; foreignTable?: string }) {
      if (options?.referencedTable || options?.foreignTable)
        throw notSupported("or() on an embedded table");
      this.conditions.push({ or: parseOr(filters).or.map((f) => this.coerceFilter(f)) });
      return this;
    }
    order(
      column: string,
      options?: {
        ascending?: boolean;
        nullsFirst?: boolean;
        referencedTable?: string;
        foreignTable?: string;
      },
    ) {
      if (options?.referencedTable || options?.foreignTable)
        throw notSupported("order() on an embedded table");
      this.orders.push({
        column,
        ascending: options?.ascending ?? true,
        nullsFirst: options?.nullsFirst,
      });
      return this;
    }
    limit(count: number) {
      this.limitCount = count;
      return this;
    }
    range(from: number, to: number) {
      this.offsetCount = from;
      this.limitCount = to - from + 1;
      return this;
    }
    single() {
      this.singleMode = "single";
      return this;
    }
    maybeSingle() {
      this.singleMode = "maybe";
      return this;
    }
    throwOnError() {
      throw notSupported("throwOnError()");
    }

    then<A = Result, B = never>(
      onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
      onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
    ): PromiseLike<A | B> {
      return this.execute().then(onfulfilled, onrejected);
    }

    private async execute(): Promise<Result> {
      try {
        const access = await requireAccess();
        const gets: Gets = new Map();
        let rows: Row[];
        switch (this.action) {
          case "select":
            rows = await fetchRows(this.table, this.conditions, access, { gets });
            break;
          case "insert":
          case "upsert": {
            const values = Array.isArray(this.values) ? this.values : [this.values ?? {}];
            rows = await createRows(
              this.table,
              values,
              access,
              this.action === "upsert" ? { ignoreDuplicates: this.ignoreDuplicates } : undefined,
            );
            break;
          }
          case "update":
            rows = await updateRows(this.table, this.values as Row, this.conditions, access);
            break;
          case "delete":
            rows = await fetchRows(this.table, this.conditions, access);
            await removeRows(this.table, rows, access);
            break;
        }

        const count = this.countExact ? rows.length : null;
        if (this.action !== "select" && !this.returning)
          return { data: null, error: null, count, status: 204, statusText: "No Content" };
        if (this.head) return { data: null, error: null, count, status: 200, statusText: "OK" };

        rows = sortRows(rows, this.orders);
        if (this.offsetCount) rows = rows.slice(this.offsetCount);
        if (this.limitCount !== undefined) rows = rows.slice(0, this.limitCount);
        const data = await shape(this.table, rows, this.selection, gets);

        if (!this.singleMode) return { data, error: null, count, status: 200, statusText: "OK" };
        if (data.length > 1 || (data.length === 0 && this.singleMode === "single"))
          throw new DataError(
            "JSON object requested, multiple (or no) rows returned",
            "PGRST116",
            `The result contains ${data.length} rows`,
          );
        return { data: data[0] ?? null, error: null, count, status: 200, statusText: "OK" };
      } catch (error) {
        return {
          data: null,
          error: toDataError(error),
          count: null,
          status: 400,
          statusText: "Error",
        };
      }
    }
  }

  // ---- RPCs (Postgres functions the browser called)

  async function joinTeamByCode(args: Row): Promise<string> {
    const access = await requireAccess();
    const code = String(args._code ?? "")
      .trim()
      .toUpperCase();
    const entry = code ? await store.get("team_codes", code) : null;
    if (!entry) throw new DataError("Invalid join code", "P0001");
    const teamId = String(entry.team_id);
    const id = `${teamId}_${access.uid}`;
    if (await store.get("team_members", id)) return teamId;
    await store.commit([
      {
        kind: "set",
        collection: "team_members",
        id,
        data: {
          id,
          team_id: teamId,
          user_id: access.uid,
          member_role: "member",
          joined_at: nowIso(),
          join_code: code,
        },
      },
    ]);
    return teamId;
  }

  const rpcs: Record<string, (args: Row) => Promise<unknown>> = {
    join_team_by_code: joinTeamByCode,
  };

  function rpc(name: string, args: Row = {}): PromiseLike<Result> {
    const run = async (): Promise<Result> => {
      try {
        const fn = rpcs[name];
        if (!fn) throw notSupported(`rpc("${name}")`);
        return { data: await fn(args), error: null, count: null, status: 200, statusText: "OK" };
      } catch (error) {
        return {
          data: null,
          error: toDataError(error),
          count: null,
          status: 400,
          statusText: "Error",
        };
      }
    };
    return { then: (resolve, reject) => run().then(resolve, reject) };
  }

  // ---- realtime

  function channel(_name: string): RealtimeChannel {
    const handlers: Array<{
      event: string;
      table: string;
      filter?: string;
      callback: (p: RealtimePayload) => void;
    }> = [];
    let stops: Array<() => void> = [];
    let closed = false;

    const self: RealtimeChannel = {
      on(_type, filter, callback) {
        handlers.push({
          event: filter.event,
          table: filter.table,
          filter: filter.filter,
          callback,
        });
        return self;
      },
      subscribe(callback) {
        void (async () => {
          const access = await requireAccess();
          for (const handler of handlers) {
            const conditions: Condition[] = [];
            if (handler.filter) {
              const [column, rest] = handler.filter.split("=");
              conditions.push(parseFilter(`${column}.${rest}`));
            }
            for (const branch of planBranches(conditions, scopeFor(handler.table, access))) {
              if (closed) return;
              stops.push(
                store.listen(handler.table, branch, (changes: Change[]) => {
                  for (const change of changes) {
                    const eventType =
                      change.type === "added"
                        ? "INSERT"
                        : change.type === "removed"
                          ? "DELETE"
                          : "UPDATE";
                    if (handler.event !== "*" && handler.event !== eventType) continue;
                    handler.callback({
                      eventType,
                      schema: "public",
                      table: handler.table,
                      new: eventType === "DELETE" ? {} : change.row,
                      old: eventType === "DELETE" ? change.row : {},
                    });
                  }
                }),
              );
            }
          }
          callback?.("SUBSCRIBED");
        })().catch((error) => {
          console.warn("[db] live updates unavailable:", error);
          callback?.("CHANNEL_ERROR");
        });
        return self;
      },
      async unsubscribe() {
        closed = true;
        stops.forEach((stop) => stop());
        stops = [];
        return "ok";
      },
    };
    return self;
  }

  return {
    from: ((table: string) => new QueryBuilder(table)) as unknown as Postgrest["from"],
    rpc: rpc as unknown as Postgrest["rpc"],
    channel,
    removeChannel: (ch) => ch.unsubscribe(),
    async deleteUser(userId: string) {
      const access = await requireAccess();
      await store.commit([{ kind: "delete", collection: "profiles", id: userId }]);
      await cascade(USERS, [userId], access);
    },
  };
}
