/**
 * Makes an account a teacher (or, with --student, a student again).
 *
 *   npm run firebase:set-teacher -- --credentials key.json teacher@school.edu
 *
 * The person signs in to the studio once first so their login exists. Pass
 * --verify-email to mark an email/password login as confirmed without the
 * confirmation link.
 */
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { connect } from "./common";

const args = process.argv.slice(2);
const email = args.find((arg) => arg.includes("@"));
if (!email) {
  console.error("Usage: npm run firebase:set-teacher -- --credentials key.json teacher@school.edu");
  process.exit(1);
}
const role = args.includes("--student") ? "student" : "teacher";

const app = connect(args);
const auth = getAuth(app);
const user = await auth.getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(
    `No login for ${email} yet. Have them sign in to the studio once, then run this again.`,
  );
  process.exit(1);
}
if (!user.emailVerified) {
  if (args.includes("--verify-email")) {
    await auth.updateUser(user.uid, { emailVerified: true });
    console.log(`Marked ${email} as confirmed.`);
  } else
    console.log(
      `Note: ${email} hasn't confirmed their email, so they can't open the studio yet (or pass --verify-email).`,
    );
}

await getFirestore(app)
  .collection("user_roles")
  .doc(user.uid)
  .set({ id: user.uid, user_id: user.uid, role });
console.log(`${email} is now a ${role}. They may need to refresh the studio.`);
