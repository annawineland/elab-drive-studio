// In-memory stand-ins for Firestore and the signed-in user, for tests.
import type { Access, AccessSource } from "./access";
import type { Branch, Row } from "./query";
import type { Change, Store, WriteOp } from "./store";

export interface MemoryStore extends Store {
  /** collection -> id -> document */
  data: Map<string, Map<string, Row>>;
  writes: WriteOp[];
}

/** Behaves like Firestore for equality and `in` filters (null matches null). */
export function memoryStore(seed: Record<string, Row[]> = {}): MemoryStore {
  const data = new Map<string, Map<string, Row>>();
  const listeners = new Set<{
    collection: string;
    branch: Branch;
    onChange: (c: Change[]) => void;
  }>();
  const docs = (name: string) => {
    let found = data.get(name);
    if (!found) data.set(name, (found = new Map()));
    return found;
  };
  for (const [name, rows] of Object.entries(seed))
    for (const row of rows) docs(name).set(String(row.id), { ...row });

  const matches = (row: Row, branch: Branch) =>
    Object.entries(branch.eq).every(([field, value]) => (row[field] ?? null) === value) &&
    (!branch.in || branch.in.values.includes(row[branch.in.column] ?? null));

  const store: MemoryStore = {
    data,
    writes: [],
    async get(name, id) {
      const row = docs(name).get(id);
      return row ? { ...row } : null;
    },
    async query(name, branch) {
      if (branch.in && branch.in.values.length > 30)
        throw new Error("'in' supports up to 30 values");
      return [...docs(name).values()]
        .filter((row) => matches(row, branch))
        .map((row) => ({ ...row }));
    },
    async commit(ops) {
      const changes: Array<[string, Change]> = [];
      for (const op of ops) {
        store.writes.push(op);
        const collection = docs(op.collection);
        const before = collection.get(op.id);
        if (op.kind === "delete") {
          collection.delete(op.id);
          if (before) changes.push([op.collection, { type: "removed", row: before }]);
          continue;
        }
        if (op.kind === "update" && !before)
          throw Object.assign(new Error(`No document to update: ${op.collection}/${op.id}`), {
            code: "not-found",
          });
        const after = op.kind === "set" ? { ...op.data } : { ...before, ...op.data };
        collection.set(op.id, after);
        changes.push([op.collection, { type: before ? "modified" : "added", row: after }]);
      }
      for (const listener of listeners) {
        const relevant = changes
          .filter(
            ([name, change]) =>
              name === listener.collection && matches(change.row, listener.branch),
          )
          .map(([, change]) => change);
        if (relevant.length) listener.onChange(relevant);
      }
    },
    listen(collection, branch, onChange) {
      const listener = { collection, branch, onChange };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

export function staticAccess(
  access: Partial<Access> & { uid: string },
): AccessSource & { access: Access } {
  const full: Access = {
    email: `${access.uid}@school.test`,
    emailVerified: true,
    isTeacher: false,
    teamIds: [],
    modIds: [],
    ...access,
  };
  return { access: full, current: async () => full };
}
