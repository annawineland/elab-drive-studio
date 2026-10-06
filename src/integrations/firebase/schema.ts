/**
 * The studio's data model, carried over from the Postgres migrations in
 * supabase/migrations so Firestore documents keep the exact same shape.
 *
 * Every Firestore collection is named after its old table and every document
 * stores all of its columns (missing values as null), so the app's queries and
 * the rules in firestore.rules can rely on each field being present.
 *
 * - `key`: tables with a unique constraint use it as the document ID, which is
 *   how Firestore enforces uniqueness and how the security rules look up
 *   memberships (team_members/{teamId}_{userId}) without a query.
 * - `references`: foreign keys. Many-to-one embeds in select strings
 *   ("*, mods(name)") resolve through these, and deletes replay Postgres'
 *   ON DELETE CASCADE / SET NULL. "users" stands for a signed-in account;
 *   its row is the profiles document.
 * - `touch`: tables whose updated_at a Postgres trigger refreshed on update.
 */

export type ColumnType = "uuid" | "text" | "int" | "timestamp" | "date" | "json" | "bool";

export interface ColumnDef {
  type: ColumnType;
  nullable?: boolean;
  default?: () => unknown;
}

export type OnDelete = "cascade" | "set null" | "no action";

export interface Reference {
  column: string;
  table: string;
  onDelete: OnDelete;
}

export interface TableDef {
  columns: Record<string, ColumnDef>;
  /** Columns that make up the document ID (a unique constraint in Postgres). */
  key?: string[];
  touch?: boolean;
  references?: Reference[];
}

/** The pseudo-table every user foreign key points at. Its rows live in `profiles`. */
export const USERS = "users";

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
/** Postgres current_date, in the browser's own time zone. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Same shape as the old default: upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)). */
export const newJoinCode = () => uuid().replace(/-/g, "").slice(0, 6).toUpperCase();

const id: ColumnDef = { type: "uuid", default: uuid };
const createdAt: ColumnDef = { type: "timestamp", default: now };
const updatedAt: ColumnDef = { type: "timestamp", default: now };
const text = (fallback?: string): ColumnDef =>
  fallback === undefined ? { type: "text" } : { type: "text", default: () => fallback };
const optional = (type: ColumnType): ColumnDef => ({ type, nullable: true, default: () => null });
const int = (fallback: number): ColumnDef => ({ type: "int", default: () => fallback });

const cascade = (column: string, table: string): Reference => ({
  column,
  table,
  onDelete: "cascade",
});
const setNull = (column: string, table: string): Reference => ({
  column,
  table,
  onDelete: "set null",
});
const noAction = (column: string, table: string): Reference => ({
  column,
  table,
  onDelete: "no action",
});

