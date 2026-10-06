/**
 * Sign-in, sign-up and account setup with Firebase Authentication.
 *
 * Accounts behave as they did with Supabase's confirm-email setting: an
 * email/password account can't sign in until its address is confirmed, and
 * the rules give unconfirmed accounts no data access.
 */
import {
  GoogleAuthProvider,
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from "firebase/auth";
import { db } from "./client";
import { getFirebase } from "./config";

/** An absolute link into this app, under the GitHub Pages base path. */
export function appUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), window.location.origin + import.meta.env.BASE_URL).href;
}

const continueTo = () => ({ url: appUrl("/auth") });

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Invalid login credentials",
  "auth/wrong-password": "Invalid login credentials",
  "auth/user-not-found": "Invalid login credentials",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/weak-password": "Password should be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a minute and try again.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection.",
  "auth/popup-blocked": "Popup blocked. Allow popups for this site and try again.",
  "auth/unauthorized-domain":
    "This site isn't allowed to sign in yet. Add its domain under Firebase Authentication → Settings → Authorized domains.",
  "auth/account-exists-with-different-credential":
    "This email already has a password account. Sign in with your password (or reset it) instead.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is invalid or was already used. Request a new one.",
};

/** A readable message for a Firebase Auth error. */
export function authErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  const code = (error as { code?: string } | null)?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  return error instanceof Error ? error.message.replace(/^Firebase: /, "") : fallback;
}

/** Creates the account and emails a confirmation link; the user signs in after confirming. */
export async function signUpWithEmail(email: string, password: string, fullName: string) {
  const { auth } = getFirebase();
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(user, { displayName: fullName });
  await sendEmailVerification(user, continueTo());
  await firebaseSignOut(auth);
}

export async function signInWithEmail(email: string, password: string) {
  const { auth } = getFirebase();
  const { user } = await signInWithEmailAndPassword(auth, email, password);
  if (user.emailVerified) return;
  // Re-send the link (it may have expired) and keep the account signed out until it's confirmed.
  await sendEmailVerification(user, continueTo()).catch(() => {});
  await firebaseSignOut(auth);
  throw new Error(`Confirm your email first. We sent a new confirmation link to ${email}.`);
}

/** Returns false when the user closed the Google popup. */
export async function signInWithGoogle(): Promise<boolean> {
  const { auth } = getFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
    return true;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
      return false;
    throw error;
  }
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(getFirebase().auth, email, continueTo());
}

/** For the reset-password page, when Firebase's email links point at this app. */
export async function checkPasswordResetCode(code: string): Promise<string> {
  return verifyPasswordResetCode(getFirebase().auth, code);
}

export async function resetPassword(code: string, password: string) {
  await confirmPasswordReset(getFirebase().auth, code, password);
}

export async function confirmEmail(code: string) {
  await applyActionCode(getFirebase().auth, code);
}

export async function signOut() {
  await firebaseSignOut(getFirebase().auth);
}

/**
 * Runs after every confirmed sign-in, standing in for the Postgres triggers on
 * auth.users: creates the profile on first sign-in, records the sign-in email
 * for teachers, and claims any roster spots added for that email (which also
 * makes the account a student).
 */
export async function prepareAccount(user: User) {
  const email = user.email?.toLowerCase() ?? "";

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id")
    .eq("id", user.uid)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) {
    const { error } = await db.from("profiles").insert({
      id: user.uid,
      full_name: user.displayName ?? "",
      avatar_url: user.photoURL ?? null,
    });
    if (error) throw error;
  }

  const { error: accountError } = await db
    .from("user_accounts")
    .upsert({ id: user.uid, email, email_verified: user.emailVerified });
  if (accountError) throw accountError;

  if (!email || !user.emailVerified) return;
  const { data: claimed, error: claimError } = await db
    .from("mod_enrollments")
    .update({ student_id: user.uid })
    .eq("email", email)
    .is("student_id", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) return;

  const { data: role, error: roleError } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.uid)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) {
    const { error } = await db.from("user_roles").insert({ user_id: user.uid, role: "student" });
    if (error) throw error;
  }
}
