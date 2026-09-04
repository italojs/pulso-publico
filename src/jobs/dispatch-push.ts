import type { WebPushProvider } from "#/alerts/push-provider";
import type { PushRepository } from "#/alerts/push-repository";

export async function dispatchPendingPush(repository: PushRepository, provider: WebPushProvider, limit = 100) {
  if (!provider.available) return { selected: 0, sent: 0, expired: 0, failed: 0, disabled: true };
  const groups = Map.groupBy(await repository.listPending(limit), (item) => item.userAlertId);
  let sent = 0;
  let expired = 0;
  let failed = 0;
  for (const [userAlertId, deliveries] of groups) {
    let anySent = false;
    for (const delivery of deliveries) {
      try {
        const result = await provider.send(delivery.subscription, delivery.payload);
        if (result === "sent") {
          sent += 1;
          anySent = true;
        } else if (result === "expired") {
          expired += 1;
          await repository.removeEndpoint(delivery.subscription.endpoint);
        }
      } catch {
        failed += 1;
      }
    }
    if (anySent) await repository.markDelivered(userAlertId);
  }
  return { selected: groups.size, sent, expired, failed, disabled: false };
}
