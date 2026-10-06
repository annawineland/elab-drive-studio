/**
 * Who is asking, and which rows they may see.
 *
 * Postgres row-level security filtered queries silently: "select * from
 * notifications" returned only your own. Firestore rules don't filter — they
 * reject any query that could return a document you can't read. So every
 * query carries the caller's scope from `scopeFor`, mirroring the old RLS
 * policies, and firestore.rules checks the same conditions.
 */
import type { Auth, User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import type { Scope } from "./query";

export interface Access {
  uid: string;
  /** Lowercased sign-in email. */
  email: string | null;
  emailVerified: boolean;
  isTeacher: boolean;
  teamIds: string[];
  modIds: string[];
}

export interface AccessSource {
  /** The signed-in caller, or null when nobody (or an unverified account) is signed in. */
  current(): Promise<Access | null>;
}

/** The rows of `table` the caller may read, as alternatives of equality filters. */
export function scopeFor(table: string, access: Access): Scope {
  const { uid } = access;
  const teams = access.teamIds.map((team_id) => ({ team_id }));

  // Only ever your own, teachers included.
  if (table === "notifications") return [{ recipient_id: uid }];
  if (access.isTeacher) return null;

  switch (table) {
    case "entries":
    case "evidence":
    case "requests":
      return [{ user_id: uid }, ...teams];
    case "feedback":
      return [{ author_id: uid }, { target_user_id: uid }, ...teams];
    case "rubric_scores":
      return [{ student_id: uid }, ...teams];
    case "teams":
      return [{ created_by: uid }, ...access.teamIds.map((id) => ({ id }))];
    case "team_members":
      return [{ user_id: uid }, ...teams];
    case "sprints":
    case "tasks":
    case "meeting_minutes":
    case "risks":
    case "team_pacing_weeks":
    case "mission_completions":
    case "mission_grades":
      return teams;
    case "user_roles":
      // Teacher roles are readable by everyone so students' mission posts can notify them.
      return [{ user_id: uid }, { role: "teacher" }];
    case "user_accounts":
      return [{ id: uid }];
    case "mod_enrollments":
      return [
        { student_id: uid },
        ...access.modIds.map((mod_id) => ({ mod_id })),
        ...(access.emailVerified && access.email ? [{ email: access.email }] : []),
      ];
    case "mission_exemplars":
    case "team_codes":
      return [];
    default:
      return null;
  }
}

/**
 * Tracks the signed-in user's role, teams and mods with live listeners, so a
 * teacher adding a student to a team takes effect without a reload.
 */
export function firebaseAccess(auth: Auth, firestore: Firestore): AccessSource {
  let ready: Promise<Access | null> = new Promise(() => {});
  let resolveReady: (value: Access | null) => void = () => {};
  let latest: Access | null = null;
  let stop: Unsubscribe[] = [];
  let authKnown = false;

  const reset = () => {
    ready = new Promise((resolve) => (resolveReady = resolve));
  };
  reset();

  const watch = (user: User) => {
    const state: Access = {
      uid: user.uid,
      email: user.email?.toLowerCase() ?? null,
      emailVerified: user.emailVerified,
      isTeacher: false,
      teamIds: [],
      modIds: [],
    };
    const pending = new Set(["role", "teams", "mods"]);
    const loaded = (part: string) => {
      pending.delete(part);
      if (pending.size > 0) return;
      latest = { ...state };
      resolveReady(latest);
    };
    const failed = (part: string) => (error: Error) => {
      console.error(`[firebase] could not load your ${part}:`, error.message);
      loaded(part);
    };
    stop = [
      onSnapshot(
        doc(firestore, "user_roles", user.uid),
        (snapshot) => {
          state.isTeacher = snapshot.exists() && snapshot.data().role === "teacher";
          loaded("role");
        },
        failed("role"),
      ),
      onSnapshot(
        query(collection(firestore, "team_members"), where("user_id", "==", user.uid)),
        (snapshot) => {
          state.teamIds = snapshot.docs.map((d) => String(d.data().team_id));
          loaded("teams");
        },
        failed("teams"),
      ),
      onSnapshot(
        query(collection(firestore, "mod_enrollments"), where("student_id", "==", user.uid)),
        (snapshot) => {
          state.modIds = [...new Set(snapshot.docs.map((d) => String(d.data().mod_id)))];
          loaded("mods");
        },
        failed("mods"),
      ),
    ];
  };

  onAuthStateChanged(auth, (user) => {
    stop.forEach((unsubscribe) => unsubscribe());
    stop = [];
    latest = null;
    if (authKnown) {
      // Settle anyone still waiting on the previous account before starting over.
      resolveReady(null);
      reset();
    }
    authKnown = true;
    // Unverified email/password accounts get no data access, as with Supabase's
    // confirm-email setting; the rules enforce the same.
    if (user && user.emailVerified) watch(user);
    else resolveReady(null);
  });

  return {
    current: () => (latest ? Promise.resolve(latest) : ready),
  };
}
