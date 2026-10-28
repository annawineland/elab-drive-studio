/**
 * Loads studio data into Firestore and recreates sign-ins in Firebase Auth.
 *
 *   npm run firebase:import -- --credentials key.json --seed
 *       A fresh studio: mods, stage guides and missions, rubrics, resource
 *       docs and the pacing guide from the original migrations (seed.json).
 *
 *   npm run firebase:import -- --credentials key.json --from ./export
 *       Your live data, exported from Lovable Cloud as one <table>.csv or
 *       <table>.json per table. Rows keep their IDs.
 *
 * Accounts: to keep each person's work attached to them, their Firebase login
 * gets the same user ID they had before. That needs each user's email, taken from
 *   - auth_users.csv/.json in the export folder (id, email, email_confirmed_at),
 *     e.g. from: select id, email, email_confirmed_at from auth.users;
 *   - roster rows (mod_enrollments) for students who claimed a spot;
 *   - --user <old-id>=<email> for anyone else (such as teachers).
 * Imported logins have no password: people sign in with Google, or use
 * "Forgot your password?" once to set one.
 *
 * Other flags: --dry-run (report only; add --out preview.json to save the
 * documents it would write), --no-logins (skip Firebase Auth).
 */
import fs from "node:fs";
import path from "node:path";
import type { UserImportRecord } from "firebase-admin/auth";
import { docId, TABLES, type ColumnDef } from "../../src/integrations/firebase/schema";
import { argValue, argValues, connect, parseCsv } from "./common";

type Row = Record<string, unknown>;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const createLogins = !args.includes("--no-logins");
const exportDir = argValue(args, "--from");
const useSeed = args.includes("--seed");

if (!exportDir && !useSeed) {
  console.error("Pass --seed, --from <export folder>, or both. See the top of this file.");
  process.exit(1);
}

// ------------------------------------------------------------- reading ---

function readTableFile(dir: string, table: string): Row[] | undefined {
  for (const ext of ["json", "csv"]) {
    const file = path.join(dir, `${table}.${ext}`);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    return ext === "json" ? (JSON.parse(text) as Row[]) : parseCsv(text);
  }
  return undefined;
}

// ---------------------------------------------------------- normalizing ---

