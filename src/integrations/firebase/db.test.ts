import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createDataClient, type DataClient } from "./db";
import { parseFilter, parseOr, parseSelect, planBranches, sortRows, type Row } from "./query";
import { memoryStore, staticAccess, type MemoryStore } from "./testing";

// ---------------------------------------------------------------- fixture ---
// Two teachers, students s1 + s2 on team A (Mod 1) and s3 on team B (Mod 2).

const at = (minute: number) => `2026-09-01T10:${String(minute).padStart(2, "0")}:00.000Z`;

function fixture(): Record<string, Row[]> {
  const people = ["t1", "t2", "s1", "s2", "s3"];
  return {
    profiles: people.map((id) => ({
      id,
      full_name: `Person ${id}`,
      avatar_url: null,
      created_at: at(0),
    })),
    user_roles: people.map((id) => ({
      id,
      user_id: id,
      role: id.startsWith("t") ? "teacher" : "student",
    })),
    user_accounts: people.map((id) => ({
      id,
      email: `${id}@school.test`,
      email_verified: true,
      created_at: at(0),
      updated_at: at(0),
    })),
    mods: [
      { id: "m1", name: "Mod 1", sort_order: 1 },
      { id: "m2", name: "Mod 2", sort_order: 2 },
    ],
    teams: [
      {
        id: "A",
        mod_id: "m1",
        name: "Alpha",
        client_name: "",
        project_focus: "",
        join_code: "CODEA1",
        current_stage: "kickoff",
        created_by: "t1",
        created_at: at(1),
      },
      {
        id: "B",
        mod_id: "m2",
        name: "Bravo",
        client_name: "",
        project_focus: "",
        join_code: "CODEB2",
        current_stage: "kickoff",
        created_by: "t1",
        created_at: at(2),
      },
    ],
    team_codes: [
      { id: "CODEA1", code: "CODEA1", team_id: "A" },
      { id: "CODEB2", code: "CODEB2", team_id: "B" },
    ],
    team_members: [
      {
        id: "A_s1",
        team_id: "A",
        user_id: "s1",
        member_role: "member",
        joined_at: at(3),
        join_code: null,
      },
      {
        id: "A_s2",
        team_id: "A",
        user_id: "s2",
        member_role: "member",
        joined_at: at(4),
        join_code: null,
      },
      {
        id: "B_s3",
        team_id: "B",
        user_id: "s3",
        member_role: "member",
        joined_at: at(5),
        join_code: null,
      },
    ],
    stage_missions: [
      {
        id: "sm1",
        stage: "kickoff",
        title: "Client Need Statement",
        prompt: "",
        sort_order: 1,
        created_at: at(0),
        updated_at: at(0),
      },
    ],
    missions: [
      {
        id: "mi1",
        mod_id: null,
        title: "Everyone",
        description: "",
        stage: "",
        mission_date: "2026-09-01",
        due_date: null,
        past_due_at: null,
        created_at: at(1),
      },
      {
        id: "mi2",
        mod_id: "m1",
        title: "Mod 1 only",
        description: "",
        stage: "",
        mission_date: "2026-09-02",
        due_date: null,
        past_due_at: null,
        created_at: at(2),
      },
      {
        id: "mi3",
        mod_id: "m2",
        title: "Mod 2 only",
        description: "",
        stage: "",
        mission_date: "2026-09-03",
        due_date: null,
        past_due_at: null,
        created_at: at(3),
      },
    ],
    entries: [
      {
        id: "e1",
        user_id: "s1",
        team_id: "A",
        entry_type: "notebook",
        title: "Need",
        content: "v1",
        stage: "kickoff",
        mission_id: "sm1",
        created_at: at(10),
        updated_at: at(10),
      },
      {
        id: "e2",
        user_id: "s2",
        team_id: "A",
        entry_type: "notebook",
        title: "Sketch",
        content: "",
        stage: "brainstorm",
        mission_id: null,
        created_at: at(11),
        updated_at: at(11),
      },
      {
        id: "e3",
        user_id: "s3",
        team_id: "B",
        entry_type: "notebook",
        title: "Other team",
        content: "",
        stage: "",
        mission_id: null,
        created_at: at(12),
        updated_at: at(12),
      },
      {
        id: "e4",
        user_id: "s1",
        team_id: null,
        entry_type: "notebook",
        title: "Solo",
        content: "",
        stage: "",
        mission_id: null,
        created_at: at(13),
        updated_at: at(13),
      },
    ],
    evidence: [
      {
        id: "v1",
        user_id: "s1",
        team_id: "A",
        title: "Photo",
        description: "",
        evidence_type: "link",
        url: "",
        stage: "",
        created_at: at(14),
      },
      {
        id: "v2",
        user_id: "s1",
        team_id: null,
        title: "Link",
        description: "",
        evidence_type: "link",
        url: "",
        stage: "",
        created_at: at(15),
      },
    ],
    feedback: [
      {
        id: "f1",
        author_id: "t1",
        target_user_id: "s1",
        team_id: "A",
        entry_id: "e1",
        mission_id: null,
        content: "Nice",
        created_at: at(20),
      },
      {
        id: "f2",
        author_id: "t1",
        target_user_id: "s3",
        team_id: "B",
        entry_id: null,
        mission_id: "mi3",
        content: "Keep going",
        created_at: at(21),
      },
    ],
    notifications: [
      {
        id: "n1",
        recipient_id: "t1",
        kind: "mission_submitted",
        actor_id: "s1",
        team_id: "A",
        entry_id: "e1",
        mission_id: "sm1",
        stage: "",
        title: "x",
        body: "",
        read_at: null,
        created_at: at(22),
      },
      {
        id: "n2",
        recipient_id: "t2",
        kind: "mission_submitted",
        actor_id: "s1",
        team_id: "A",
        entry_id: "e1",
        mission_id: "sm1",
        stage: "",
        title: "x",
        body: "",
        read_at: null,
        created_at: at(23),
      },
    ],
    mission_completions: [
      { id: "mi1_A", mission_id: "mi1", team_id: "A", completed_by: "s1", completed_at: at(24) },
    ],
    mission_grades: [
      {
        id: "sm1_A",
        mission_id: "sm1",
        team_id: "A",
        teacher_id: "t1",
        scores: { a: 4 },
        total_points: 4,
        possible_points: 4,
        feedback: "",
        created_at: at(25),
        updated_at: at(25),
      },
    ],
    mod_enrollments: [
      {
        id: "m1_s1@school.test",
        mod_id: "m1",
        email: "s1@school.test",
        student_id: "s1",
        added_by: "t1",
        student_name: null,
        created_at: at(0),
        updated_at: at(0),
      },
      {
        id: "m1_s2@school.test",
        mod_id: "m1",
        email: "s2@school.test",
        student_id: "s2",
        added_by: "t1",
        student_name: null,
        created_at: at(0),
        updated_at: at(0),
      },
    ],
  };
}

