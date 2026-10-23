/**
 * Replaces the class pacing guide with the weeks in seed.json — edit the
 * dates and goals there, then:
 *
 *   npm run firebase:sync-pacing -- --credentials key.json            (preview)
 *   npm run firebase:sync-pacing -- --credentials key.json --confirm  (write)
 *
 * Teams' own copies of the guide (team_pacing_weeks) aren't touched; a team
 * that made one keeps its dates until it edits or deletes its copy.
 */
import fs from "node:fs";
import path from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { connect } from "./common";

interface Week {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  focus: string;
  stage: string | null;
  milestones: string;
  deliverables: string;
}

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const firestore = getFirestore(connect(args));

const seed = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "seed.json"), "utf8")) as {
  pacing_weeks: Week[];
};
const weeks = seed.pacing_weeks
  .map((w) => ({ ...w, start_date: w.start_date.slice(0, 10), end_date: w.end_date.slice(0, 10) }))
  .sort((a, b) => a.week_number - b.week_number);

const live = await firestore.collection("pacing_weeks").get();
const keep = new Set(weeks.map((w) => w.id));
const extra = live.docs.filter((doc) => !keep.has(doc.id));

console.log(confirm ? "\nWriting the class pacing guide:" : "\nPreview — nothing is changed:");
for (const w of weeks)
  console.log(
    `  Week ${w.week_number}  ${w.start_date} – ${w.end_date}  ${w.focus.split(" — ")[0]}`,
  );
if (extra.length) console.log(`  …and removing ${extra.length} week(s) not in seed.json`);
const teamCopies = (await firestore.collection("team_pacing_weeks").count().get()).data().count;
if (teamCopies)
  console.log(
    `\nNote: ${teamCopies} team pacing week(s) are team copies and keep their own dates.`,
  );

if (!confirm) {
  console.log("\nRun again with --confirm to write these.");
  process.exit(0);
}

const now = new Date().toISOString();
const writer = firestore.bulkWriter();
for (const w of weeks) {
  const existing = live.docs.find((doc) => doc.id === w.id);
  void writer.set(firestore.collection("pacing_weeks").doc(w.id), {
    ...w,
    created_at: existing?.get("created_at") ?? now,
    updated_at: now,
  });
}
for (const doc of extra) void writer.delete(doc.ref);
await writer.close();
console.log("\nDone. Refresh the studio to see the new dates.");