/** "2026-08-17 15:19:03.123456+00" (Postgres) or any ISO string -> "2026-08-17T15:19:03.123Z". */
function timestamp(value: string): string {
  const iso = value
    .trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d\d)$/, "$1:00");
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Unreadable timestamp "${value}"`);
  return date.toISOString();
}

function normalize(value: unknown, column: ColumnDef): unknown {
  if (value === undefined || value === null) {
    if (column.nullable) return null;
    // A NOT NULL text column exported as an empty field held an empty string.
    if (column.type === "text") return "";
    if (column.default) return column.default();
    throw new Error("missing a value for a NOT NULL column");
  }
  // Some exporters write NULL as "" whatever the type; only text can really be empty.
  if (value === "" && column.nullable && column.type !== "text") return null;
  switch (column.type) {
    case "int":
      return Number(value);
    case "bool":
      return value === true || value === "true" || value === "t";
    case "json":
      return typeof value === "string" ? JSON.parse(value) : value;
    case "timestamp":
      return timestamp(String(value));
    case "date":
      return String(value).slice(0, 10);
    default:
      return String(value);
  }
}

function normalizeRow(table: string, input: Row): Row {
  const { columns } = TABLES[table]!;
  const row: Row = {};
  for (const [name, column] of Object.entries(columns)) {
    if (input[name] !== undefined) row[name] = normalize(input[name], column);
    else if (column.default) row[name] = column.default();
    else if (column.nullable) row[name] = null;
    else if (name !== "id") throw new Error(`${table} row is missing required column "${name}"`);
  }
  if (table === "mod_enrollments") row.email = String(row.email).trim().toLowerCase();
  row.id = docId(table, row);
  return row;
}

// ---------------------------------------------------------------- load ---

const tables = new Map<string, Row[]>();
const notes: string[] = [];

if (exportDir) {
  for (const table of [...Object.keys(TABLES), "app_user_connections"]) {
    const rows = readTableFile(exportDir, table);
    if (!rows) continue;
    if (table === "app_user_connections") {
      notes.push("Skipped app_user_connections: Drive now connects in the browser (see README).");
      continue;
    }
    tables.set(table, rows);
  }
}
if (useSeed) {
  const seed = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "seed.json"), "utf8"),
  ) as Record<string, Row[]>;
  for (const [table, rows] of Object.entries(seed)) {
    if (tables.has(table)) notes.push(`Seed skipped for ${table}: the export has it.`);
    else tables.set(table, rows);
  }
}

const normalized = new Map<string, Row[]>();
for (const [table, rows] of tables) {
  const out = new Map<string, Row>();
  for (const input of rows) {
    const row = normalizeRow(table, input);
    // One role per account: a teacher role wins over a student one.
    const existing = out.get(String(row.id));
    if (table === "user_roles" && existing?.role === "teacher") continue;
    out.set(String(row.id), row);
  }
  normalized.set(table, [...out.values()]);
}

// Join-code lookups for every team.
const teams = normalized.get("teams") ?? [];
if (teams.length)
  normalized.set(
    "team_codes",
    teams.map((t) => ({ id: t.join_code, code: t.join_code, team_id: t.id })),
  );

// ------------------------------------------------------------- accounts ---

interface Account {
  email: string;
  verified: boolean;
}
const accounts = new Map<string, Account>();
const authRows = exportDir ? readTableFile(exportDir, "auth_users") : undefined;
for (const row of authRows ?? []) {
  if (!row.id || !row.email) continue;
  accounts.set(String(row.id), {
    email: String(row.email).toLowerCase(),
    verified: Boolean(row.email_confirmed_at),
  });
}
for (const row of normalized.get("mod_enrollments") ?? [])
  if (row.student_id && !accounts.has(String(row.student_id)))
    accounts.set(String(row.student_id), { email: String(row.email), verified: true });
for (const flag of argValues(args, "--user")) {
  const [id, email] = flag.split("=");
  if (id && email) accounts.set(id, { email: email.toLowerCase(), verified: true });
}

const profiles = new Map((normalized.get("profiles") ?? []).map((p) => [String(p.id), p]));
if (accounts.size)
  normalized.set(
    "user_accounts",
    [...accounts].map(([id, a]) => {
      const now = new Date().toISOString();
      return { id, email: a.email, email_verified: a.verified, created_at: now, updated_at: now };
    }),
  );
const unmatched = [...profiles.keys()].filter((id) => !accounts.has(id));

// --------------------------------------------------------------- report ---

console.log(dryRun ? "\nDry run — nothing will be written.\n" : "");
for (const [table, rows] of [...normalized].sort(([a], [b]) => a.localeCompare(b)))
  console.log(`  ${table.padEnd(24)} ${rows.length}`);
console.log(`  ${"(firebase auth logins)".padEnd(24)} ${createLogins ? accounts.size : 0}`);
for (const note of notes) console.log(`Note: ${note}`);
if (unmatched.length)
  console.log(
    `\n${unmatched.length} profile(s) have no known email, so no login was created for them:\n` +
      unmatched.map((id) => `  ${id}  ${String(profiles.get(id)?.full_name ?? "")}`).join("\n") +
      "\nAdd them with --user <id>=<email> (or an auth_users file) to keep their work attached.",
  );
if (dryRun) {
  const out = argValue(args, "--out");
  if (out) {
    fs.writeFileSync(out, JSON.stringify(Object.fromEntries(normalized), null, 2));
    console.log(`\nWrote the documents to ${out}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- write ---

const { getFirestore } = await import("firebase-admin/firestore");
const { getAuth } = await import("firebase-admin/auth");
const app = connect(args);
const firestore = getFirestore(app);
const writer = firestore.bulkWriter();
let failed = 0;
writer.onWriteError(
  (error: { failedAttempts: number; documentRef: { path: string }; message: string }) => {
    if (error.failedAttempts < 3) return true;
    failed++;
    console.error(`  failed ${error.documentRef.path}: ${error.message}`);
    return false;
  },
);
for (const [table, rows] of normalized)
  for (const row of rows) void writer.set(firestore.collection(table).doc(String(row.id)), row);
await writer.close();
console.log(
  `\nFirestore: wrote ${[...normalized.values()].reduce((n, r) => n + r.length, 0) - failed} documents${failed ? `, ${failed} failed` : ""}.`,
);

if (createLogins && accounts.size) {
  const records: UserImportRecord[] = [...accounts].map(([uid, a]) => ({
    uid,
    email: a.email,
    emailVerified: a.verified,
    displayName: String(profiles.get(uid)?.full_name ?? "") || undefined,
  }));
  let imported = 0;
  for (let i = 0; i < records.length; i += 1000) {
    const chunk = records.slice(i, i + 1000);
    const result = await getAuth(app).importUsers(chunk);
    imported += result.successCount;
    for (const e of result.errors)
      console.error(`  login for ${chunk[e.index]?.email}: ${e.error.message}`);
  }
  console.log(`Firebase Auth: created ${imported} of ${records.length} logins.`);
}