export const TABLES: Record<string, TableDef> = {
  profiles: {
    columns: {
      id: { type: "uuid" },
      full_name: text(""),
      avatar_url: optional("text"),
      created_at: createdAt,
    },
    key: ["id"],
    references: [cascade("id", USERS)],
  },
  // New with Firebase: the sign-in email per account, which Postgres kept in
  // auth.users. Readable only by its owner and teachers (profiles are public).
  user_accounts: {
    columns: {
      id: { type: "uuid" },
      email: { type: "text" },
      email_verified: { type: "bool", default: () => false },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    key: ["id"],
    touch: true,
    references: [cascade("id", USERS)],
  },
  // One role per account (the app only ever read the first one).
  user_roles: {
    columns: { id: { type: "uuid" }, user_id: { type: "uuid" }, role: { type: "text" } },
    key: ["user_id"],
    references: [cascade("user_id", USERS)],
  },
  mods: {
    columns: { id, name: text(), sort_order: int(0) },
  },
  teams: {
    columns: {
      id,
      mod_id: optional("uuid"),
      name: text(),
      client_name: text(""),
      project_focus: text(""),
      join_code: { type: "text", default: newJoinCode },
      current_stage: text("kickoff"),
      created_by: optional("uuid"),
      created_at: createdAt,
    },
    references: [setNull("mod_id", "mods"), setNull("created_by", USERS)],
  },
  // New with Firebase: join code -> team, so a student can find a team they
  // can't read yet (join_team_by_code ran as SECURITY DEFINER in Postgres).
  team_codes: {
    columns: { id: { type: "text" }, code: { type: "text" }, team_id: { type: "uuid" } },
    key: ["code"],
    references: [cascade("team_id", "teams")],
  },
  team_members: {
    columns: {
      id: { type: "text" },
      team_id: { type: "uuid" },
      user_id: { type: "uuid" },
      member_role: text("member"),
      joined_at: createdAt,
      // Set when a student joins with a code, so the rules can check it.
      join_code: optional("text"),
    },
    key: ["team_id", "user_id"],
    references: [cascade("team_id", "teams"), cascade("user_id", USERS)],
  },
  missions: {
    columns: {
      id,
      mod_id: optional("uuid"),
      title: text(),
      description: text(""),
      stage: text(""),
      mission_date: { type: "date", default: today },
      due_date: optional("date"),
      past_due_at: optional("timestamp"),
      created_at: createdAt,
    },
    references: [cascade("mod_id", "mods")],
  },
  entries: {
    columns: {
      id,
      user_id: { type: "uuid" },
      team_id: optional("uuid"),
      entry_type: text("notebook"),
      title: text(),
      content: text(""),
      stage: text(""),
      mission_id: optional("uuid"),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    references: [
      cascade("user_id", USERS),
      setNull("team_id", "teams"),
      setNull("mission_id", "stage_missions"),
    ],
  },
  evidence: {
    columns: {
      id,
      user_id: { type: "uuid" },
      team_id: optional("uuid"),
      title: text(),
      description: text(""),
      evidence_type: text("link"),
      url: text(""),
      stage: text(""),
      created_at: createdAt,
    },
    references: [cascade("user_id", USERS), cascade("team_id", "teams")],
  },
  sprints: {
    columns: {
      id,
      team_id: { type: "uuid" },
      name: text(),
      goal: text(""),
      start_date: optional("date"),
      end_date: optional("date"),
      status: text("planned"),
      created_at: createdAt,
    },
    references: [cascade("team_id", "teams")],
  },
  tasks: {
    columns: {
      id,
      team_id: { type: "uuid" },
      sprint_id: optional("uuid"),
      title: text(),
      description: text(""),
      status: text("todo"),
      assignee_id: optional("uuid"),
      created_by: optional("uuid"),
      created_at: createdAt,
    },
    references: [
      cascade("team_id", "teams"),
      setNull("sprint_id", "sprints"),
      setNull("assignee_id", USERS),
      setNull("created_by", USERS),
    ],
  },
  meeting_minutes: {
    columns: {
      id,
      team_id: { type: "uuid" },
      meeting_date: { type: "date", default: today },
      attendees: text(""),
      notes: text(""),
      decisions: text(""),
      created_by: optional("uuid"),
      created_at: createdAt,
    },
    references: [cascade("team_id", "teams"), setNull("created_by", USERS)],
  },
  risks: {
    columns: {
      id,
      team_id: { type: "uuid" },
      description: text(),
      likelihood: text("medium"),
      impact: text("medium"),
      mitigation: text(""),
      status: text("open"),
      created_at: createdAt,
    },
    references: [cascade("team_id", "teams")],
  },
  requests: {
    columns: {
      id,
      user_id: { type: "uuid" },
      team_id: optional("uuid"),
      kind: text("supply"),
      item: text(),
      details: text(""),
      quantity: text(""),
      status: text("pending"),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    references: [cascade("user_id", USERS), setNull("team_id", "teams")],
  },
  feedback: {
    columns: {
      id,
      author_id: { type: "uuid" },
      target_user_id: optional("uuid"),
      team_id: optional("uuid"),
      entry_id: optional("uuid"),
      mission_id: optional("uuid"),
      content: text(),
      created_at: createdAt,
    },
    references: [
      cascade("author_id", USERS),
      cascade("target_user_id", USERS),
      cascade("team_id", "teams"),
      cascade("entry_id", "entries"),
      cascade("mission_id", "missions"),
    ],
  },
  stage_guides: {
    columns: {
      id,
      stage: text(),
      title: text(),
      instructions: text(""),
      sort_order: int(0),
      updated_at: updatedAt,
      created_at: createdAt,
    },
  },
  stage_missions: {
    columns: {
      id,
      stage: text(),
      title: text(),
      prompt: text(""),
      sort_order: int(0),
      updated_at: updatedAt,
      created_at: createdAt,
    },
  },
  learning_targets: {
    columns: {
      id,
      key: text(),
      title: text(),
      description: text(""),
      stage: optional("text"),
      sort_order: int(0),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
  },
  rubric_criteria: {
    columns: {
      id,
      target_id: { type: "uuid" },
      level: text(),
      criterion: text(),
      sort_order: int(0),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
    references: [cascade("target_id", "learning_targets")],
  },
  rubric_scores: {
    columns: {
      id,
      target_id: { type: "uuid" },
      teacher_id: { type: "uuid" },
      student_id: optional("uuid"),
      team_id: optional("uuid"),
      entry_id: optional("uuid"),
      level: text(),
      note: text(""),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
    references: [
      cascade("target_id", "learning_targets"),
      noAction("teacher_id", USERS),
      cascade("student_id", USERS),
      cascade("team_id", "teams"),
      setNull("entry_id", "entries"),
    ],
  },
  resource_docs: {
    columns: {
      id,
      slug: text(),
      kind: text(),
      title: text(),
      summary: text(""),
      stage: optional("text"),
      sort_order: int(0),
      body: text(""),
      updated_by: optional("uuid"),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
  },
  pacing_weeks: {
    columns: {
      id,
      week_number: { type: "int" },
      start_date: { type: "date" },
      end_date: { type: "date" },
      focus: text(),
      stage: optional("text"),
      milestones: text(""),
      deliverables: text(""),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
  },
  mod_enrollments: {
    columns: {
      id: { type: "text" },
      mod_id: { type: "uuid" },
      email: { type: "text" },
      student_id: optional("uuid"),
      added_by: optional("uuid"),
      student_name: optional("text"),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    key: ["mod_id", "email"],
    touch: true,
    references: [
      cascade("mod_id", "mods"),
      setNull("student_id", USERS),
      noAction("added_by", USERS),
    ],
  },
  team_pacing_weeks: {
    columns: {
      id: { type: "text" },
      team_id: { type: "uuid" },
      week_number: { type: "int" },
      start_date: { type: "date" },
      end_date: { type: "date" },
      focus: text(""),
      stage: optional("text"),
      milestones: text(""),
      deliverables: text(""),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    key: ["team_id", "week_number"],
    touch: true,
    references: [cascade("team_id", "teams")],
  },
  mission_completions: {
    columns: {
      id: { type: "text" },
      mission_id: { type: "uuid" },
      team_id: { type: "uuid" },
      completed_by: optional("uuid"),
      completed_at: createdAt,
    },
    key: ["mission_id", "team_id"],
    references: [
      cascade("mission_id", "missions"),
      cascade("team_id", "teams"),
      setNull("completed_by", USERS),
    ],
  },
  mission_rubric_criteria: {
    columns: {
      id,
      mission_id: { type: "uuid" },
      label: text(),
      description: text(""),
      points: int(4),
      sort_order: int(0),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    touch: true,
    references: [cascade("mission_id", "stage_missions")],
  },
  mission_exemplars: {
    columns: {
      id: { type: "text" },
      mission_id: { type: "uuid" },
      content: text(""),
      updated_by: optional("uuid"),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    key: ["mission_id"],
    touch: true,
    references: [cascade("mission_id", "stage_missions"), noAction("updated_by", USERS)],
  },
  mission_grades: {
    columns: {
      id: { type: "text" },
      mission_id: { type: "uuid" },
      team_id: { type: "uuid" },
      teacher_id: { type: "uuid" },
      scores: { type: "json", default: () => ({}) },
      total_points: int(0),
      possible_points: int(0),
      feedback: text(""),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    key: ["mission_id", "team_id"],
    touch: true,
    references: [
      cascade("mission_id", "stage_missions"),
      cascade("team_id", "teams"),
      noAction("teacher_id", USERS),
    ],
  },
  // New with Firebase: the teacher's Drive guides and templates, synced from
  // the Resource Library (the server used to list the teacher's Drive live).
  class_drive_files: {
    columns: {
      id: { type: "text" },
      name: text(),
      mime_type: text(""),
      web_view_link: optional("text"),
      modified_time: optional("timestamp"),
      synced_at: createdAt,
    },
  },
  notifications: {
    columns: {
      id,
      recipient_id: { type: "uuid" },
      kind: text(),
      actor_id: optional("uuid"),
      team_id: optional("uuid"),
      entry_id: optional("uuid"),
      mission_id: optional("uuid"),
      stage: text(""),
      title: text(),
      body: text(""),
      read_at: optional("timestamp"),
      created_at: createdAt,
    },
    references: [
      cascade("recipient_id", USERS),
      setNull("actor_id", USERS),
      cascade("team_id", "teams"),
      cascade("entry_id", "entries"),
    ],
  },
};

/** The collection whose documents stand for a referenced row (users live in profiles). */
export const collectionFor = (table: string) => (table === USERS ? "profiles" : table);

export function tableDef(table: string): TableDef {
  const def = TABLES[table];
  if (!def) throw new Error(`Unknown table "${table}"`);
  return def;
}

/** Document ID for a row. Keyed tables join their unique columns with "_". */
export function docId(table: string, row: Record<string, unknown>): string {
  const { key } = tableDef(table);
  if (!key) return String(row.id);
  return key.map((column) => String(row[column])).join("_");
}

/** Every foreign key in the model that points at `table`. */
export function referencesTo(table: string): Array<Reference & { from: string }> {
  const found: Array<Reference & { from: string }> = [];
  for (const [from, def] of Object.entries(TABLES))
    for (const ref of def.references ?? []) if (ref.table === table) found.push({ ...ref, from });
  return found;
}