const memberships: Record<string, { teamIds: string[]; modIds: string[] }> = {
  s1: { teamIds: ["A"], modIds: ["m1"] },
  s2: { teamIds: ["A"], modIds: ["m1"] },
  s3: { teamIds: ["B"], modIds: ["m2"] },
};

function as(
  uid: string,
  store: MemoryStore = memoryStore(fixture()),
): { db: DataClient; store: MemoryStore } {
  const access = staticAccess({ uid, isTeacher: uid.startsWith("t"), ...memberships[uid] });
  return { db: createDataClient(store, access), store };
}

const ids = (rows: unknown) => (rows as Row[]).map((r) => r.id);

// ------------------------------------------------------------ query.ts ---

describe("parsing", () => {
  it("reads select strings with nested and aliased embeds", () => {
    assert.deepEqual(parseSelect("team_id, teams(id, name, mods(name))"), {
      star: false,
      columns: ["team_id"],
      embeds: [
        {
          as: "teams",
          target: "teams",
          select: {
            star: false,
            columns: ["id", "name"],
            embeds: [
              {
                as: "mods",
                target: "mods",
                select: { star: false, columns: ["name"], embeds: [] },
              },
            ],
          },
        },
      ],
    });
    const aliased = parseSelect("*, missions:mission_id (title)");
    assert.equal(aliased.star, true);
    assert.deepEqual(aliased.embeds[0], {
      as: "missions",
      target: "mission_id",
      select: { star: false, columns: ["title"], embeds: [] },
    });
  });

  it("reads PostgREST filters", () => {
    assert.deepEqual(parseOr("team_id.eq.A,user_id.in.(s1,s2),mod_id.is.null"), {
      or: [
        { column: "team_id", op: "eq", value: "A", negate: false },
        { column: "user_id", op: "in", value: ["s1", "s2"], negate: false },
        { column: "mod_id", op: "is", value: null, negate: false },
      ],
    });
    assert.deepEqual(parseFilter("student_id.not.is.null"), {
      column: "student_id",
      op: "is",
      value: null,
      negate: true,
    });
  });

  it("sorts NULLs last ascending and first descending, like Postgres", () => {
    const rows = [{ v: 2 }, { v: null }, { v: 1 }];
    assert.deepEqual(
      sortRows(rows, [{ column: "v", ascending: true }]).map((r) => r.v),
      [1, 2, null],
    );
    assert.deepEqual(
      sortRows(rows, [{ column: "v", ascending: false }]).map((r) => r.v),
      [null, 2, 1],
    );
  });
});

