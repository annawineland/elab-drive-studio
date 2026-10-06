import { db, getAccess } from "@/integrations/firebase/client";

async function requireTeacher(action: string) {
  const access = await getAccess().current();
  if (!access?.isTeacher) throw new Error(`Only teachers can ${action}`);
  return access;
}

/**
 * Permanently deletes a student's account data and everything they created
 * (notebook entries, evidence, requests, feedback, scores, team membership,
 * roster spots). Teacher-only. Cannot be undone.
 *
 * Their Firebase sign-in stays until removed in the Firebase console; signing
 * in again starts them over as a brand-new account.
 */
export async function deleteStudentAccount(studentId: string) {
  const access = await requireTeacher("remove student accounts");
  if (studentId === access.uid) throw new Error("You cannot delete your own account here");

  const { data: role, error: roleError } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", studentId)
    .maybeSingle();
  if (roleError) throw roleError;
  if (role?.role === "teacher") throw new Error("That account is a teacher account");

  // Roster rows only null out the student link on cascade — remove them too.
  const { error: rosterError } = await db
    .from("mod_enrollments")
    .delete()
    .eq("student_id", studentId);
  if (rosterError) throw rosterError;

  await db.deleteUser(studentId);
  return { ok: true };
}

/**
 * Lists signed-in accounts that are not on any mod roster, so the teacher can
 * still delete them. Teacher-only.
 */
export async function listUnrosteredAccounts() {
  const access = await requireTeacher("view accounts");

  const [enrolled, teachers, profiles, accounts] = await Promise.all([
    db.from("mod_enrollments").select("student_id").not("student_id", "is", null),
    db.from("user_roles").select("user_id").eq("role", "teacher"),
    db.from("profiles").select("id, full_name"),
    db.from("user_accounts").select("id, email"),
  ]);
  for (const result of [enrolled, teachers, profiles, accounts])
    if (result.error) throw result.error;

  const enrolledIds = new Set((enrolled.data ?? []).map((e) => e.student_id as string));
  const teacherIds = new Set((teachers.data ?? []).map((r) => r.user_id));
  const names = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));

  const list = (accounts.data ?? [])
    .filter((a) => !enrolledIds.has(a.id) && !teacherIds.has(a.id) && a.id !== access.uid)
    .map((a) => ({ id: a.id, email: a.email, name: names.get(a.id) ?? null }));
  list.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
  return list;
}
