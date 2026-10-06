import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Permanently deletes a student's account and everything they created
 * (notebook entries, evidence, requests, feedback, scores, team membership,
 * roster spots). Teacher-only. Cannot be undone.
 */
export const deleteStudentAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { studentId: string }) => {
    if (!input?.studentId) throw new Error("Missing student");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isTeacher, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "teacher",
    });
    if (roleErr) throw roleErr;
    if (!isTeacher) throw new Error("Only teachers can remove student accounts");
    if (data.studentId === userId) throw new Error("You cannot delete your own account here");

    const { data: targetIsTeacher, error: tErr } = await supabase.rpc("has_role", {
      _user_id: data.studentId,
      _role: "teacher",
    });
    if (tErr) throw tErr;
    if (targetIsTeacher) throw new Error("That account is a teacher account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Roster rows only null out the student link on cascade — remove them too.
    const { error: rosterErr } = await supabaseAdmin
      .from("mod_enrollments")
      .delete()
      .eq("student_id", data.studentId);
    if (rosterErr) throw rosterErr;

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(data.studentId);
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });

/**
 * Lists signed-in accounts that are not on any mod roster, so the teacher can
 * still delete them. Teacher-only.
 */
export const listUnrosteredAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: isTeacher, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "teacher",
    });
    if (roleErr) throw roleErr;
    if (!isTeacher) throw new Error("Only teachers can view accounts");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: enrolled, error: enrErr } = await supabaseAdmin
      .from("mod_enrollments")
      .select("student_id")
      .not("student_id", "is", null);
    if (enrErr) throw enrErr;
    const enrolledIds = new Set((enrolled ?? []).map((e) => e.student_id as string));

    const { data: teacherRows, error: trErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "teacher");
    if (trErr) throw trErr;
    const teacherIds = new Set((teacherRows ?? []).map((r) => r.user_id as string));

    const { data: profiles, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name");
    if (pErr) throw pErr;
    const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

    const accounts: { id: string; email: string; name: string | null }[] = [];
    let page = 1;
    for (;;) {
      const { data: list, error: uErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (uErr) throw new Error(uErr.message);
      const users = list?.users ?? [];
      for (const u of users) {
        if (enrolledIds.has(u.id) || teacherIds.has(u.id) || u.id === userId) continue;
        accounts.push({ id: u.id, email: u.email ?? "", name: names.get(u.id) ?? null });
      }
      if (users.length < 200) break;
      page += 1;
    }

    accounts.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
    return accounts;
  });
