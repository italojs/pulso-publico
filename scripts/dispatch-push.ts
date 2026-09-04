import { loadEnvFile } from "node:process";

try { loadEnvFile(".env"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }

const [{ WebPushProvider }, { PushRepository }, { dispatchPendingPush }, { env }, database] = await Promise.all([
  import("#/alerts/push-provider"),
  import("#/alerts/push-repository"),
  import("#/jobs/dispatch-push"),
  import("#/server/config"),
  import("#/server/db/client"),
]);
const provider = new WebPushProvider({ subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY });
console.log(JSON.stringify(await dispatchPendingPush(new PushRepository(database.db), provider)));
await database.sql.end({ timeout: 5 });
