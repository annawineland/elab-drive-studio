import { firebaseAccess, type AccessSource } from "./access";
import { getFirebase } from "./config";
import { createDataClient, type DataClient } from "./db";
import { firestoreStore } from "./store";

let client: DataClient | undefined;
let access: AccessSource | undefined;

/** Live view of the signed-in user's role, teams and mods. */
export function getAccess(): AccessSource {
  if (!access) {
    const { auth, firestore } = getFirebase();
    access = firebaseAccess(auth, firestore);
  }
  return access;
}

function getClient(): DataClient {
  if (!client) client = createDataClient(firestoreStore(getFirebase().firestore), getAccess());
  return client;
}

// Import the data client like this:
// import { db } from "@/integrations/firebase/client";
// It is created on first use, so pages load even before Firebase is configured.
export const db: DataClient = {
  from: ((table: never) => getClient().from(table)) as unknown as DataClient["from"],
  rpc: ((fn: never, args?: never) => getClient().rpc(fn, args)) as unknown as DataClient["rpc"],
  channel: (name) => getClient().channel(name),
  removeChannel: (channel) => getClient().removeChannel(channel),
  deleteUser: (userId) => getClient().deleteUser(userId),
};