describe("planBranches", () => {
  it("unions a caller's scope with the query's own filters", () => {
    const branches = planBranches(
      [{ column: "stage", op: "eq", value: "test" }],
      [{ user_id: "s1" }, { team_id: "A" }],
    );
    assert.deepEqual(branches, [
      { eq: { stage: "test", user_id: "s1" } },
      { eq: { stage: "test", team_id: "A" } },
    ]);
  });

  it("drops scope alternatives that contradict the filters", () => {
    const branches = planBranches(
      [{ column: "team_id", op: "eq", value: "B" }],
      [{ user_id: "s1" }, { team_id: "A" }],
    );
    assert.deepEqual(branches, [{ eq: { team_id: "B", user_id: "s1" } }]);
  });

  it("keeps `in` lists for unrestricted callers, in chunks of 30", () => {
    const values = Array.from({ length: 45 }, (_, i) => `u${i}`);
    const branches = planBranches([{ column: "id", op: "in", value: values }], null);
    assert.deepEqual(
      branches.map((b) => b.in?.values.length),
      [30, 15],
    );
  });

  it("splits `in` lists into single values when scoped, so rules can check each", () => {
    const branches = planBranches(
      [{ column: "user_id", op: "in", value: ["s1", "s2"] }],
      [{ team_id: "A" }],
    );
    assert.deepEqual(branches, [
      { eq: { user_id: "s1", team_id: "A" } },
      { eq: { user_id: "s2", team_id: "A" } },
    ]);
  });
});

// ----------------------------------------------------------------- reads ---

