import { describe, expect, it, vi } from "vitest";

import { WebPushProvider } from "#/alerts/push-provider";

const subscription = { endpoint: "https://push.example/subscription", keys: { p256dh: "key", auth: "auth" } };

describe("web push provider", () => {
  it("stays disabled when VAPID configuration is incomplete", async () => {
    const sender = { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
    const provider = new WebPushProvider({}, sender);

    expect(provider.available).toBe(false);
    await expect(provider.send(subscription, { title: "Mudança", body: "Descrição", url: "/alertas" })).resolves.toBe("disabled");
    expect(sender.sendNotification).not.toHaveBeenCalled();
  });

  it("configures VAPID and sends a JSON notification", async () => {
    const sender = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockResolvedValue({ statusCode: 201 }) };
    const provider = new WebPushProvider({ subject: "mailto:contato@example.com", publicKey: "public", privateKey: "private" }, sender);

    await expect(provider.send(subscription, { title: "Mudança", body: "Descrição", url: "/alertas" })).resolves.toBe("sent");
    expect(sender.setVapidDetails).toHaveBeenCalledWith("mailto:contato@example.com", "public", "private");
    expect(sender.sendNotification).toHaveBeenCalledWith(subscription, JSON.stringify({ title: "Mudança", body: "Descrição", url: "/alertas" }));
  });

  it("identifies expired browser subscriptions", async () => {
    const error = Object.assign(new Error("gone"), { statusCode: 410 });
    const sender = { setVapidDetails: vi.fn(), sendNotification: vi.fn().mockRejectedValue(error) };
    const provider = new WebPushProvider({ subject: "mailto:contato@example.com", publicKey: "public", privateKey: "private" }, sender);

    await expect(provider.send(subscription, { title: "Mudança", body: "Descrição", url: "/alertas" })).resolves.toBe("expired");
  });
});
