import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DriveFile } from "./drive.functions";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_drive";
const CLIENT_KEY_ENV = "GOOGLE_DRIVE_APP_USER_CONNECTOR_CLIENT_API_KEY";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/drive.readonly",
];

/** Whether the per-student Drive connector is configured and if this user is connected. */
export const getStudentDriveStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const configured = Boolean(process.env[CLIENT_KEY_ENV]);
    if (!configured) return { configured: false, connected: false };
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    return { configured: true, connected: Boolean(key) };
  });

/** Starts the per-student Google Drive OAuth flow. Returns the consent URL. */
export const startStudentDriveConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientAPIKey = process.env[CLIENT_KEY_ENV];
    if (!clientAPIKey) {
      throw new Error(
        "The student Drive connector isn't configured yet. Ask your workspace admin to add a Google Drive client in App User Connectors settings.",
      );
    }
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const returnUrl = new URL("/oauth/drive/return", request.url).toString();

    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");

    const existing = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey,
      returnUrl,
      connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

/** Exchanges the one-time OAuth code and stores the encrypted connection key. */
export const completeStudentDriveConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => input)
  .handler(async ({ data, context }) => {
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(
      GATEWAY_BASE_URL,
      data.code,
    );
    if (connectorId !== CONNECTOR_ID) {
      throw new Error("OAuth completion returned the wrong connector");
    }
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

/** Lists files the signed-in student can see — their own Drive AND shared drives (e.g. STEM III ESOS team folders). */
export const listStudentDriveFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (!connectionAPIKey) throw new Error("Google Drive is not connected for this user");

    const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
    const q = encodeURIComponent("trashed = false");
    const res = await callAsAppUser({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectionAPIKey,
      connectorId: CONNECTOR_ID,
      path:
        `/drive/v3/files?q=${q}` +
        `&fields=files(id,name,mimeType,webViewLink,modifiedTime)` +
        `&orderBy=modifiedTime+desc&pageSize=50` +
        `&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`,
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Student Drive list failed [${res.status}]: ${body}`);
      throw new Error(`Drive request failed (${res.status})`);
    }
    const data = (await res.json()) as { files?: DriveFile[] };
    return { files: data.files ?? [] };
  });

/** Disconnects the student's Drive and removes the stored key. */
export const disconnectStudentDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (connectionAPIKey) {
      const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
      await disconnectAppUser({
        gatewayBaseUrl: GATEWAY_BASE_URL,
        connectionAPIKey,
        connectorId: CONNECTOR_ID,
      });
    }
    await deleteConnectionKeyForUser(context.userId, CONNECTOR_ID);
    return { ok: true };
  });