describe("reads", () => {
  it("shows a student their own and their team's entries, like the old RLS policy", async () => {
    const { db } = as("s1");
    const all = await db.from("entries").select("*").order("created_at", { ascending: false });
    assert.equal(all.error, null);
    assert.deepEqual(ids(all.data), ["e4", "e2", "e1"]);

    const notebook = await db
      .from("entries")
      .select("*")
      .or("user_id.eq.s1,team_id.eq.A")
      .order("created_at", { ascending: false });
    assert.deepEqual(ids(notebook.data), ["e4", "e2", "e1"]);

    const otherTeam = await db.from("entries").select("*").eq("team_id", "B");
    assert.deepEqual(otherTeam.data, []);
  });

  it("shows teachers everything", async () => {
    const { db } = as("t1");
    const { data } = await db.from("entries").select("id").order("created_at");
    assert.deepEqual(ids(data), ["e1", "e2", "e3", "e4"]);
  });

  it("only ever returns your own notifications", async () => {
    const { db } = as("t1");
    const { data } = await db
      .from("notifications")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(30);
    assert.deepEqual(ids(data), ["n1"]);
  });

  it("embeds many-to-one rows, nested", async () => {
    const { db } = as("s1");
    const { data, error } = await db
      .from("team_members")
      .select("team_id, teams(id, name, mod_id, current_stage, join_code, mods(name))")
      .eq("user_id", "s1")
      .limit(1)
      .maybeSingle();
    assert.equal(error, null);
    assert.deepEqual(data, {
      team_id: "A",
      teams: {
        id: "A",
        name: "Alpha",
        mod_id: "m1",
        current_stage: "kickoff",
        join_code: "CODEA1",
        mods: { name: "Mod 1" },
      },
    });
  });

  it("embeds through a foreign-key alias", async () => {
    const { db } = as("s3");
    const { data } = await db
      .from("feedback")
      .select("*, missions:mission_id (title)")
      .or("target_user_id.eq.s3,team_id.eq.B");
    assert.equal((data as Row[])[0]?.id, "f2");
    assert.deepEqual((data as Row[])[0]?.missions, { title: "Mod 2 only" });
  });

  it("filters by mod with or(is.null, eq) and a date range", async () => {
    const { db } = as("s1");
    const { data } = await db
      .from("missions")
      .select("*, mods(name)")
      .lte("mission_date", "2026-09-02")
      .or("mod_id.is.null,mod_id.eq.m1")
      .order("mission_date", { ascending: false });
    assert.deepEqual(ids(data), ["mi2", "mi1"]);
    assert.deepEqual((data as Row[])[0]?.mods, { name: "Mod 1" });
  });

  it("counts with head, and treats NULL as not equal to anything", async () => {
    const { db } = as("s1");
    const evidence = await db
      .from("evidence")
      .select("id", { count: "exact", head: true })
      .eq("user_id", "s1");
    assert.equal(evidence.count, 2);
    assert.equal(evidence.data, null);
    const notDone = await db
      .from("entries")
      .select("id", { count: "exact", head: true })
      .neq("stage", "kickoff");
    assert.equal(notDone.count, 2);
    const classmates = await db
      .from("mod_enrollments")
      .select("student_id")
      .eq("mod_id", "m1")
      .not("student_id", "is", null);
    assert.deepEqual((classmates.data as Row[]).map((r) => r.student_id).sort(), ["s1", "s2"]);
  });

  it("reports single() misses like PostgREST and returns null from maybeSingle()", async () => {
    const { db } = as("s1");
    const missing = await db.from("teams").select("*").eq("id", "B").maybeSingle();
    assert.equal(missing.error, null);
    assert.equal(missing.data, null);
    const single = await db.from("teams").select("*").eq("id", "B").single();
    assert.equal(single.error?.code, "PGRST116");
  });

  it("hides teacher-only rows from students", async () => {
    const { db } = as("s1");
    const { data } = await db.from("mission_exemplars").select("*");
    assert.deepEqual(data, []);
  });
});

// ---------------------------------------------------------------- writes ---

