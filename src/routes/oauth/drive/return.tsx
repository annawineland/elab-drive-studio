import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { completeStudentDriveConnection } from "@/lib/studentDrive.functions";

export const Route = createFileRoute("/oauth/drive/return")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Connecting Google Drive — Engineering Studio" }],
  }),
  component: OAuthReturn,
});

const CONNECTOR_ID = "google_drive";

function OAuthReturn() {
  const [message, setMessage] = useState("Finishing connection…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notifyOpenerAndClose = (
      type: "appUserConnectorOAuthComplete" | "appUserConnectorOAuthFailed",
    ) => {
      window.opener?.postMessage({ type, connectorId: CONNECTOR_ID }, window.location.origin);
      window.close();
    };

    if (params.get("success") !== "true") {
      setMessage(params.get("error") ?? "OAuth did not complete.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    const code = params.get("code");
    // Offline access disabled: consent succeeded with no key to exchange.
    if (!code) {
      if (params.get("offline_access_allowed") === "false") {
        notifyOpenerAndClose("appUserConnectorOAuthComplete");
        return;
      }
      setMessage("OAuth completed without an exchange code.");
      notifyOpenerAndClose("appUserConnectorOAuthFailed");
      return;
    }
    void completeStudentDriveConnection({ data: { code } })
      .then(() => notifyOpenerAndClose("appUserConnectorOAuthComplete"))
      .catch(() => {
        setMessage("Could not finish the connection.");
        notifyOpenerAndClose("appUserConnectorOAuthFailed");
      });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
