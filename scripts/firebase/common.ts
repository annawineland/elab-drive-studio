// Shared helpers for the admin scripts. They use a service-account key, which
// bypasses firestore.rules — keep the key out of git and off shared machines.
import fs from "node:fs";
import { cert, initializeApp, type App } from "firebase-admin/app";

export function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export function argValues(args: string[], name: string): string[] {
  return args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]!] : []));
}

/** Connects with --credentials <key.json> or GOOGLE_APPLICATION_CREDENTIALS. */
export function connect(args: string[]): App {
  const keyPath = argValue(args, "--credentials") ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) {
    console.error(
      "Pass --credentials path/to/service-account.json (Firebase console → Project settings → Service accounts → Generate new private key).",
    );
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(keyPath, "utf8")) as { project_id: string };
  console.log(`Firebase project: ${key.project_id}`);
  return initializeApp({ credential: cert(key as never), projectId: key.project_id });
}

/**
 * RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines.
 * Like Postgres, an unquoted empty field is NULL and "" is an empty string.
 */
export function parseCsv(text: string): Array<Record<string, string | null>> {
  const records: Array<Array<string | null>> = [];
  let field = "";
  let wasQuoted = false;
  let record: Array<string | null> = [];
  let quoted = false;
  const endField = () => {
    record.push(field === "" && !wasQuoted ? null : field);
    field = "";
    wasQuoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = wasQuoted = true;
    else if (char === ",") endField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      endField();
      records.push(record);
      record = [];
    } else field += char;
  }
  if (field !== "" || wasQuoted || record.length) {
    endField();
    records.push(record);
  }
  const [header, ...rows] = records.filter((r) => r.length > 1 || r[0] != null);
  if (!header) return [];
  return rows.map((r) =>
    Object.fromEntries(header.map((name, i) => [String(name).trim(), r[i] ?? null])),
  );
}