describe("writes", () => {
  it("fills column defaults and enforces NOT NULL", async () => {
    const { db, store } = as("s1");
    const { data, error } = await db
      .from("requests")
      .insert({ item: "Tape", user_id: "s1", team_id: "A" })
      .select("*")
      .single();
    assert.equal(error, null);
    const row = data as Row;
    assert.equal(row.status, "pending");
    assert.equal(row.kind, "supply");
    assert.equal(store.data.get("requests")?.get(String(row.id))?.details, "");

    const missing = await db
      .from("requests")
      // Deliberately missing the required item column.
      .insert({ user_id: "s1" } as never);
    assert.equal(missing.error?.code, "23502");
  });

  it("uses unique keys as document IDs and rejects duplicates", async () => {
    const { db, store } = as("s2");
    const again = await db
      .from("mission_completions")
      .insert({ mission_id: "mi1", team_id: "A", completed_by: "s2" });
    assert.equal(again.error?.code, "23505");
    const fresh = await db
      .from("mission_completions")
      .insert({ mission_id: "mi2", team_id: "A", completed_by: "s2" });
    assert.equal(fresh.error, null);
    assert.ok(store.data.get("mission_completions")?.has("mi2_A"));
  });

  it("upserts on the key and refreshes updated_at", async () => {
    const { db, store } = as("t1");
    const { error } = await db
      .from("mission_grades")
      .upsert(
        { mission_id: "sm1", team_id: "A", teacher_id: "t1", total_points: 3 },
        { onConflict: "mission_id,team_id" },
      );
    assert.equal(error, null);
    const grade = store.data.get("mission_grades")?.get("sm1_A");
    assert.equal(grade?.total_points, 3);
    assert.deepEqual(grade?.scores, { a: 4 });
    assert.notEqual(grade?.updated_at, at(25));
  });

  it("updates only rows the caller can see", async () => {
    const { db, store } = as("t1");
    const { error } = await db
      .from("notifications")
      .update({ read_at: at(30) })
      .is("read_at", null);
    assert.equal(error, null);
    assert.equal(store.data.get("notifications")?.get("n1")?.read_at, at(30));
    assert.equal(store.data.get("notifications")?.get("n2")?.read_at, null);
  });

  it("refuses to change a row's key", async () => {
    const { db } = as("t1");
    const { error } = await db.from("team_members").update({ team_id: "B" }).eq("id", "A_s1");
    assert.equal(error?.code, "PGRST100");
  });
});

// ------------------------------------------------ what Postgres did itself ---

describe("cascades", () => {
  it("deleting a team removes or unlinks everything that pointed at it", async () => {
    const { db, store } = as("t1");
    const { error } = await db.from("teams").delete().eq("id", "A");
    assert.equal(error, null);
    const docs = (name: string) => store.data.get(name)!;
    assert.deepEqual([...docs("team_members").keys()], ["B_s3"]);
    assert.equal(docs("team_codes").has("CODEA1"), false);
    assert.equal(docs("entries").get("e1")?.team_id, null);
    assert.equal(docs("entries").get("e2")?.team_id, null);
    assert.equal(docs("feedback").has("f1"), false);
    assert.equal(docs("evidence").has("v1"), false);
    assert.equal(docs("mission_completions").size, 0);
    assert.equal(docs("mission_grades").size, 0);
    assert.equal(docs("notifications").size, 0);
  });

  it("deleting an entry removes its feedback and notifications", async () => {
    const { db, store } = as("s1");
    const { error } = await db.from("entries").delete().eq("id", "e1");
    assert.equal(error, null);
    assert.equal(store.data.get("feedback")?.has("f1"), false);
    assert.equal(store.data.get("notifications")?.size, 0);
  });

  it("deleting an account removes its profile, role and work", async () => {
    const { db, store } = as("t1");
    await db.deleteUser("s2");
    const docs = (name: string) => store.data.get(name)!;
    assert.equal(docs("profiles").has("s2"), false);
    assert.equal(docs("user_roles").has("s2"), false);
    assert.equal(docs("user_accounts").has("s2"), false);
    assert.equal(docs("team_members").has("A_s2"), false);
    assert.equal(docs("entries").has("e2"), false);
    assert.equal(docs("mod_enrollments").get("m1_s2@school.test")?.student_id, null);
  });
});

