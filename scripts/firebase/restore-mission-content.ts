/**
 * Restores notebook missions' model answers and rubric criteria from a Lovable
 * Cloud export. The missions were re-created with new IDs, so rows are matched
 * to them by stage and title.
 *
 *   npm run firebase:restore-mission-content -- --credentials key.json --from ~/Desktop/studio-export
 *   ... --confirm   (write; without it, nothing changes)
 *
 * The folder holds either or both of
 *   exemplars.csv         stage, title, content
 *       select m.stage, m.title, e.content from mission_exemplars e
 *       join stage_missions m on m.id = e.mission_id;
 *   mission-criteria.csv  stage, mission, label, description, points, sort_order
 *       select m.stage, m.title as mission, c.label, c.description, c.points, c.sort_order
 *       from mission_rubric_criteria c join stage_missions m on m.id = c.mission_id;
 *
 * A mission's model answer is replaced, and so are its rubric criteria (all of
 * them, so running this twice doesn't duplicate them).
 */
import fs from "node:fs";
import path from "node:path";
import { getFirestore } from "firebase-admin/firestore";
import { argValue, connect, parseCsv } from "./common";

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const dir = argValue(args, "--from");
if (!dir) {
  console.error("Pass --from <folder with exemplars.csv and/or mission-criteria.csv>.");
  process.exit(1);
}
const read = (file: string) => {
  const full = path.join(dir, file);
  return fs.existsSync(full) ? parseCsv(fs.readFileSync(full, "utf8").replace(/^﻿/, "")) : [];
};
const exemplars = read("exemplars.csv");
const criteria = read("mission-criteria.csv");

const firestore = getFirestore(connect(args));
const missions = (await firestore.collection("stage_missions").get()).docs;
const key = (stage: unknown, title: unknown) =>
  `${String(stage ?? "").trim()}::${String(title ?? "")
    .trim()
    .toLowerCase()}`;
const missionId = new Map(missions.map((m) => [key(m.get("stage"), m.get("title")), m.id]));
const titleOf = new Map(missions.map((m) => [m.id, `${m.get("stage")} / ${m.get("title")}`]));

const unmatched = new Set<string>();
const match = (stage: unknown, title: unknown) => {
  const id = missionId.get(key(stage, title));
  if (!id) unmatched.add(`${stage} / ${title}`);
  return id;
};

const answers = exemplars.flatMap((row) => {
  const id = match(row.stage, row.title);
  return id && row.content?.trim() ? [{ missionId: id, content: row.content.trim() }] : [];
});
const criteriaByMission = new Map<string, typeof criteria>();
for (const row of criteria) {
  const id = match(row.stage, row.mission);
  if (id) criteriaByMission.set(id, [...(criteriaByMission.get(id) ?? []), row]);
}

console.log(confirm ? "\nRestoring:" : "\nPreview — nothing is changed:");
console.log(`  ${answers.length} model answers`);
console.log(
  `  ${[...criteriaByMission.values()].reduce((n, rows) => n + rows.length, 0)} rubric criteria across ${criteriaByMission.size} missions`,
);
const missing = missions.filter((m) => !answers.some((a) => a.missionId === m.id));
if (missing.length)
  console.log(`\nMissions without a model answer in the export (${missing.length}):`);
for (const m of missing) console.log(`  ${titleOf.get(m.id)}`);
if (unmatched.size) {
  console.log(`\nNo matching mission for (${unmatched.size}) — skipped:`);
  for (const u of unmatched) console.log(`  ${u}`);
}

if (!confirm) {
  console.log("\nRun again with --confirm to write these.");
  process.exit(0);
}

const now = new Date().toISOString();
const existingCriteria = (await firestore.collection("mission_rubric_criteria").get()).docs;
const writer = firestore.bulkWriter();
for (const a of answers)
  void writer.set(firestore.collection("mission_exemplars").doc(a.missionId), {
    id: a.missionId,
    mission_id: a.missionId,
    content: a.content,
    updated_by: null,
    created_at: now,
    updated_at: now,
  });
for (const doc of existingCriteria)
  if (criteriaByMission.has(String(doc.get("mission_id")))) void writer.delete(doc.ref);
for (const [id, rows] of criteriaByMission)
  for (const row of rows) {
    const id_ = crypto.randomUUID();
    void writer.set(firestore.collection("mission_rubric_criteria").doc(id_), {
      id: id_,
      mission_id: id,
      label: String(row.label ?? "").trim(),
      description: String(row.description ?? "").trim(),
      points: Number(row.points ?? 4),
      sort_order: Number(row.sort_order ?? 0),
      created_at: now,
      updated_at: now,
    });
  }
await writer.close();
console.log("\nDone. Refresh the studio to see them.");
