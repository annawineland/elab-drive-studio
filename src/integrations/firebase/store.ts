/**
 * The only module that talks to the Firestore SDK. The data layer (db.ts)
 * works against this interface, so it can be tested with an in-memory store.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QueryConstraint,
} from "firebase/firestore";
import type { Branch, Row } from "./query";

export type WriteOp =
  | { kind: "set"; collection: string; id: string; data: Row }
  | { kind: "update"; collection: string; id: string; data: Row }
  | { kind: "delete"; collection: string; id: string };

export interface Change {
  type: "added" | "modified" | "removed";
  row: Row;
}

export interface Store {
  /** The document, or null when it doesn't exist or the rules hide it. */
  get(collection: string, id: string): Promise<Row | null>;
  /** Documents matching the branch's equality filters (and its `in` list). */
  query(collection: string, branch: Branch): Promise<Row[]>;
  /** Applies the writes in order; each call of up to 500 writes is atomic. */
  commit(ops: WriteOp[]): Promise<void>;
  /** Calls back with changes after the initial result. Returns the unsubscribe. */
  listen(collection: string, branch: Branch, onChange: (changes: Change[]) => void): () => void;
}

const BATCH_LIMIT = 500;

export function isPermissionDenied(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "permission-denied";
}

export function firestoreStore(firestore: Firestore): Store {
  const constraints = (branch: Branch): QueryConstraint[] => {
    const list = Object.entries(branch.eq).map(([field, value]) => where(field, "==", value));
    if (branch.in) list.push(where(branch.in.column, "in", branch.in.values));
    return list;
  };
  const rowOf = (id: string, data: Row): Row => ({ id, ...data });

  return {
    async get(name, id) {
      try {
        const snapshot = await getDoc(doc(firestore, name, id));
        return snapshot.exists() ? rowOf(snapshot.id, snapshot.data()) : null;
      } catch (error) {
        if (isPermissionDenied(error)) return null;
        throw error;
      }
    },

    async query(name, branch) {
      const snapshot = await getDocs(query(collection(firestore, name), ...constraints(branch)));
      return snapshot.docs.map((d) => rowOf(d.id, d.data()));
    },

    async commit(ops) {
      if (ops.length === 1) {
        // A single write skips the batch so its error message stays specific.
        const [op] = ops as [WriteOp];
        const ref = doc(firestore, op.collection, op.id);
        if (op.kind === "set") await setDoc(ref, op.data);
        else if (op.kind === "update") await updateDoc(ref, op.data);
        else await deleteDoc(ref);
        return;
      }
      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = writeBatch(firestore);
        for (const op of ops.slice(i, i + BATCH_LIMIT)) {
          const ref = doc(firestore, op.collection, op.id);
          if (op.kind === "set") batch.set(ref, op.data);
          else if (op.kind === "update") batch.update(ref, op.data);
          else batch.delete(ref);
        }
        await batch.commit();
      }
    },

    listen(name, branch, onChange) {
      let initial = true;
      return onSnapshot(
        query(collection(firestore, name), ...constraints(branch)),
        (snapshot) => {
          if (initial) {
            initial = false;
            return;
          }
          const changes = snapshot.docChanges().map((change) => ({
            type: change.type,
            row: rowOf(change.doc.id, change.doc.data()),
          }));
          if (changes.length) onChange(changes);
        },
        (error) => console.warn(`[firestore] live updates for ${name} stopped:`, error.message),
      );
    },
  };
}