describe("triggers and functions", () => {
  it("join_team_by_code adds the student with the code the rules check", async () => {
    const { db, store } = as("s3");
    const joined = await db.rpc("join_team_by_code", { _code: " codea1 " });
    assert.equal(joined.error, null);
    assert.equal(joined.data, "A");
    assert.equal(store.data.get("team_members")?.get("A_s3")?.join_code, "CODEA1");

    const again = await db.rpc("join_team_by_code", { _code: "CODEA1" });
    assert.equal(again.error, null);
    const bad = await db.rpc("join_team_by_code", { _code: "NOPE00" });
    assert.equal(bad.error?.message, "Invalid join code");
  });

  it("a new team gets a join-code lookup", async () => {
    const { db, store } = as("t1");
    const { data } = await db
      .from("teams")
      .insert({ name: "Charlie", created_by: "t1" })
      .select("id, join_code")
      .single();
    const team = data as Row;
    assert.match(String(team.join_code), /^[0-9A-F]{6}$/);
    assert.equal(store.data.get("team_codes")?.get(String(team.join_code))?.team_id, team.id);
  });

  it("a roster email links an existing account and makes it a student", async () => {
    const store = memoryStore(fixture());
    store.data.get("user_accounts")!.set("s9", {
      id: "s9",
      email: "new@school.test",
      email_verified: true,
      created_at: at(0),
      updated_at: at(0),
    });
    const { db } = as("t1", store);
    const { error } = await db
      .from("mod_enrollments")
      .insert({ mod_id: "m2", email: " New@School.test ", added_by: "t1" });
    assert.equal(error, null);
    const spot = store.data.get("mod_enrollments")?.get("m2_new@school.test");
    assert.equal(spot?.student_id, "s9");
    assert.equal(store.data.get("user_roles")?.get("s9")?.role, "student");
  });

  it("a student's mission response notifies every teacher", async () => {
    const { db, store } = as("s2");
    const before = store.data.get("notifications")!.size;
    const { data } = await db
      .from("entries")
      .insert({
        user_id: "s2",
        team_id: "A",
        title: "My response",
        mission_id: "sm1",
        stage: "kickoff",
      })
      .select("id")
      .single();
    const created = [...store.data.get("notifications")!.values()].slice(before);
    assert.deepEqual(created.map((n) => n.recipient_id).sort(), ["t1", "t2"]);
    // The team's work on this mission is already graded.
    assert.equal(created[0]?.kind, "graded_mission_changed");
    assert.equal(created[0]?.body, "Person s2 (Alpha) · Client Need Statement");

    const id = (data as Row).id as string;
    await db.from("entries").update({ stage: "kickoff" }).eq("id", id);
    assert.equal(
      store.data.get("notifications")!.size,
      before + 2,
      "no notice when the text is unchanged",
    );
    await db.from("entries").update({ content: "more" }).eq("id", id);
    assert.equal(store.data.get("notifications")!.size, before + 4);
  });

  it("teachers' own mission entries don't notify anyone", async () => {
    const { db, store } = as("t1");
    const before = store.data.get("notifications")!.size;
    await db.from("entries").insert({ user_id: "t1", title: "Example", mission_id: "sm1" });
    assert.equal(store.data.get("notifications")!.size, before);
  });
});

describe("realtime", () => {
  it("delivers changes only within the caller's scope", async () => {
    const store = memoryStore(fixture());
    const { db } = as("t1", store);
    const seen: string[] = [];
    const channel = db
      .channel("test")
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, (payload) =>
        seen.push(`${payload.eventType}:${payload.new.id ?? payload.old.id}`),
      )
      .subscribe();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { db: student } = as("s1", store);
    await student
      .from("entries")
      .insert({ user_id: "s1", team_id: "A", title: "Ping", mission_id: "sm1" });
    await db.removeChannel(channel);
    assert.equal(seen.length, 1);
    assert.match(seen[0]!, /^INSERT:/);
  });
});
