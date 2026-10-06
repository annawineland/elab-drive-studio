import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  modifiedTime?: string;
}

/**
 * Lists guides and templates from the teacher's connected Google Drive
 * (workspace-level connector). Runs server-side so gateway credentials
 * never reach the browser.
 */
export const listStudioDriveResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    const connectionKey = process.env.GOOGLE_DRIVE_API_KEY;
    if (!lovableKey || !connectionKey) {
      return { configured: false, files: [] as DriveFile[] };
    }
    const q = encodeURIComponent(
      "(mimeType = 'application/pdf'" +
        " or mimeType = 'application/vnd.google-apps.document'" +
        " or mimeType = 'application/vnd.google-apps.spreadsheet'" +
        " or mimeType = 'application/vnd.google-apps.presentation'" +
        " or mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')" +
        " and trashed = false",
    );
    const url =
      `https://connector-gateway.lovable.dev/google_drive/drive/v3/files` +
      `?q=${q}&fields=files(id,name,mimeType,webViewLink,modifiedTime)` +
      `&orderBy=modifiedTime+desc&pageSize=60`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
      },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Drive list failed [${res.status}]: ${body}`);
      throw new Error(`Drive request failed (${res.status})`);
    }
    const data = (await res.json()) as { files?: DriveFile[] };
    return { configured: true, files: data.files ?? [] };
  });
