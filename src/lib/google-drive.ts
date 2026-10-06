/**
 * Google Drive from the browser, using Google Identity Services: the user
 * grants read-only Drive access in a Google popup and the page calls the
 * Drive API with that short-lived token (about an hour). Nothing is stored on
 * a server — the token stays in this tab's session storage.
 *
 * Needs VITE_GOOGLE_CLIENT_ID (an OAuth web client in the Firebase project's
 * Google Cloud console) and the Google Drive API enabled; see README.md.
 */
import { db } from "@/integrations/firebase/client";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string; message?: string }) => void;
      }): { requestAccessToken(options?: { prompt?: string }): void };
      revoke(token: string, done?: () => void): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_KEY = "studio-drive-token";
const FIELDS = "files(id,name,mimeType,webViewLink,modifiedTime)";

/** Guides and templates: PDFs, Docs, Sheets, Slides and Word files. */
const CLASS_DRIVE_QUERY =
  "(mimeType = 'application/pdf'" +
  " or mimeType = 'application/vnd.google-apps.document'" +
  " or mimeType = 'application/vnd.google-apps.spreadsheet'" +
  " or mimeType = 'application/vnd.google-apps.presentation'" +
  " or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')" +
  " and trashed = false";

export const driveConfigured = () => Boolean(CLIENT_ID);

function readToken(): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null") as {
      value: string;
      expiresAt: number;
    } | null;
    return saved && saved.expiresAt > Date.now() + 60_000 ? saved.value : null;
  } catch {
    return null;
  }
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

let gisLoading: Promise<GoogleIdentity> | undefined;

/**
 * Loads Google's sign-in script. Pages with a Connect button call this when
 * they mount, so the click can open the popup straight away (browsers block
 * popups that open after an await).
 */
export function preloadGoogleDrive(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () =>
      window.google ? resolve(window.google) : reject(new Error("Google sign-in did not load"));
    script.onerror = () => {
      gisLoading = undefined;
      reject(new Error("Could not reach Google. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

/** Asks the user for read-only Drive access in a Google popup. */
export async function connectGoogleDrive(): Promise<void> {
  if (!CLIENT_ID)
    throw new Error("Google Drive isn't set up yet. Ask your teacher to finish the setup.");
  const google = window.google?.accounts?.oauth2 ? window.google : await preloadGoogleDrive();
  await new Promise<void>((resolve, reject) => {
    google.accounts.oauth2
      .initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (!response.access_token) {
            reject(new Error(response.error_description ?? "Google Drive access was not granted."));
            return;
          }
          sessionStorage.setItem(
            TOKEN_KEY,
            JSON.stringify({
              value: response.access_token,
              expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
            }),
          );
          resolve();
        },
        error_callback: (error) =>
          reject(
            new Error(
              error.type === "popup_failed_to_open"
                ? "Popup blocked. Allow popups and try again."
                : "Google Drive connection was not completed.",
            ),
          ),
      })
      .requestAccessToken({ prompt: "" });
  });
}

export async function disconnectGoogleDrive(): Promise<void> {
  const token = readToken();
  clearToken();
  if (token && window.google?.accounts?.oauth2)
    await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, resolve));
}

async function listDrive(params: Record<string, string>): Promise<DriveFile[]> {
  const token = readToken();
  if (!token) throw new Error("Google Drive is not connected");
  const url = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
    fields: FIELDS,
    orderBy: "modifiedTime desc",
    ...params,
  })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    clearToken();
    throw new Error("Your Google Drive connection expired. Connect it again.");
  }
  if (!res.ok) {
    console.error(`Drive list failed [${res.status}]: ${await res.text()}`);
    throw new Error(`Drive request failed (${res.status})`);
  }
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

// ---- A student's own Drive (Evidence Vault)

/** Whether Drive is set up for the studio, and whether this tab holds a live connection. */
export async function getStudentDriveStatus() {
  return { configured: driveConfigured(), connected: Boolean(readToken()) };
}

/** Files the signed-in user can see — their own Drive AND shared drives (e.g. STEM III ESOS team folders). */
export async function listStudentDriveFiles() {
  const files = await listDrive({
    q: "trashed = false",
    pageSize: "50",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
    corpora: "allDrives",
  });
  return { files };
}

// ---- The class Drive (Resource Library)

/** The teacher's Drive guides and templates, as last synced into the studio. */
export async function listStudioDriveResources() {
  const { data, error } = await db
    .from("class_drive_files")
    .select("id, name, mime_type, web_view_link, modified_time")
    .order("modified_time", { ascending: false });
  if (error) throw error;
  const files: DriveFile[] = (data ?? []).map((f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mime_type,
    webViewLink: f.web_view_link ?? undefined,
    modifiedTime: f.modified_time ?? undefined,
  }));
  return { configured: files.length > 0, files };
}

/**
 * Teacher only: replaces the studio's copy of the class Drive list with the
 * guides and templates in the teacher's own Drive, so every student sees them.
 */
export async function syncClassDrive(): Promise<number> {
  if (!readToken()) await connectGoogleDrive();
  const files = await listDrive({ q: CLASS_DRIVE_QUERY, pageSize: "60" });
  const { error: clearError } = await db.from("class_drive_files").delete().neq("id", "");
  if (clearError) throw clearError;
  if (files.length) {
    const syncedAt = new Date().toISOString();
    const { error } = await db.from("class_drive_files").insert(
      files.map((f) => ({
        id: f.id,
        name: f.name,
        mime_type: f.mimeType,
        web_view_link: f.webViewLink ?? null,
        modified_time: f.modifiedTime ?? null,
        synced_at: syncedAt,
      })),
    );
    if (error) throw error;
  }
  return files.length;
}
