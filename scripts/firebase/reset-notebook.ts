/**
 * Clears every team's notebook work so the class can start fresh.
 *
 *   npm run firebase:reset-notebook -- --credentials key.json            (preview)
 *   npm run firebase:reset-notebook -- --credentials key.json --confirm  (delete)
 *
 * Deletes:
 *   - entries: every notebook entry and mission response
 *   - mission_completions: teams' mission check-offs
 *   - mission_grades: teams' mission scores and teacher notes
 *   - feedback on an entry or a posted mission (other teacher feedback stays)
 *   - notifications about an entry or mission
 *   - notebook_presence: "is writing…" markers
 * and unlinks rubric_scores from the deleted entries (the scores stay).
 *
 * Keeps stage instructions, notebook missions and their rubrics, posted
 * missions, model answers, teams, rosters, evidence and everything else.
 */
import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { connect } from "./common";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const firestore = getFirestore(connect(args));

const all = async (collection: string) => (await firestore.collection(collection).get()).docs;
const linked = (doc: DocumentSnapshot) =>
  doc.get("entry_id") != null || doc.get("mission_id") != null;

const toDelete: Array<[string, DocumentSnapshot[]]> = [
  ["entries", await all("entries")],
  ["mission_completions", await all("mission_completions")],
  ["mission_grades", await all("mission_grades")],
  ["feedback (on entries or missions)", (await all("feedback")).filter(linked)],
  ["notifications (about entries or missions)", (await all("notifications")).filter(linked)],
  ["notebook_presence", await all("notebook_presence")],
];
const toUnlink = (await all("rubric_scores")).filter((doc) => doc.get("entry_id") != null);

console.log(confirm ? "\nDeleting:" : "\nWould delete (preview — nothing is changed):");
for (const [label, docs] of toDelete) console.log(`  ${String(docs.length).padStart(5)}  ${label}`);
console.log(`  ${String(toUnlink.length).padStart(5)}  rubric scores unlinked from entries (kept)`);

if (!confirm) {
  console.log("\nRun again with --confirm to delete these. This can't be undone.");
  process.exit(0);
}

const writer = firestore.bulkWriter();
for (const [, docs] of toDelete) for (const doc of docs) void writer.delete(doc.ref);
for (const doc of toUnlink) void writer.update(doc.ref, { entry_id: null });
await writer.close();
console.log("\nDone. Students may need to refresh the studio.");
